"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType } from "@prisma/client"

type ActionState = { error: string } | null

export async function createStockAdjustment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const batchId = (formData.get("batchId") as string)?.trim()
  const productId = (formData.get("productId") as string)?.trim()
  const direction = formData.get("direction") as string // "add" | "subtract"
  const quantity = parseInt(formData.get("quantity") as string)
  const notes = (formData.get("notes") as string)?.trim() || null

  if (!batchId || !productId) return { error: "Product and batch are required" }
  if (!["add", "subtract"].includes(direction)) return { error: "Invalid adjustment direction" }
  if (!quantity || quantity < 1) return { error: "Quantity must be at least 1" }

  try {
    await db.$transaction(async (tx) => {
      const batch = await tx.productBatch.findFirst({
        where: { id: batchId, companyId, productId },
        include: { product: { select: { name: true } } },
      })
      if (!batch) throw new Error("Batch not found")

      if (direction === "subtract" && batch.quantity < quantity) {
        throw new Error(
          `Cannot remove ${quantity} — only ${batch.quantity} in stock`
        )
      }

      const delta = direction === "add" ? quantity : -quantity

      await tx.productBatch.update({
        where: { id: batchId },
        data: { quantity: { increment: delta } },
      })

      await tx.stockMovement.create({
        data: {
          companyId,
          productId,
          batchId,
          type: MovementType.ADJUSTMENT,
          quantity: delta,
          notes: notes ?? `Stock adjustment: ${direction === "add" ? "+" : "-"}${quantity}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to save adjustment" }
  }

  revalidatePath("/inventory")
  revalidatePath("/alerts")
  redirect("/inventory")
}
