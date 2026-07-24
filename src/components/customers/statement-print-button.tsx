"use client"

import { Printer } from "lucide-react"

export function StatementPrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-colors"
    >
      <Printer className="h-4 w-4" />
      Print
    </button>
  )
}
