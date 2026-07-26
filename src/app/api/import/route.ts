import { NextResponse } from "next/server"
import { authorize, forbiddenResponse } from "@/lib/authorization"
import { decryptBackup, issueRestoreApproval, validateRestoredBackup, verifyRestoreApproval } from "@/lib/company-backup"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Two-phase restore gate. `stage` decrypts and validates the backup as an isolated empty-company
 * candidate and returns a short-lived, checksum-bound approval. Production restore is deliberately
 * refused unless that exact artifact passed staging. Database application is handled by the
 * operator recovery runbook, which preserves a rollback snapshot and maintenance window.
 */
export async function POST(request: Request) {
  const authorization = await authorize("BACKUP_RESTORE")
  if (!authorization.ok) return forbiddenResponse()
  const actor = authorization.actor
  if (actor.role !== "OWNER") return forbiddenResponse()
  const form = await request.formData(), file = form.get("file"), passphrase = String(form.get("passphrase") ?? process.env.BACKUP_ENCRYPTION_KEY ?? "")
  if (!(file instanceof File) || !passphrase) return NextResponse.json({ error: "Encrypted backup file and passphrase are required." }, { status: 400 })
  try {
    const backup = decryptBackup(JSON.parse(await file.text()), passphrase)
    const validation = validateRestoredBackup(backup)
    if (!validation.ok) return NextResponse.json({ error: "Test-company restoration validation failed.", validation }, { status: 422 })
    const signingKey = process.env.RESTORE_APPROVAL_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!signingKey) return NextResponse.json({ error: "RESTORE_APPROVAL_SECRET is not configured." }, { status: 503 })
    const action = String(form.get("action") ?? "stage")
    if (action === "stage") return NextResponse.json({ ok: true, phase: "test-company", validation, approvalToken: issueRestoreApproval(backup.manifest.checksum.value, actor.companyId, signingKey), expiresInSeconds: 900 })
    const approval = String(form.get("approvalToken") ?? "")
    if (!verifyRestoreApproval(approval, backup.manifest.checksum.value, actor.companyId, signingKey)) return NextResponse.json({ error: "Stage this exact backup before production recovery." }, { status: 409 })
    return NextResponse.json({ ok: true, phase: "production-approved", validation, message: "Artifact approved. Follow docs/BACKUP-RECOVERY.md to apply it during the recovery window." })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backup could not be read." }, { status: 400 })
  }
}
