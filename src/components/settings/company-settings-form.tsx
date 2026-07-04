"use client"

import { useActionState, useRef, useState } from "react"
import { updateCompany } from "@/app/(dashboard)/settings/actions"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"

const CURRENCIES = ["PKR", "USD", "AED", "SAR", "GBP", "EUR", "INR"]
const MAX_SIZE_MB = 2

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(company.logoUrl)
  const [logoBase64, setLogoBase64] = useState<string>(company.logoUrl ?? "")
  const [fileError, setFileError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Image must be under ${MAX_SIZE_MB} MB`)
      return
    }
    setFileError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setPreview(result)
      setLogoBase64(result)
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setPreview(null)
    setLogoBase64("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Hidden field carries the base64/URL value to the server action */}
      <input type="hidden" name="logoUrl" value={logoBase64} />

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

        {/* Logo upload */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Logo</label>

          {preview ? (
            <div className="flex items-center gap-4">
              <img
                src={preview}
                alt="Company logo"
                className="h-16 w-auto object-contain border border-slate-200 rounded-lg p-2 bg-slate-50"
              />
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Replace logo
                </button>
                <button
                  type="button"
                  onClick={removeLogo}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove logo
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-slate-400 hover:text-blue-500"
            >
              <Upload className="h-6 w-6 mb-1.5" />
              <span className="text-sm font-medium">Click to upload logo</span>
              <span className="text-xs mt-0.5">PNG, JPG, SVG — max {MAX_SIZE_MB} MB</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {fileError && (
            <p className="text-xs text-red-600 mt-1">{fileError}</p>
          )}
          <p className="text-xs text-slate-400 mt-1.5">
            The logo appears on printed invoices and PDFs. Recommended: square PNG with transparent background.
          </p>
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
