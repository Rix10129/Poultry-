import { Download } from "lucide-react"

export function ExportButtons({ endpoint, params }: { endpoint: string; params?: Record<string, string | undefined> }) {
  const query = new URLSearchParams(Object.entries(params ?? {}).filter((entry): entry is [string, string] => !!entry[1]))
  return <div className="inline-flex gap-2">
    {(["xlsx", "pdf"] as const).map(format => {
      query.set("format", format)
      return <a key={format} href={`${endpoint}?${query.toString()}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
        <Download className="h-3.5 w-3.5" />{format === "xlsx" ? "Excel" : "PDF"}
      </a>
    })}
  </div>
}
