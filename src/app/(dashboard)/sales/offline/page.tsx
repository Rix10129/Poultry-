"use client"

import { useEffect, useState } from "react"
import { kvGet } from "@/lib/offline-db"
import { InvoiceForm, type ProductOption, type CustomerOption } from "@/components/sales/invoice-form"
import { WifiOff, Loader2 } from "lucide-react"

export default function OfflineInvoicePage() {
  const [state, setState] = useState<"loading" | "ready" | "no-cache">("loading")
  const [products, setProducts] = useState<ProductOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  useEffect(() => {
    Promise.all([
      kvGet<CustomerOption[]>("customers"),
      kvGet<ProductOption[]>("products"),
    ]).then(([c, p]) => {
      if (!c || !p || c.length === 0) {
        setState("no-cache")
      } else {
        setCustomers(c)
        setProducts(p)
        setState("ready")
      }
    }).catch(() => setState("no-cache"))
  }, [])

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (state === "no-cache") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 max-w-sm mx-auto px-4">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
          <WifiOff className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">No offline data yet</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            You need to open this app at least once while connected to the internet so it can
            save your customers and products for offline use.
          </p>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Connect to the internet, open the app, and then you can use it offline next time.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          <strong>Offline mode</strong> — using data saved from your last online session.
          Your invoice will sync automatically when the internet returns.
        </span>
      </div>
      <InvoiceForm products={products} customers={customers} />
    </div>
  )
}
