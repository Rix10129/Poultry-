"use client"

import { useState } from "react"
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

type ExportFormat = "xlsx" | "csv"

interface ReportExportButtonProps {
  report: string
  label?: string
  format?: ExportFormat
}

export function ReportExportButton({ report, label, format = "xlsx" }: ReportExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  async function download() {
    setLoading(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      params.set("report", report)
      params.set("format", format)

      const res = await fetch(`/api/reports/export?${params.toString()}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error ?? "Export failed")
      }

      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? `${report}.${format}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not export this report. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const Icon = format === "csv" ? FileText : FileSpreadsheet

  return (
    <Button type="button" variant="outline" size="sm" onClick={download} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label ?? `Export ${format.toUpperCase()}`}
    </Button>
  )
}

export function ReportExportControls({ report }: { report: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ReportExportButton report={report} format="xlsx" label="Export Excel" />
      <ReportExportButton report={report} format="csv" label="Export CSV" />
    </div>
  )
}
