import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  page: number
  total: number
  pageSize: number
  baseUrl: string // e.g. "/sales" or "/sales?q=foo"
}

export function Pagination({ page, total, pageSize, baseUrl }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const sep = baseUrl.includes("?") ? "&" : "?"
  const href = (p: number) => `${baseUrl}${sep}page=${p}`

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm text-slate-500">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Link>
        ) : (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-100 text-slate-300 cursor-not-allowed">
            <ChevronLeft className="h-4 w-4" />
            Prev
          </span>
        )}

        <span className="px-3 py-1.5 font-medium text-slate-700">
          {page} / {totalPages}
        </span>

        {page < totalPages ? (
          <Link
            href={href(page + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-100 text-slate-300 cursor-not-allowed">
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  )
}
