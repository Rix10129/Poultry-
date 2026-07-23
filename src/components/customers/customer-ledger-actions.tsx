"use client"

import { Download, Printer } from "lucide-react"

type CustomerLedgerActionsProps = {
  exportHref: string
}

export function CustomerLedgerActions({ exportHref }: CustomerLedgerActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={exportHref}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
      >
        <Download className="h-4 w-4" />
        Export Excel
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print / PDF
      </button>
    </div>
  )
}
