import { NextResponse } from "next/server"
import { authorize, forbiddenResponse } from "@/lib/authorization"
import { dumpCompanyBackup } from "@/lib/company-backup-data"
import { encryptBackup } from "@/lib/company-backup"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const authorization = await authorize("BACKUP_RESTORE")
  if (!authorization.ok) return forbiddenResponse()
  const actor = authorization.actor
  if (actor.role !== "OWNER") return forbiddenResponse()
  const secret = request.headers.get("x-backup-passphrase") ?? process.env.BACKUP_ENCRYPTION_KEY
  if (!secret) return NextResponse.json({ error: "Set an X-Backup-Passphrase header or BACKUP_ENCRYPTION_KEY." }, { status: 503 })
  const backup = encryptBackup(await dumpCompanyBackup(actor.companyId), secret)
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(backup), { headers: { "Content-Type": "application/vnd.godown-ledger.backup+json", "Content-Disposition": `attachment; filename="company-backup-${date}.godown-backup"`, "Cache-Control": "no-store" } })
}
