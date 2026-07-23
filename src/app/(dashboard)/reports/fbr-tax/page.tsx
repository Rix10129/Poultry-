import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { ReportExportButton } from "@/components/reports/report-export-button"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "FBR Tax Summary" }

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-PK", {
    month: "long",
    year: "numeric",
  })
}

async function getTaxData(companyId: string) {
  const now = new Date()
  const startYear = now.getFullYear() - 1

  // Last 12 months of invoice tax + purchase tax
  const [saleRows, purchaseRows] = await Promise.all([
    db.$queryRaw<{ year: number; month: number; tax: number }[]>`
      SELECT
        EXTRACT(YEAR  FROM "invoiceDate")::int AS year,
        EXTRACT(MONTH FROM "invoiceDate")::int AS month,
        SUM("taxAmount")::float               AS tax
      FROM "SaleInvoice"
      WHERE "companyId" = ${companyId}
        AND "invoiceDate" >= ${new Date(startYear, now.getMonth(), 1)}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
    db.$queryRaw<{ year: number; month: number; tax: number }[]>`
      SELECT
        EXTRACT(YEAR  FROM "orderDate")::int AS year,
        EXTRACT(MONTH FROM "orderDate")::int AS month,
        SUM("taxAmount")::float              AS tax
      FROM "PurchaseOrder"
      WHERE "companyId" = ${companyId}
        AND "orderDate" >= ${new Date(startYear, now.getMonth(), 1)}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
  ])

  // Build merged month map
  const map = new Map<string, { year: number; month: number; salesTax: number; inputTax: number }>()

  for (const r of saleRows) {
    const key = `${r.year}-${r.month}`
    const entry = map.get(key) ?? { year: r.year, month: r.month, salesTax: 0, inputTax: 0 }
    entry.salesTax = r.tax ?? 0
    map.set(key, entry)
  }
  for (const r of purchaseRows) {
    const key = `${r.year}-${r.month}`
    const entry = map.get(key) ?? { year: r.year, month: r.month, salesTax: 0, inputTax: 0 }
    entry.inputTax = r.tax ?? 0
    map.set(key, entry)
  }

  return Array.from(map.values()).sort(
    (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month
  )
}

export default async function FBRTaxPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const rows = await getTaxData(companyId)

  const totalSalesTax = rows.reduce((s, r) => s + r.salesTax, 0)
  const totalInputTax = rows.reduce((s, r) => s + r.inputTax, 0)
  const totalNet = totalSalesTax - totalInputTax

  return (
    <div className="space-y-6 max-w-4xl">

      <div className="flex justify-end">
        <ReportExportButton report="fbr-tax" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">FBR Tax Summary</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Monthly GST collected on sales vs. input tax on purchases — last 12 months
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Total Sales Tax</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalSalesTax)}</p>
          <p className="text-xs text-slate-400 mt-1">Collected from customers</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Total Input Tax</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalInputTax)}</p>
          <p className="text-xs text-slate-400 mt-1">Paid on purchases</p>
        </div>
        <div className={`rounded-xl border p-5 ${totalNet > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Net Tax Payable</p>
          <p className={`text-2xl font-bold ${totalNet > 0 ? "text-red-700" : "text-green-700"}`}>
            {formatCurrency(Math.abs(totalNet))}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {totalNet > 0 ? "Payable to FBR" : totalNet < 0 ? "Refundable from FBR" : "Nil"}
          </p>
        </div>
      </div>

      {/* Monthly breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Breakdown</h2>
        </div>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No tax data found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-slate-600">Month</th>
                <th className="text-right px-6 py-3 font-medium text-slate-600">Sales Tax (Output)</th>
                <th className="text-right px-6 py-3 font-medium text-slate-600">Input Tax</th>
                <th className="text-right px-6 py-3 font-medium text-slate-600">Net Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const net = row.salesTax - row.inputTax
                return (
                  <tr key={`${row.year}-${row.month}`} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {monthLabel(row.year, row.month)}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-700">
                      {formatCurrency(row.salesTax)}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-700">
                      {formatCurrency(row.inputTax)}
                    </td>
                    <td className={`px-6 py-3 text-right font-semibold ${net > 0.01 ? "text-red-600" : net < -0.01 ? "text-green-600" : "text-slate-400"}`}>
                      {Math.abs(net) < 0.01 ? "—" : (net > 0 ? "" : "−") + formatCurrency(Math.abs(net))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-900">Total</td>
                <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCurrency(totalSalesTax)}</td>
                <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCurrency(totalInputTax)}</td>
                <td className={`px-6 py-3 text-right font-bold ${totalNet > 0.01 ? "text-red-600" : totalNet < -0.01 ? "text-green-600" : "text-slate-400"}`}>
                  {formatCurrency(Math.abs(totalNet))}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg p-4">
        <strong className="text-slate-600">Note:</strong> This report shows tax amounts recorded on invoices and purchase orders.
        Verify with your accountant before filing. For FBR returns, use the official IRIS portal at{" "}
        <span className="font-mono">iris.fbr.gov.pk</span>.
      </div>
    </div>
  )
}
