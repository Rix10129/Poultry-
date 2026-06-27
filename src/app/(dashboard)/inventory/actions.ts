"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { productSchema, batchSchema } from "@/lib/validations/inventory"
import { MovementType, Species, UnitType } from "@prisma/client"

type ActionState = { error: string } | null

async function getCompanyId() {
  const session = await getServerSession(authOptions)
  const companyId = (session?.user as any)?.companyId as string | undefined
  if (!companyId) throw new Error("Unauthorized")
  return companyId
}

function normalizeFormData(formData: FormData) {
  const raw: Record<string, unknown> = {}
  for (const [k, v] of formData.entries()) {
    raw[k] = v === "" ? undefined : v
  }
  return raw
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function createProduct(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let companyId: string
  try { companyId = await getCompanyId() } catch { return { error: "Not authenticated" } }

  const parsed = productSchema.safeParse(normalizeFormData(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Validation error" }
  }

  const { species, unit, subUnit, ...rest } = parsed.data

  try {
    await db.product.create({
      data: {
        companyId,
        ...rest,
        species: species as Species,
        unit: unit as UnitType,
        subUnit: subUnit ? (subUnit as UnitType) : undefined,
      },
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create product" }
  }

  revalidatePath("/inventory")
  redirect("/inventory")
}

export async function updateProduct(
  id: string,
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let companyId: string
  try { companyId = await getCompanyId() } catch { return { error: "Not authenticated" } }

  const parsed = productSchema.safeParse(normalizeFormData(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Validation error" }
  }

  const { species, unit, subUnit, ...rest } = parsed.data

  try {
    await db.product.updateMany({
      where: { id, companyId },
      data: {
        ...rest,
        species: species as Species,
        unit: unit as UnitType,
        subUnit: subUnit ? (subUnit as UnitType) : null,
      },
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to update product" }
  }

  revalidatePath("/inventory")
  revalidatePath(`/inventory/${id}`)
  redirect(`/inventory/${id}`)
}

export async function deleteProduct(id: string): Promise<void> {
  const companyId = await getCompanyId()
  await db.product.updateMany({
    where: { id, companyId },
    data: { isActive: false },
  })
  revalidatePath("/inventory")
  redirect("/inventory")
}

// ── Batches ───────────────────────────────────────────────────────────────────

export async function createBatch(
  productId: string,
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  let companyId: string
  try { companyId = await getCompanyId() } catch { return { error: "Not authenticated" } }

  // Verify the product belongs to this company
  const product = await db.product.findFirst({ where: { id: productId, companyId } })
  if (!product) return { error: "Product not found" }

  const parsed = batchSchema.safeParse(normalizeFormData(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Validation error" }
  }

  const { batchNumber, manufactureDate, expiryDate, purchasePrice, salePrice, quantity } = parsed.data

  // Check for duplicate batch number on same product
  const existing = await db.productBatch.findFirst({
    where: { batchNumber, productId, companyId },
  })
  if (existing) return { error: `Batch number "${batchNumber}" already exists for this product` }

  try {
    await db.$transaction(async (tx) => {
      const batch = await tx.productBatch.create({
        data: {
          companyId,
          productId,
          batchNumber,
          expiryDate: new Date(expiryDate),
          manufactureDate: manufactureDate ? new Date(manufactureDate) : null,
          purchasePrice,
          salePrice,
          quantity,
          initialQuantity: quantity,
        },
      })

      await tx.stockMovement.create({
        data: {
          companyId,
          productId,
          batchId: batch.id,
          type: MovementType.PURCHASE,
          quantity,
          reference: `BATCH:${batchNumber}`,
          notes: "Batch received into inventory",
        },
      })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to add batch" }
  }

  revalidatePath(`/inventory/${productId}`)
  revalidatePath("/inventory")
  return null
}

export async function adjustStock(
  productId: string,
  batchId: string,
  delta: number,
  notes: string
): Promise<void> {
  const companyId = await getCompanyId()

  const batch = await db.productBatch.findFirst({
    where: { id: batchId, companyId },
  })
  if (!batch) throw new Error("Batch not found")

  const newQty = batch.quantity + delta
  if (newQty < 0) throw new Error("Adjustment would make stock negative")

  await db.$transaction([
    db.productBatch.update({ where: { id: batchId }, data: { quantity: newQty } }),
    db.stockMovement.create({
      data: {
        companyId,
        productId,
        batchId,
        type: MovementType.ADJUSTMENT,
        quantity: delta,
        notes,
      },
    }),
  ])

  revalidatePath(`/inventory/${productId}`)
}
