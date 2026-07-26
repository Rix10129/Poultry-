import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import { authorize, forbiddenResponse } from "@/lib/authorization"
import { commitInventoryImport, ImportProblem, previewInventoryImport, rollbackInventoryImport } from "@/lib/inventory-import"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

function errorResponse(error: unknown) {
  if (error instanceof ImportProblem) return NextResponse.json({ error: error.message }, { status: error.status })
  if (typeof error === "object" && error && "code" in error && error.code === "P2034") {
    return NextResponse.json({ error: "The import conflicted with another import; preview and try again." }, { status: 409 })
  }
  console.error("Inventory import failed", error)
  return NextResponse.json({ error: "Import failed without changing any data." }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const authorization = await authorize("BACKUP_RESTORE")
  if (!authorization.ok) return forbiddenResponse()
  try {
    const body = await req.json()
    if (typeof body.sourceText !== "string" || body.sourceText.length > 25_000_000) throw new ImportProblem("A valid backup file of at most 25 MB is required", 400)
    let payload: unknown
    try { payload = JSON.parse(body.sourceText) } catch { throw new ImportProblem("The selected file is not valid JSON", 400) }
    const checksum = createHash("sha256").update(body.sourceText).digest("hex")
    const filename = typeof body.filename === "string" ? body.filename.slice(0, 255) : ""
    const preview = await previewInventoryImport(db, authorization.actor, filename, checksum, payload)
    if (body.mode === "preview") return NextResponse.json({ preview })
    if (body.mode !== "commit") throw new ImportProblem("Import mode must be preview or commit", 400)
    const result = await commitInventoryImport(db, authorization.actor, preview, body.confirmDuplicates === true)
    return NextResponse.json({ ok: true, ...result, message: `Import ${result.importId} committed ${result.rows} opening-stock rows.` })
  } catch (error) { return errorResponse(error) }
}

/** Controlled reversal: records compensating movements and preserves import evidence. */
export async function DELETE(req: NextRequest) {
  const authorization = await authorize("BACKUP_RESTORE")
  if (!authorization.ok) return forbiddenResponse()
  try {
    const body = await req.json()
    if (typeof body.importId !== "string") throw new ImportProblem("Import ID is required", 400)
    const result = await rollbackInventoryImport(db, authorization.actor, body.importId, typeof body.reason === "string" ? body.reason : "")
    return NextResponse.json({ ok: true, ...result, message: `Import ${result.importId} was reversed with ${result.reversedRows} compensating stock movements.` })
  } catch (error) { return errorResponse(error) }
}
