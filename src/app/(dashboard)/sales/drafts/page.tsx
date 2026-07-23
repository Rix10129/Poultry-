"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, FilePenLine, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getInvoiceDrafts, removeInvoiceDraft, type SaleInvoiceDraft } from "@/lib/offline-db"
import { formatCurrency } from "@/lib/utils"

export default function SaleDraftsPage() {
  const [drafts, setDrafts] = useState<SaleInvoiceDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getInvoiceDrafts()
      .then((loadedDrafts) => {
        setDrafts(loadedDrafts)
        setError(null)
      })
      .catch(() => setError("Could not load invoice drafts from this device"))
      .finally(() => setLoading(false))
  }, [])

  async function deleteDraft(id: string) {
    await removeInvoiceDraft(id)
    setDrafts(prev => prev.filter(draft => draft.id !== id))
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales/new" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Invoice Drafts</h1>
          <p className="text-sm text-slate-500">Drafts are stored on this device and expire after 30 days.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500">Loading drafts…</p>
        ) : drafts.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <FilePenLine className="h-10 w-10 text-slate-300 mx-auto" />
            <div>
              <h2 className="font-semibold text-slate-900">No draft invoices</h2>
              <p className="text-sm text-slate-500 mt-1">Save an invoice draft to resume it later.</p>
            </div>
            <Button asChild>
              <Link href="/sales/new">Create Invoice</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Updated</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Invoice Date</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Items</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Net Estimate</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Expires</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drafts.map(draft => (
                  <DraftRow key={draft.id} draft={draft} onDelete={() => deleteDraft(draft.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DraftRow({ draft, onDelete }: { draft: SaleInvoiceDraft; onDelete: () => void }) {
  const summary = useMemo(() => summarizeDraft(draft), [draft])

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-3 text-slate-700">{new Date(draft.updatedAt).toLocaleString()}</td>
      <td className="px-3 py-3 text-slate-700">{draft.invoiceDate || "—"}</td>
      <td className="px-3 py-3 text-right text-slate-700">{summary.itemCount}</td>
      <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatCurrency(summary.net)}</td>
      <td className="px-3 py-3 text-right text-slate-500">{new Date(draft.expiresAt).toLocaleDateString()}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          <Button size="sm" asChild>
            <Link href={`/sales/new?draftId=${draft.id}`}>Resume</Link>
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDelete} aria-label="Delete draft">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function summarizeDraft(draft: SaleInvoiceDraft) {
  try {
    const lines = JSON.parse(draft.linesJson) as Array<{ quantity: number; salePrice: number; discount: number; taxRate: number }>
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.salePrice * (1 - line.discount / 100), 0)
    const tax = lines.reduce((sum, line) => {
      const base = line.quantity * line.salePrice * (1 - line.discount / 100)
      return sum + base * line.taxRate / 100
    }, 0)
    const invoiceDiscount = parseFloat(draft.discountAmount) || 0
    return { itemCount: lines.length, net: Math.max(0, subtotal - invoiceDiscount + tax) }
  } catch {
    return { itemCount: 0, net: 0 }
  }
}
