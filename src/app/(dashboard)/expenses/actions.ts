"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ExpenseCategory, PaymentMode } from "@prisma/client"
import { writeAuditLog } from "@/lib/audit"

type ActionState = { error: string } | null

const VALID_CATEGORIES = Object.values(ExpenseCategory)
const VALID_MODES = Object.values(PaymentMode)

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  if (!session) return { error: "Not authenticated" }
  const companyId = (session.user as any).companyId as string
  const userId = (session.user as any).id as string

  const category = formData.get("category") as string
  const description = formData.get("description") as string
  const amountStr = formData.get("amount") as string
  const expenseDateStr = formData.get("expenseDate") as string
  const paymentMode = formData.get("paymentMode") as string
  const reference = (formData.get("reference") as string | null) || null
  const notes = (formData.get("notes") as string | null) || null

  if (!category || !VALID_CATEGORIES.includes(category as ExpenseCategory))
    return { error: "Invalid category" }
  if (!description?.trim()) return { error: "Description is required" }
  if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0)
    return { error: "Enter a valid amount" }
  if (!expenseDateStr) return { error: "Expense date is required" }
  if (!paymentMode || !VALID_MODES.includes(paymentMode as PaymentMode))
    return { error: "Invalid payment mode" }

  const expense = await db.expense.create({
    data: {
      companyId,
      userId,
      category: category as ExpenseCategory,
      description: description.trim(),
      amount: parseFloat(amountStr),
      expenseDate: new Date(expenseDateStr + "T12:00:00"),
      paymentMode: paymentMode as PaymentMode,
      reference: reference?.trim() || null,
      notes: notes?.trim() || null,
    },
  })

  redirect(`/expenses/${expense.id}`)
}

export async function deleteExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  if (!session) return { error: "Not authenticated" }
  const companyId = (session.user as any).companyId as string

  const id = formData.get("id") as string
  if (!id) return { error: "Missing ID" }

  const expense = await db.expense.findFirst({ where: { id, companyId } })
  if (!expense) return { error: "Expense not found" }

  await db.expense.delete({ where: { id } })

  await writeAuditLog({
    companyId,
    userId: (session.user as any).id,
    action: "DELETE",
    entity: "Expense",
    entityId: id,
    oldValues: { category: expense.category, amount: expense.amount.toString() },
  })

  redirect("/expenses")
}
