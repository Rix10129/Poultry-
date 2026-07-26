"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"

interface Props {
  report: string
  className?: string
}

export function ReportExportButton({ report, className = "" }: Props) {
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const href = `/api/reports/${report}/export${query ? `?${query}` : ""}`

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors ${className}`}
    >
      <Download className="h-4 w-4" />
      Export CSV
    </Link>
  )
}
