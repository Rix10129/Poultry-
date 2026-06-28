"use client"

import { useState } from "react"
import { FileSpreadsheet, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  days: number
  label: string
}

export function ReportDownloadButton({ days, label }: Props) {
  const [loading, setLoading] = useState(false)

  async function download() {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/download?days=${days}`)
      if (!res.ok) throw new Error("Failed to generate report")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `report-${days}days.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Could not generate report. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={download} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      {label}
    </Button>
  )
}
