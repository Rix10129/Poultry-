"use client"

import { useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

type PreviewRow = { rowNumber: number; supplierName: string; productName: string; batchNumber: string; unit: string; expiryDate: string; quantity: number; purchasePrice: number; salePrice: number; warnings: string[]; errors: string[] }
type Preview = { checksum: string; rows: PreviewRow[]; warnings: string[]; duplicateFile: boolean; valid: boolean }

export function ImportBackupForm() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [sourceText, setSourceText] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDuplicates, setConfirmDuplicates] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string; importId?: string } | null>(null)
  const [rollbackReason, setRollbackReason] = useState("")

  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setFilename(file?.name ?? null); setPreview(null); setNotice(null); setConfirmDuplicates(false)
    setSourceText(file ? await file.text() : "")
  }

  async function submit(mode: "preview" | "commit") {
    if (!filename || !sourceText) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, filename, sourceText, confirmDuplicates }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Import failed")
      if (mode === "preview") setPreview(data.preview)
      else { setNotice({ ok: true, message: data.message, importId: data.importId }); setPreview(null) }
    } catch (error) { setNotice({ ok: false, message: error instanceof Error ? error.message : "Unexpected import error" }) }
    finally { setBusy(false) }
  }

  async function rollback() {
    if (!notice?.importId) return
    setBusy(true)
    try {
      const response = await fetch("/api/import", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importId: notice.importId, reason: rollbackReason }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Rollback failed")
      setNotice({ ok: true, message: data.message }); setRollbackReason("")
    } catch (error) { setNotice(current => ({ ok: false, message: error instanceof Error ? error.message : "Unexpected rollback error", importId: current?.importId })) }
    finally { setBusy(false) }
  }

  const duplicateWarning = !!preview && (preview.duplicateFile || preview.rows.some(row => row.warnings.some(warning => warning.toLowerCase().includes("duplicate") || warning.includes("already exists"))))
  return <div className="space-y-4">
    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={selectFile} />
    <button type="button" onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
      <Upload className="h-4 w-4" />{filename ?? "Choose backup file (.json)"}
    </button>
    {filename && !preview && !notice?.ok && <Button type="button" disabled={busy} onClick={() => submit("preview")}>{busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Validating…</> : "Preview Import"}</Button>}

    {preview && <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div><h3 className="font-semibold text-slate-900">Review before committing</h3><p className="text-xs text-slate-500">SHA-256: <span className="font-mono">{preview.checksum}</span></p></div>
      {[...preview.warnings, ...preview.rows.flatMap(row => row.errors.map(error => `Row ${row.rowNumber}: ${error}`))].map(message => <p key={message} className="flex gap-2 text-sm text-amber-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>)}
      <div className="overflow-x-auto"><table className="min-w-full text-left text-xs">
        <thead className="border-b text-slate-500"><tr>{["Supplier", "Product", "Batch", "Unit", "Expiry", "Qty", "Purchase", "Sale", "Validation"].map(column => <th className="px-2 py-2" key={column}>{column}</th>)}</tr></thead>
        <tbody>{preview.rows.map(row => <tr className="border-b align-top" key={row.rowNumber}>
          <td className="px-2 py-2">{row.supplierName || "—"}</td><td className="px-2 py-2">{row.productName}</td><td className="px-2 py-2">{row.batchNumber}</td><td className="px-2 py-2">{row.unit}</td><td className="px-2 py-2">{new Date(row.expiryDate).toLocaleDateString()}</td><td className="px-2 py-2">{row.quantity}</td><td className="px-2 py-2">{row.purchasePrice}</td><td className="px-2 py-2">{row.salePrice}</td>
          <td className={row.errors.length ? "px-2 py-2 text-red-700" : row.warnings.length ? "px-2 py-2 text-amber-700" : "px-2 py-2 text-green-700"}>{[...row.errors, ...row.warnings].join("; ") || "Valid"}</td>
        </tr>)}</tbody>
      </table></div>
      {duplicateWarning && <label className="flex items-start gap-2 text-sm text-amber-800"><input className="mt-1" type="checkbox" checked={confirmDuplicates} onChange={event => setConfirmDuplicates(event.target.checked)} />I understand this file or supplier/batch data is duplicated and explicitly approve adding its quantities.</label>}
      <div className="flex gap-2"><Button type="button" disabled={busy || !preview.valid || (duplicateWarning && !confirmDuplicates)} onClick={() => submit("commit")}>{busy ? "Committing…" : "Commit Import"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button></div>
    </div>}
    {notice && <div className={`flex gap-3 rounded-lg border px-4 py-3 ${notice.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}<p className="text-sm">{notice.message}</p></div>}
    {notice?.importId && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-medium text-amber-900">Reverse this import</p><p className="text-xs text-amber-800">Creates compensating stock movements and retains the opening-stock and import history.</p><input className="h-9 w-full rounded-md border border-amber-300 bg-white px-3 text-sm" value={rollbackReason} onChange={event => setRollbackReason(event.target.value)} placeholder="Required reason (at least 5 characters)" /><Button type="button" variant="outline" disabled={busy || rollbackReason.trim().length < 5} onClick={rollback}>Reverse import</Button></div>}
  </div>
}
