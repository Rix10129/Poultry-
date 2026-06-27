import { Package } from "lucide-react"

export const metadata = { title: "Inventory" }

export default function InventoryPage() {
  return <ModuleStub icon={Package} title="Inventory Management" module={2} description="Products with category/species, batch numbers, manufacture & expiry dates, multiple units (carton/vial/ml), purchase & sale price, current stock, reorder level, and supplier linkage." />
}

function ModuleStub({ icon: Icon, title, module, description }: { icon: React.ComponentType<{ className?: string }>; title: string; module: number; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-9rem)] text-center px-4">
      <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 mb-4">
        <Icon className="w-10 h-10 text-blue-500" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="text-slate-500 text-sm mt-2 max-w-md leading-relaxed">{description}</p>
      <span className="mt-5 px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full border border-blue-200">
        Module {module} — Up next
      </span>
    </div>
  )
}
