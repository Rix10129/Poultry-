import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PaymentForm } from "@/components/customers/payment-form"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

const TYPE_LABELS: Record<string, string> = {
  FARM: "Farm",
  VET_SHOP: "Vet Shop",
  SUB_DEALER: "Sub-Dealer",
  RETAIL: "Retail",
}

const TYPE_VARIANTS: Record<string, "info" | "success" | "warning" | "default"> = {
  FARM: "info",
  VET_SHOP: "success",
  SUB_DEALER: "warning",
  RETAIL: "default",
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const c = await db.customer.findUnique({ where: { id }, select: { name: true } })
  return { title: c?.name ?? "Customer" }
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [customer, invoices, payments] = await Promise.all([
    db.customer.findFirst({ where: { id, companyId } }),
    db.saleInvoice.findMany({
      where: { customerId: id, companyId },
      orderBy: { invoiceDate: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        netAmount: true,
        paidAmount: true,
        paymentMode: true,
      },
    }),
    db.customerPayment.findMany({
      where: { customerId: id, companyId },
      orderBy: { paymentDate: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        paymentMode: true,
        paymentDate: true,
        reference: true,
        notes: true,
        invoiceId: true,
      },
    }),
  ])

  if (!customer) notFound()

  const openingBal = parseFloat(customer.openingBalance.toString())
  const totalNet = invoices.reduce((s, inv) => s + parseFloat(inv.netAmount.toString()), 0)
  const totalPaid = invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount.toString()), 0)
  const outstanding = openingBal + totalNet - totalPaid
  const creditLimit = parseFloat(customer.creditLimit.toString())
  const overLimit = creditLimit > 0 && outstanding > creditLimit

  // Unpaid/partial invoices for the payment dropdown
  const unpaidInvoices = invoices
    .filter((inv) => {
      const bal =
        parseFloat(inv.netAmount.toString()) - parseFloat(inv.paidAmount.toString())
      return bal > 0.001
    })
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      balance:
        parseFloat(inv.netAmount.toString()) - parseFloat(inv.paidAmount.toString()),
    }))

  // Build ledger: merge invoices + payments, sort by date
  type LedgerRow = {
    key: string
    date: Date
    type: "invoice" | "payment"
    description: string
    href?: string
    debit: number
    credit: number
  }

  const ledgerRows: LedgerRow[] = [
    ...invoices.map((inv) => ({
      key: `inv-${inv.id}`,
      date: inv.invoiceDate,
      type: "invoice" as const,
      description: inv.invoiceNumber,
      href: `/sales/${inv.id}`,
      debit: parseFloat(inv.netAmount.toString()),
      credit: parseFloat(inv.paidAmount.toString()),
    })),
    ...payments.map((p) => ({
      key: `pay-${p.id}`,
      date: p.paymentDate,
      type: "payment" as const,
      description: `Payment${p.reference ? ` — ${p.reference}` : ""}`,
      debit: 0,
      credit: parseFloat(p.amount.toString()),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  // Running balance starting from opening balance
  let runningBalance = openingBal
  const ledger = ledgerRows.map((row) => {
    runningBalance += row.debit - row.credit
    return { ...row, balance: runningBalance }
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/customers" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <Badge variant={TYPE_VARIANTS[customer.type] ?? "default"}>
                {TYPE_LABELS[customer.type] ?? customer.type}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
              {customer.area && ` · ${customer.area}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <PaymentForm customerId={id} unpaidInvoices={unpaidInvoices} />
          <Link href={`/customers/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Info + balance row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Contact Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Phone</dt>
            <dd className="text-slate-800">{customer.phone ?? "—"}</dd>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-800">{customer.email ?? "—"}</dd>
            <dt className="text-slate-500">Address</dt>
            <dd className="text-slate-800">{customer.address ?? "—"}</dd>
            <dt className="text-slate-500">Area</dt>
            <dd className="text-slate-800">{customer.area ?? "—"}</dd>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Account Summary</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Opening Balance</span>
              <span>{formatCurrency(openingBal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Invoiced</span>
              <span>{formatCurrency(totalNet)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Paid</span>
              <span>{formatCurrency(totalPaid)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold">
              <span className="text-slate-900">Outstanding</span>
              <span className={outstanding > 0.001 ? (overLimit ? "text-red-700" : "text-red-600") : "text-green-600"}>
                {outstanding > 0.001 ? formatCurrency(outstanding) : "—"}
              </span>
            </div>
            {creditLimit > 0 && (
              <div className={`flex justify-between text-xs ${overLimit ? "text-red-500" : "text-slate-400"}`}>
                <span>Credit Limit</span>
                <span>{formatCurrency(creditLimit)}{overLimit && " ⚠ over"}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Ledger</h2>
          <span className="text-xs text-slate-400">Oldest → Newest</span>
        </div>

        {ledger.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">No transactions yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Debit</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Credit</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {openingBal > 0.001 && (
                <tr className="bg-slate-50">
                  <td className="px-4 py-2 text-slate-500 text-xs">—</td>
                  <td className="px-4 py-2 text-slate-500 italic text-xs">Opening Balance</td>
                  <td className="px-4 py-2 text-right text-slate-500 text-xs">{formatCurrency(openingBal)}</td>
                  <td className="px-4 py-2 text-right text-slate-500 text-xs">—</td>
                  <td className="px-4 py-2 text-right text-xs font-medium text-slate-700">{formatCurrency(openingBal)}</td>
                </tr>
              )}
              {ledger.map((row) => (
                <tr key={row.key} className={`hover:bg-slate-50 ${row.type === "payment" ? "bg-green-50/30" : ""}`}>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.href ? (
                      <Link href={row.href} className="font-mono text-blue-600 hover:text-blue-700 font-medium">
                        {row.description}
                      </Link>
                    ) : (
                      <span className="text-green-700 font-medium">{row.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-green-700">
                    {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    <span className={row.balance > 0.001 ? "text-red-600" : "text-green-600"}>
                      {Math.abs(row.balance) < 0.001 ? "—" : formatCurrency(Math.abs(row.balance))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">
                  Outstanding Balance
                </td>
                <td className={`px-4 py-3 text-right font-bold ${outstanding > 0.001 ? "text-red-600" : "text-green-600"}`}>
                  {outstanding > 0.001 ? formatCurrency(outstanding) : "Settled ✓"}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
