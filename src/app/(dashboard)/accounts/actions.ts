"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AccountType, VoucherType } from "@prisma/client"
import { assertBalanced } from "@/lib/accounting/posting-service"
import { recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"
import { authorize, forbiddenAction } from "@/lib/authorization"

type ActionState = { error: string } | null

const VALID_ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const
const VALID_VOUCHER_TYPES = ["CASH_RECEIPT", "CASH_PAYMENT", "BANK_RECEIPT", "BANK_PAYMENT", "JOURNAL"] as const

const VOUCHER_PREFIXES: Record<string, string> = {
  CASH_RECEIPT: "CR",
  CASH_PAYMENT: "CP",
  BANK_RECEIPT: "BR",
  BANK_PAYMENT: "BP",
  JOURNAL: "JV",
}

type LineInput = {
  debitAccountId: string | null
  creditAccountId: string | null
  amount: number
  description: string
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function createAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const authorization = await authorize("ACCOUNTING_MANAGE")
  if (!authorization.ok) return forbiddenAction
  const { companyId } = authorization.actor

  const code = (formData.get("code") as string)?.trim()
  const name = (formData.get("name") as string)?.trim()
  const type = (formData.get("type") as string) || "ASSET"
  const parentId = (formData.get("parentId") as string)?.trim() || null

  if (!code) return { error: "Account code is required" }
  if (!name) return { error: "Account name is required" }
  if (!VALID_ACCOUNT_TYPES.includes(type as any)) return { error: "Invalid account type" }

  let id = ""
  try {
    const a = await db.account.create({
      data: { companyId, code, name, type: type as AccountType, parentId },
    })
    id = a.id
  } catch (e: any) {
    if (e?.code === "P2002") return { error: `Account code "${code}" already exists` }
    return { error: "Failed to create account" }
  }

  revalidatePath("/accounts")
  redirect(`/accounts/${id}`)
}

export async function updateAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const authorization = await authorize("ACCOUNTING_MANAGE")
  if (!authorization.ok) return forbiddenAction
  const { companyId } = authorization.actor

  const id = (formData.get("id") as string)?.trim()
  const code = (formData.get("code") as string)?.trim()
  const name = (formData.get("name") as string)?.trim()
  const type = (formData.get("type") as string) || "ASSET"
  const parentId = (formData.get("parentId") as string)?.trim() || null

  if (!code) return { error: "Account code is required" }
  if (!name) return { error: "Account name is required" }
  if (!VALID_ACCOUNT_TYPES.includes(type as any)) return { error: "Invalid account type" }

  try {
    const res = await db.account.updateMany({
      where: { id, companyId, isSystem: false },
      data: { code, name, type: type as AccountType, parentId },
    })
    if (!res.count) return { error: "Account not found or is a system account" }
  } catch (e: any) {
    if (e?.code === "P2002") return { error: `Account code "${code}" already exists` }
    return { error: "Failed to update account" }
  }

  revalidatePath("/accounts")
  revalidatePath(`/accounts/${id}`)
  redirect(`/accounts/${id}`)
}

export async function deleteAccount(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return

  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()

  try {
    await db.account.deleteMany({ where: { id, companyId, isSystem: false } })
  } catch {
    // Has linked journal lines — silently redirect
  }

  revalidatePath("/accounts")
  redirect("/accounts")
}

// ── Vouchers ──────────────────────────────────────────────────────────────────

export async function createVoucher(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("JOURNAL_POST")
  if (!authorization.ok) return forbiddenAction
  const { companyId } = authorization.actor

  const voucherTypeRaw = (formData.get("voucherType") as string) || "JOURNAL"
  if (!VALID_VOUCHER_TYPES.includes(voucherTypeRaw as any))
    return { error: "Invalid voucher type" }

  const entryDate = (formData.get("entryDate") as string) || new Date().toISOString()
  const description = (formData.get("description") as string)?.trim()
  const reference = (formData.get("reference") as string)?.trim() || null
  const linesJson = formData.get("linesJson") as string

  if (!description) return { error: "Description is required" }
  if (!linesJson) return { error: "No lines provided" }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid line data" }
  }

  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line" }

  for (const line of lines) {
    if (!line.debitAccountId && !line.creditAccountId)
      return { error: "Each line must have at least a debit or credit account" }
    if (!line.amount || line.amount <= 0) return { error: "Each line must have a positive amount" }
  }

  let totalAmount: number
  try {
    totalAmount = assertBalanced(
      lines.filter(line => line.debitAccountId).map(line => ({ account: "CASH" as const, amount: line.amount })),
      lines.filter(line => line.creditAccountId).map(line => ({ account: "CASH" as const, amount: line.amount })),
    ).toNumber()
  } catch (error) { return { error: error instanceof Error ? error.message : "Voucher is not balanced" } }
  let entryId = ""

  try {
    await db.$transaction(async (tx) => {
      const count = await tx.journalEntry.count({ where: { companyId, voucherType: voucherTypeRaw as VoucherType } })
      const year = new Date().getFullYear()
      const prefix = VOUCHER_PREFIXES[voucherTypeRaw]
      const voucherNumber = `${prefix}-${year}-${String(count + 1).padStart(5, "0")}`

      const entry = await tx.journalEntry.create({
        data: {
          companyId,
          voucherType: voucherTypeRaw as VoucherType,
          voucherNumber,
          entryDate: new Date(entryDate),
          description,
          totalAmount,
          reference,
          sourceType: "VOUCHER",
          sourceId: entryId || undefined,
          status: "POSTED",
        },
      })

      entryId = entry.id

      for (const line of lines) {
        await tx.journalLine.create({
          data: {
            journalEntryId: entry.id,
            debitAccountId: line.debitAccountId || null,
            creditAccountId: line.creditAccountId || null,
            amount: line.amount,
            description: line.description || null,
          },
        })
      }
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create voucher" }
  }

  revalidatePath("/accounts")
  revalidatePath("/accounts/vouchers")
  redirect(`/accounts/vouchers/${entryId}`)
}

export async function reverseVoucher(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authorization = await authorize("JOURNAL_POST")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId; const id = String(formData.get("id") || "")
  let reason: string; try { reason = requireReversalReason(formData.get("reason")) } catch (e) { return { error: (e as Error).message } }
  try { await db.$transaction(async tx => {
    const entry = await tx.journalEntry.findFirst({ where: { id, companyId }, include: { lines: true } })
    if (!entry || entry.status !== "POSTED" || entry.isReversal) throw new Error("Only a posted original voucher can be reversed")
    const reversal = await tx.journalEntry.create({ data: { companyId, voucherType: VoucherType.JOURNAL, voucherNumber: `REV-${entry.voucherNumber}`, entryDate: new Date(), description: reason, totalAmount: entry.totalAmount, reference: entry.voucherNumber, sourceType: "VOUCHER_REVERSAL", sourceId: entry.id, postingKey: `${companyId}:VOUCHER_REVERSAL:${entry.id}`, isReversal: true, reversesEntryId: entry.id, status: "POSTED", lines: { create: entry.lines.map(line => ({ debitAccountId: line.creditAccountId, creditAccountId: line.debitAccountId, amount: line.amount, description: reason })) } } })
    await tx.journalEntry.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } })
    await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "JournalEntry", originalDocumentId: id, reversalDocumentId: reversal.id, reason })
  }) } catch (e) { return { error: e instanceof Error ? e.message : "Failed to reverse voucher" } }
  revalidatePath("/accounts/vouchers"); redirect(`/accounts/vouchers/${id}`)
}
