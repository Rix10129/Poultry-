import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { CompanySettingsForm } from "@/components/settings/company-settings-form"
import { ReportDownloadButton } from "@/components/settings/report-download-button"

export const dynamic = "force-dynamic"
export const metadata = { title: "Settings" }

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const actor = session.user as any

  const company = await db.company.findUnique({
    where: { id: actor.companyId },
    select: {
      name: true,
      phone: true,
      email: true,
      address: true,
      taxNumber: true,
      strnNumber: true,
      currency: true,
      logoUrl: true,
    },
  })

  if (!company) redirect("/login")

  const isOwner = actor.role === "OWNER"

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Company Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Business profile, logo, and regional settings
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {isOwner ? (
          <CompanySettingsForm company={company} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 text-sm">
              {[
                ["Company Name", company.name],
                ["Phone", company.phone ?? "—"],
                ["Email", company.email ?? "—"],
                ["NTN Number", company.taxNumber ?? "—"],
                ["STRN Number", company.strnNumber ?? "—"],
                ["Currency", company.currency],
                ["Address", company.address ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
                  <p className="text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            {company.logoUrl && (
              <div className="mt-5">
                <p className="text-xs font-medium text-slate-500 mb-1.5">Logo</p>
                <img
                  src={company.logoUrl}
                  alt="Company logo"
                  className="h-12 object-contain"
                />
              </div>
            )}
            <p className="text-xs text-amber-600 mt-5 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
              Only the Owner can edit company settings.
            </p>
          </>
        )}
      </div>

      {/* Excel Report Download — available to all roles */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Download Business Report</h2>
        <p className="text-sm text-slate-500 mb-4">
          Export a complete Excel report with Sales, Purchases, Inventory, and Receivables.
          Automatically emailed to the owner every 15 days.
        </p>
        <div className="flex flex-wrap gap-3">
          <ReportDownloadButton days={15} label="Last 15 Days" />
          <ReportDownloadButton days={30} label="Last 30 Days" />
          <ReportDownloadButton days={90} label="Last 90 Days" />
        </div>
      </div>
    </div>
  )
}
