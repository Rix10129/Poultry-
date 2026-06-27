import { ShoppingCart } from "lucide-react"

export const metadata = { title: "Sales" }

export default function SalesPage() {
  return <ComingSoon icon={ShoppingCart} title="Sales & Invoicing" module={4} description="Create invoices with FEFO batch auto-pick, line discounts, tax, cash and credit sales, printable PDF invoices, and WhatsApp-share links." />
}

function ComingSoon({ icon: Icon, title, module, description }: { icon: React.ComponentType<{ className?: string }>; title: string; module: number; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-9rem)] text-center px-4">
      <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 mb-4">
        <Icon className="w-10 h-10 text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="text-slate-500 text-sm mt-2 max-w-md leading-relaxed">{description}</p>
      <span className="mt-5 px-3 py-1.5 text-xs font-medium text-slate-500 rounded-full border border-slate-200">
        Module {module} — Coming soon
      </span>
    </div>
  )
}
