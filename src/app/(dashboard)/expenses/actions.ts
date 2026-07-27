"use server"

import { db } from "@/lib/db"
import { getActiveSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { ExpenseCategory, PaymentMode } from "@prisma/client"
import { writeAuditLog } from "@/lib/audit"
import { postExpense, reversePosting } from "@/lib/accounting/posting-service"
import { assertDocumentCanBeDeleted, recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"

type ActionState = { error: string } | null

const VALID_CATEGORIES = Object.values(ExpenseCategory)
const VALID_MODES = Object.values(PaymentMode)

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
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

  const expense = await db.$transaction(async tx => {
    const created = await tx.expense.create({ data: {
      status: "POSTED",
      companyId,
      userId,
      category: category as ExpenseCategory,
      description: description.trim(),
      amount: parseFloat(amountStr),
      expenseDate: new Date(expenseDateStr + "T12:00:00"),
      paymentMode: paymentMode as PaymentMode,
      reference: reference?.trim() || null,
      notes: notes?.trim() || null,
    } })
    await postExpense(tx, { companyId, sourceId: created.id, number: created.id, date: created.expenseDate, amount: created.amount, paymentMode: created.paymentMode, description: created.description })
    return created
  })

  redirect(`/expenses/${expense.id}`)
}

export async function deleteExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  if (!session) return { error: "Not authenticated" }
  const companyId = (session.user as any).companyId as string

  const id = formData.get("id") as string
  if (!id) return { error: "Missing ID" }

  const expense = await db.expense.findFirst({ where: { id, companyId } })
  if (!expense) return { error: "Expense not found" }
  const postings = await db.journalEntry.count({ where: { companyId, sourceType: "EXPENSE", sourceId: id } })
  try { assertDocumentCanBeDeleted(expense.status, { journalEntries: postings }) } catch (error) { return { error: (error as Error).message } }
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

export async function reverseExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession(); const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string; const id = String(formData.get("id") || "")
  let reason: string; try { reason = requireReversalReason(formData.get("reason")) } catch (e) { return { error: (e as Error).message } }
  try { await db.$transaction(async tx => {
    const expense = await tx.expense.findFirst({ where: { id, companyId } })
    if (!expense || expense.status !== "POSTED") throw new Error("Only a posted expense can be reversed")
    const journal = await reversePosting(tx, companyId, "EXPENSE", id, reason); if (!journal) throw new Error("Expense accounting entry was not found")
    await tx.expense.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } })
    await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "Expense", originalDocumentId: id, reversalDocumentId: journal.id, reason })
  }) } catch (e) { return { error: e instanceof Error ? e.message : "Failed to reverse expense" } }
  redirect(`/expenses/${id}`)
}
