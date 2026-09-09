import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { Resend } from "resend"
import { dumpCompanyBackup } from "@/lib/company-backup-data"
import { encryptBackup } from "@/lib/company-backup"
import { secureEquals } from "@/lib/secure-compare"

export const runtime = "nodejs"
export const maxDuration = 60

// ── helpers ──────────────────────────────────────────────────────────────────

async function dumpCompany(companyId: string) {
  const secret = process.env.BACKUP_ENCRYPTION_KEY
  if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY is required")
  return JSON.stringify(encryptBackup(await dumpCompanyBackup(companyId), secret))
}

async function uploadToR2(
  key: string,
  body: string,
  bucket: string,
  accountId: string,
  accessKeyId: string,
  secretKey: string
) {
  // Dynamically import so the route works even without R2 env vars
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } =
    await import("@aws-sdk/client-s3")

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey: secretKey },
  })

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/vnd.godown-ledger.backup+json",
    })
  )

  // Prune backups older than 30 days
  const cutoff = new Date(Date.now() - 30 * 86_400_000)
  const listed = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" }))
  const toDelete = (listed.Contents ?? []).filter(
    (o) => o.Key && o.LastModified && o.LastModified < cutoff
  )
  if (toDelete.length > 0) {
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: toDelete.map((o) => ({ Key: o.Key! })) },
      })
    )
  }
}

// ── main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || !secureEquals(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const resendKey = process.env.RESEND_API_KEY
  const r2AccountId = process.env.R2_ACCOUNT_ID
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY
  const r2Bucket = process.env.R2_BUCKET_NAME

  const useR2 = !!(r2AccountId && r2AccessKey && r2SecretKey && r2Bucket)
  const useEmail = !!(resendKey && adminEmail)

  if (!useR2 && !useEmail) {
    return NextResponse.json(
      {
        error:
          "No backup destination configured. " +
          "Set ADMIN_EMAIL + RESEND_API_KEY for email backups, " +
          "or R2_* vars for Cloudflare R2 storage.",
      },
      { status: 503 }
    )
  }

  const dateStr = new Date().toISOString().split("T")[0]
  const results: string[] = []
  const companies = await db.company.findMany({ select: { id: true, name: true } })

  // Collect attachments for email-mode
  const attachments: { filename: string; content: Buffer }[] = []

  for (const company of companies) {
    const safeName = company.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()

    try {
      const payload = await dumpCompany(company.id)
      const sizeKb = (payload.length / 1024).toFixed(1)

      if (useR2) {
        const key = `backups/${dateStr}/${safeName}-${company.id.slice(0, 8)}.godown-backup`
        await uploadToR2(key, payload, r2Bucket!, r2AccountId!, r2AccessKey!, r2SecretKey!)
        results.push(`✅ ${company.name}: uploaded to R2 (${sizeKb} KB)`)
      } else {
        // Email mode — collect as attachment
        attachments.push({
          filename: `${safeName}-${dateStr}.godown-backup`,
          content: Buffer.from(payload),
        })
        results.push(`✅ ${company.name}: prepared for email (${sizeKb} KB)`)
      }
    } catch (err) {
      results.push(`❌ ${company.name}: ${err}`)
    }
  }

  // ── Send email ────────────────────────────────────────────────────────────
  if (useEmail) {
    const resend = new Resend(resendKey)
    const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"
    const ok = results.filter((r) => r.startsWith("✅")).length
    const fail = results.filter((r) => r.startsWith("❌")).length
    const statusLabel = fail > 0 ? "⚠️ PARTIAL" : "✅ OK"

    await resend.emails
      .send({
        from,
        to: adminEmail!,
        subject: `[Godown Ledger] Backup ${statusLabel} — ${dateStr}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Nightly Backup Report</h2>
            <p style="color:#64748b">
              ${dateStr} — <strong>${ok}</strong> succeeded, <strong>${fail}</strong> failed
              ${attachments.length > 0 ? `— <strong>${attachments.length}</strong> file(s) attached` : ""}
            </p>
            <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;line-height:1.6">${results.join("\n")}</pre>
            <p style="color:#94a3b8;font-size:12px">
              ${useR2 ? `Stored in Cloudflare R2 bucket: ${r2Bucket}` : "Backup files are attached to this email. Save them to a safe location."}
            </p>
          </div>
        `,
        // In email-only mode, attach the JSON files
        ...(attachments.length > 0 ? { attachments } : {}),
      })
      .catch(() => results.push("⚠️  Failed to send summary email"))
  }

  return NextResponse.json({
    ok: true,
    date: dateStr,
    mode: useR2 ? "r2" : "email",
    companies: companies.length,
    results,
  })
}
