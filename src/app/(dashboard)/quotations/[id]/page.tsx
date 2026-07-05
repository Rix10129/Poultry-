import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DeleteButton } from "@/components/ui/delete-button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { updateQuotationStatus, deleteQuotation } from "@/app/(dashboard)/quotations/actions"
import { WhatsAppShareButton } from "@/components/sales/whatsapp-share-button"

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ id: string }> }

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  DRAFT: "default", SENT: "info", ACCEPTED: "success", REJECTED: "danger", EXPIRED: "warning",
}
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "ACCEPTED", "REJECTED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
}

export default async function QuotationDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [quote, company] = await Promise.all([
    db.quotation.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { name: true, phone: true, address: true } },
        user: { select: { name: true } },
        items: {
          include: { product: { select: { name: true } } },
          orderBy: { id: "asc" },
        },
      },
    }),
    db.company.findFirst({
      where: { id: companyId },
      select: { name: true, phone: true, address: true, email: true, taxNumber: true },
    }),
  ])

  if (!quote) notFound()

  const net = parseFloat(quote.netAmount.toString())
  const transitions = STATUS_TRANSITIONS[quote.status] ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:max-w-none print:p-8">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/quotations" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-mono">{quote.quoteNumber}</h1>
            <p className="text-sm text-slate-500">{formatDate(quote.quoteDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status transitions */}
          {transitions.map((next) => (
            <form key={next} action={updateQuotationStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={next} />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Mark {next.charAt(0) + next.slice(1).toLowerCase()}
              </button>
            </form>
          ))}
          {quote.status === "ACCEPTED" && (
            <Link href={`/sales/new?customerId=${quote.customerId ?? ""}`}>
              <Button size="sm">Convert to Invoice</Button>
            </Link>
          )}
          <WhatsAppShareButton
            invoiceNumber={quote.quoteNumber}
            invoiceDate={formatDate(quote.quoteDate)}
            netAmount={quote.netAmount.toString()}
            paidAmount="0"
            customerName={quote.customer?.name}
            customerPhone={quote.customer?.phone ?? undefined}
            companyName={company?.name ?? ""}
            isPaid={false}
          />
          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
            Print
          </button>
          <DeleteButton action={deleteQuotation} id={id} label="Delete"
            confirmMessage={`Delete quotation ${quote.quoteNumber}?`} />
          <Badge variant={STATUS_VARIANT[quote.status] ?? "default"}>
            {quote.status.charAt(0) + quote.status.slice(1).toLowerCase()}
          </Badge>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-6">
        <div className="flex justify-between items-center pb-4 border-b-2 border-slate-800">
          <div>
            <p className="text-2xl font-bold text-slate-900">{company?.name}</p>
            {company?.phone && <p className="text-xs text-slate-500">{company.phone}</p>}
            {company?.email && <p className="text-xs text-slate-500">{company.email}</p>}
            {company?.address && <p className="text-xs text-slate-500">{company.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold tracking-widest text-slate-500 uppercase">Quotation</p>
            <p className="text-2xl font-mono font-bold">{quote.quoteNumber}</p>
            <p className="text-sm text-slate-600">Date: {formatDate(quote.quoteDate)}</p>
            {quote.validUntil && <p className="text-sm text-slate-600">Valid Until: {formatDate(quote.validUntil)}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden print:border-none">
        {/* Meta */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {quote.customer?.name ?? <span className="italic text-slate-400">Walk-in</span>}
            </p>
            {quote.customer?.phone && <p className="text-xs text-slate-500">{quote.customer.phone}</p>}
            {quote.customer?.address && <p className="text-xs text-slate-500">{quote.customer.address}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Valid Until</p>
            <p className="mt-1 text-sm text-slate-900">
              {quote.validUntil ? formatDate(quote.validUntil) : "No expiry set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Prepared By</p>
            <p className="mt-1 text-sm text-slate-900">{quote.user?.name}</p>
          </div>
        </div>

        {/* Items */}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">#</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Product</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Qty</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Unit Price</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Disc%</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.items.map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-6 py-3 font-medium text-slate-900">{item.product.name}</td>
                <td className="px-6 py-3 text-right text-slate-700">{item.quantity} {item.unit}</td>
                <td className="px-6 py-3 text-right text-slate-700">{formatCurrency(parseFloat(item.salePrice.toString()))}</td>
                <td className="px-6 py-3 text-right text-slate-500">
                  {parseFloat(item.discount.toString()) > 0 ? `${parseFloat(item.discount.toString())}%` : "—"}
                </td>
                <td className="px-6 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency(parseFloat(item.totalAmount.toString()))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-slate-200 px-6 py-4">
          <div className="ml-auto w-64 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(parseFloat(quote.totalAmount.toString()))}</span>
            </div>
            {parseFloat(quote.discountAmount.toString()) > 0.001 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span>− {formatCurrency(parseFloat(quote.discountAmount.toString()))}</span>
              </div>
            )}
            {parseFloat(quote.taxAmount.toString()) > 0.001 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span>{formatCurrency(parseFloat(quote.taxAmount.toString()))}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
              <span>Total</span>
              <span>{formatCurrency(net)}</span>
            </div>
          </div>
        </div>

        {quote.notes && (
          <div className="border-t border-slate-200 px-6 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Notes / Terms</p>
            <p className="text-sm text-slate-700 whitespace-pre-line">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
