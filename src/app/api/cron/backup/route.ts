import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3"
import { Resend } from "resend"

export const runtime = "nodejs"
export const maxDuration = 60

function makeR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const bucket = process.env.R2_BUCKET_NAME
  if (
    !bucket ||
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    return NextResponse.json(
      { error: "R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME" },
      { status: 503 }
    )
  }

  const r2 = makeR2Client()
  const dateStr = new Date().toISOString().split("T")[0]
  const results: string[] = []

  // ── 1. Back up every company ──────────────────────────────────────────────
  const companies = await db.company.findMany({ select: { id: true, name: true } })

  for (const company of companies) {
    try {
      const [customers, suppliers, products, invoices, purchases, expenses, payments] =
        await Promise.all([
          db.customer.findMany({ where: { companyId: company.id } }),
          db.supplier.findMany({ where: { companyId: company.id } }),
          db.product.findMany({
            where: { companyId: company.id },
            include: { batches: true },
          }),
          db.saleInvoice.findMany({
            where: { companyId: company.id },
            include: { items: true },
            orderBy: { invoiceDate: "desc" },
          }),
          db.purchaseOrder.findMany({
            where: { companyId: company.id },
            include: { items: true },
            orderBy: { orderDate: "desc" },
          }),
          db.expense.findMany({ where: { companyId: company.id } }),
          db.customerPayment.findMany({ where: { companyId: company.id } }),
        ])

      const payload = JSON.stringify({
        backupDate: new Date().toISOString(),
        company: company.name,
        companyId: company.id,
        counts: {
          customers: customers.length,
          suppliers: suppliers.length,
          products: products.length,
          invoices: invoices.length,
          purchases: purchases.length,
          expenses: expenses.length,
          payments: payments.length,
        },
        data: { customers, suppliers, products, invoices, purchases, expenses, payments },
      })

      const safeName = company.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      const key = `backups/${dateStr}/${safeName}-${company.id.slice(0, 8)}.json`

      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: payload,
          ContentType: "application/json",
          Metadata: { company: company.name, backupDate: dateStr },
        })
      )

      results.push(`✅ ${company.name}: backed up (${(payload.length / 1024).toFixed(1)} KB)`)
    } catch (err) {
      results.push(`❌ ${company.name}: ${err}`)
    }
  }

  // ── 2. Delete backups older than 30 days ─────────────────────────────────
  const cutoff = new Date(Date.now() - 30 * 86_400_000)
  try {
    const listed = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" })
    )
    const toDelete = (listed.Contents ?? []).filter(
      (obj) => obj.Key && obj.LastModified && obj.LastModified < cutoff
    )
    if (toDelete.length > 0) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: toDelete.map((o) => ({ Key: o.Key! })) },
        })
      )
      results.push(`🗑️  Deleted ${toDelete.length} backup file(s) older than 30 days`)
    }
  } catch {
    results.push("⚠️  Could not prune old backups")
  }

  // ── 3. Email admin summary ────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL
  if (process.env.RESEND_API_KEY && adminEmail) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"
    const ok = results.filter((r) => r.startsWith("✅")).length
    const fail = results.filter((r) => r.startsWith("❌")).length

    await resend.emails
      .send({
        from,
        to: adminEmail,
        subject: `[Poultry Vet] Backup ${fail > 0 ? "⚠️ PARTIAL" : "✅ OK"} — ${dateStr}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Nightly Backup Report</h2>
            <p style="color:#64748b">${dateStr} — ${ok} succeeded, ${fail} failed</p>
            <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;line-height:1.6">
${results.join("\n")}
            </pre>
            <p style="color:#94a3b8;font-size:12px">Backups stored in Cloudflare R2 bucket: ${bucket}</p>
          </div>
        `,
      })
      .catch(() => null)
  }

  return NextResponse.json({ ok: true, date: dateStr, companies: companies.length, results })
}
