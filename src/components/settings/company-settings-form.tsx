"use client"

import { useActionState } from "react"
import { updateCompany } from "@/app/(dashboard)/settings/actions"
import { Button } from "@/components/ui/button"

const CURRENCIES = ["PKR", "USD", "AED", "SAR", "GBP", "EUR", "INR"]

interface Props {
  company: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
    taxNumber: string | null
    strnNumber: string | null
    currency: string
    logoUrl: string | null
  }
}

export function CompanySettingsForm({ company }: Props) {
  const [state, formAction, pending] = useActionState(updateCompany, null)

  return (
    <form action={formAction} className="space-y-5">
      {state && "error" in state && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state && "success" in state && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {state.success}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={company.name}
            placeholder="Your Business Name"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            This name appears in the sidebar and on all printed invoices.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={company.phone ?? ""}
            placeholder="+92 300 0000000"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={company.email ?? ""}
            placeholder="info@yourcompany.com"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">NTN Number</label>
          <input
            name="taxNumber"
            defaultValue={company.taxNumber ?? ""}
            placeholder="1234567"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">STRN Number</label>
          <input
            name="strnNumber"
            defaultValue={company.strnNumber ?? ""}
            placeholder="12-34-5678-001-23"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
          <select
            name="currency"
            defaultValue={company.currency}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
          <textarea
            name="address"
            rows={2}
            defaultValue={company.address ?? ""}
            placeholder="123 Industrial Area, Lahore, Pakistan"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Logo URL</label>
          <input
            name="logoUrl"
            type="url"
            defaultValue={company.logoUrl ?? ""}
            placeholder="https://yourcompany.com/logo.png"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Paste a direct link to your logo image. Recommended: 200×200px PNG with transparent background.
            Upload your image to <span className="font-medium">imgur.com</span> or <span className="font-medium">imgbb.com</span> for a free permanent link.
          </p>
          {company.logoUrl && (
            <div className="mt-3 flex items-center gap-3">
              <img
                src={company.logoUrl}
                alt="Current logo"
                className="h-10 object-contain border border-slate-200 rounded-lg p-1"
              />
              <span className="text-xs text-slate-400">Current logo</span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </form>
  )
}
