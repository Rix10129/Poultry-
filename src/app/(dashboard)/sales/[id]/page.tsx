import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { PrintButton } from "@/components/sales/print-button"
import { DeleteButton } from "@/components/ui/delete-button"
import { WhatsAppShareButton } from "@/components/sales/whatsapp-share-button"
import { deleteInvoice } from "@/app/(dashboard)/sales/actions"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const inv = await db.saleInvoice.findUnique({ where: { id }, select: { invoiceNumber: true } })
  return { title: inv?.invoiceNumber ?? "Invoice" }
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as { companyId: string }).companyId

  const [invoice, company] = await Promise.all([
    db.saleInvoice.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { name: true, phone: true, address: true } },
        user: { select: { name: true, role: true } },
        items: {
          include: {
            product: { select: { name: true, unit: true } },
            batch: { select: { batchNumber: true, expiryDate: true } },
          },
          orderBy: { id: "asc" },
        },
      },
    }),
    db.company.findFirst({
      where: { id: companyId },
      select: { name: true, logoUrl: true, phone: true, address: true, email: true, taxNumber: true, strnNumber: true },
    }),
  ])

  if (!invoice) notFound()

  const net = parseFloat(invoice.netAmount.toString())
  const paid = parseFloat(invoice.paidAmount.toString())
  const balance = net - paid
  const isPaid = balance <= 0.001
  const isPartial = !isPaid && paid > 0.001

  return (
    <div className="invoice-print-compact max-w-4xl mx-auto space-y-6 print:max-w-none print:space-y-0 print:p-0">
      {/* Screen header — hidden when printing */}
      <div className="flex items-start justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/sales" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-mono">{invoice.invoiceNumber}</h1>
            <p className="text-sm text-slate-500">{formatDate(invoice.invoiceDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/sales/returns/new?invoiceId=${invoice.id}`}>
            <Button variant="outline" size="sm">
              <RotateCcw className="h-4 w-4" />
              Return
            </Button>
          </Link>
          <WhatsAppShareButton
            invoiceNumber={invoice.invoiceNumber}
            invoiceDate={formatDate(invoice.invoiceDate)}
            netAmount={invoice.netAmount.toString()}
            paidAmount={invoice.paidAmount.toString()}
            customerName={invoice.customer?.name}
            customerPhone={invoice.customer?.phone ?? undefined}
            companyName={company?.name ?? ""}
            isPaid={isPaid}
          />
          <PrintButton />
          <DeleteButton
            action={deleteInvoice}
            id={invoice.id}
            label="Delete"
            confirmMessage={`Delete invoice ${invoice.invoiceNumber}? Stock will be restored. This cannot be undone.`}
          />
          {isPaid ? (
            <Badge variant="success">Paid</Badge>
          ) : isPartial ? (
            <Badge variant="warning">Partial</Badge>
          ) : (
            <Badge variant="danger">Unpaid</Badge>
          )}
        </div>
      </div>

      {/* Print header — company branding (only visible when printing) */}
      <div className="hidden print:block print:mb-2 invoice-print-header">
        <div className="flex justify-between items-center pb-2 border-b-2 border-slate-800">
          {/* Left: Company logo + name */}
          <div className="flex items-center gap-3">
            {company?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logoUrl}
                alt={company.name}
                className="h-10 w-auto object-contain"
              />
            )}
            <div>
              <p className="text-lg font-bold text-slate-900">{company?.name ?? "Company"}</p>
              {company?.phone && <p className="text-xs text-slate-500 mt-0.5">{company.phone}</p>}
              {company?.email && <p className="text-xs text-slate-500">{company.email}</p>}
              {company?.address && <p className="text-xs text-slate-500">{company.address}</p>}
              {company?.taxNumber && <p className="text-xs text-slate-500">NTN: {company.taxNumber}</p>}
              {company?.strnNumber && <p className="text-xs text-slate-500">STRN: {company.strnNumber}</p>}
            </div>
          </div>
          {/* Right: Invoice info */}
          <div className="text-right">
            <p className="text-xs font-bold tracking-widest text-slate-500 uppercase">Sale Invoice</p>
            <p className="text-xl font-mono font-bold text-slate-900 mt-0.5">{invoice.invoiceNumber}</p>
            <p className="text-xs text-slate-600 mt-0.5">Date: {formatDate(invoice.invoiceDate)}</p>
            {invoice.dueDate && <p className="text-xs text-slate-600">Due: {formatDate(invoice.dueDate)}</p>}
            <p className={`text-xs font-bold mt-0.5 print:hidden ${isPaid ? "text-green-600" : isPartial ? "text-yellow-600" : "text-red-600"}`}>
              Status: {isPaid ? "PAID ✓" : isPartial ? "PARTIAL" : "UNPAID"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden print:border-none print:rounded-none print:overflow-visible">
        {/* Invoice meta */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-4 print:px-0 print:py-2 print:gap-x-4 print:gap-y-1 print:text-xs">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 print:mt-0 print:text-xs">
              {invoice.customer?.name ?? <span className="italic text-slate-400">Walk-in</span>}
            </p>
            {invoice.customer?.phone && (
              <p className="text-xs text-slate-500">{invoice.customer.phone}</p>
            )}
            {invoice.customer?.address && (
              <p className="text-xs text-slate-500">{invoice.customer.address}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Payment Mode</p>
            <p className="mt-1 text-sm text-slate-900 capitalize print:mt-0 print:text-xs">
              {invoice.paymentMode.toLowerCase().replace("_", " ")}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Prepared By</p>
            <p className="mt-1 text-sm text-slate-900 print:mt-0 print:text-xs">{invoice.user?.name ?? "—"}</p>
            {invoice.dueDate && (
              <>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-2 print:hidden">Due Date</p>
                <p className="text-sm text-slate-900 print:hidden">{formatDate(invoice.dueDate)}</p>
              </>
            )}
          </div>
        </div>

        {/* Items table */}
        <table className="invoice-print-table w-full text-sm print:text-[10px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">#</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">Product / Batch</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">Qty</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">Unit Price</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">Disc%</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">Tax%</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 print:px-1.5 print:py-1">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item, idx) => {
              const lineTotal = parseFloat(item.totalAmount.toString())
              return (
                <tr key={item.id} className="invoice-print-row hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-400 print:px-1.5 print:py-1">{idx + 1}</td>
                  <td className="px-6 py-3 print:px-1.5 print:py-1">
                    <p className="font-medium text-slate-900 print:text-[10px]">{item.product.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 print:mt-0 print:gap-1">
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded print:bg-transparent print:px-0 print:py-0 print:text-[9px]">
                        {item.batch.batchNumber}
                      </span>
                      <span className="print:hidden"><ExpiryBadge expiryDate={item.batch.expiryDate.toISOString()} /></span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700 print:px-1.5 print:py-1">
                    {item.quantity} {item.product.unit}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700 print:px-1.5 print:py-1">
                    {formatCurrency(parseFloat(item.salePrice.toString()))}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500 print:px-1.5 print:py-1">
                    {parseFloat(item.discount.toString()) > 0
                      ? `${parseFloat(item.discount.toString())}%`
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500 print:px-1.5 print:py-1">
                    {parseFloat(item.taxRate.toString()) > 0
                      ? `${parseFloat(item.taxRate.toString())}%`
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-slate-900 print:px-1.5 print:py-1">
                    {formatCurrency(lineTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="invoice-print-totals border-t border-slate-200 px-6 py-4 print:px-0 print:py-2">
          <div className="ml-auto w-64 space-y-2 text-sm print:w-56 print:space-y-0.5 print:text-[10px]">
            <TotalRow label="Subtotal" value={formatCurrency(parseFloat(invoice.totalAmount.toString()))} />
            {parseFloat(invoice.discountAmount.toString()) > 0.001 && (
              <TotalRow
                label="Discount"
                value={`− ${formatCurrency(parseFloat(invoice.discountAmount.toString()))}`}
              />
            )}
            {parseFloat(invoice.taxAmount.toString()) > 0.001 && (
              <TotalRow label="Tax" value={formatCurrency(parseFloat(invoice.taxAmount.toString()))} />
            )}
            <div className="border-t border-slate-200 pt-2">
              <TotalRow label="Net Amount" value={formatCurrency(net)} bold />
            </div>
            <TotalRow label="Amount Received" value={formatCurrency(paid)} />
            <div
              className={`flex justify-between font-bold text-base pt-1 print:text-xs print:pt-0.5 ${
                isPaid
                  ? "text-green-600"
                  : balance < -0.001
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              <span>
                {isPaid
                  ? "Settled ✓"
                  : balance < -0.001
                  ? "Change Due"
                  : "Balance Due"}
              </span>
              <span>{Math.abs(balance) < 0.001 ? "—" : formatCurrency(Math.abs(balance))}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes?.trim() && (
          <div className="invoice-print-notes border-t border-slate-200 px-6 py-4 print:px-0 print:py-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 print:mb-0.5">Notes</p>
            <p className="text-sm text-slate-700 print:text-[10px]">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
