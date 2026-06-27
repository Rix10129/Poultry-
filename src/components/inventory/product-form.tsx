"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createProduct, updateProduct } from "@/app/(dashboard)/inventory/actions"

const SPECIES = ["BROILER", "LAYER", "CATTLE", "SHEEP", "GOAT", "FISH", "GENERAL"]
const UNITS = ["CARTON", "VIAL", "ML", "TABLET", "SACHET", "KG", "GRAM", "LITER", "PIECE"]

type CategoryOption = { id: string; name: string }
type SupplierOption = { id: string; name: string }

type ProductData = {
  id: string
  name: string
  genericName: string | null
  categoryId: string | null
  supplierId: string | null
  species: string
  unit: string
  subUnit: string | null
  unitsPerPack: number | null
  salePrice: string
  purchasePrice: string
  reorderLevel: number
  taxRate: string
  description: string | null
}

interface ProductFormProps {
  categories: CategoryOption[]
  suppliers: SupplierOption[]
  product?: ProductData
}

function capitalize(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export function ProductForm({ categories, suppliers, product }: ProductFormProps) {
  const action = product ? updateProduct.bind(null, product.id) : createProduct
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Product Name *</Label>
          <Input id="name" name="name" defaultValue={product?.name} required placeholder="e.g. Tylosin 200" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="genericName">Generic / Salt Name</Label>
          <Input id="genericName" name="genericName" defaultValue={product?.genericName ?? ""} placeholder="e.g. Tylosin Tartrate" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Category *</Label>
          <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? ""} required>
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supplierId">Default Supplier</Label>
          <Select id="supplierId" name="supplierId" defaultValue={product?.supplierId ?? ""}>
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="species">Species *</Label>
          <Select id="species" name="species" defaultValue={product?.species ?? "GENERAL"} required>
            {SPECIES.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Primary Unit *</Label>
          <Select id="unit" name="unit" defaultValue={product?.unit ?? "PIECE"} required>
            {UNITS.map((u) => <option key={u} value={u}>{capitalize(u)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subUnit">Sub Unit</Label>
          <Select id="subUnit" name="subUnit" defaultValue={product?.subUnit ?? ""}>
            <option value="">None</option>
            {UNITS.map((u) => <option key={u} value={u}>{capitalize(u)}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="unitsPerPack">Units per Pack</Label>
          <Input id="unitsPerPack" name="unitsPerPack" type="number" min="1" step="1"
            defaultValue={product?.unitsPerPack ?? ""} placeholder="e.g. 100" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchasePrice">Purchase Price *</Label>
          <Input id="purchasePrice" name="purchasePrice" type="number" min="0.01" step="0.01"
            defaultValue={product?.purchasePrice ?? ""} required placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salePrice">Sale Price *</Label>
          <Input id="salePrice" name="salePrice" type="number" min="0.01" step="0.01"
            defaultValue={product?.salePrice ?? ""} required placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reorderLevel">Reorder Level</Label>
          <Input id="reorderLevel" name="reorderLevel" type="number" min="0" step="1"
            defaultValue={product?.reorderLevel ?? 10} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="taxRate">Tax Rate (%)</Label>
          <Input id="taxRate" name="taxRate" type="number" min="0" max="100" step="0.01"
            defaultValue={product?.taxRate ?? "0"} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3}
          defaultValue={product?.description ?? ""} placeholder="Optional product notes" />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={pending}>
          {product ? "Update Product" : "Create Product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
