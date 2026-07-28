"use server"

import { db } from "@/lib/db"
import { allocateDocumentNumber } from "@/lib/document-number"
import { daysUntilExpiry } from "@/lib/utils"
import { getActiveSession } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType, PaymentMode } from "@prisma/client"
import { writeAuditLog, logAudit } from "@/lib/audit"
import { postCustomerReceipt, postSaleInvoice, postSaleReturn, reversePosting, currentActiveSourceType, repostSaleInvoice } from "@/lib/accounting/posting-service"
import { assertDocumentCanBeDeleted, recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"
import { authorize, forbiddenAction } from "@/lib/authorization"
import { persistInvoiceDraft, type InvoiceDraftData } from "@/lib/invoice-draft"
import { reserveBatchStock } from "@/lib/inventory-reconciliation"
import { getCustomerOutstandingBalance } from "@/lib/customer-balance"
import { lineBase, calculateDocumentTotals } from "@/lib/invoice-math"

type ActionState = { error: string } | null

type DraftActionState = { error?: string; id?: string; savedAt?: string }

export async function saveInvoiceDraft(data: InvoiceDraftData & { id?: string }): Promise<DraftActionState> {
  const authorization = await authorize("SALE_CREATE")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  // This is intentionally the only write: drafts do not create invoices,
  // movements, receipts, customer balances, or journal entries.
  try {
    const saved = await persistInvoiceDraft(db as any, { companyId: user.companyId, userId: user.id }, data)
    return { id: saved!.id, savedAt: saved!.updatedAt.toISOString() }
  } catch (error) { return { error: (error as Error).message } }
}

export async function deleteInvoiceDraft(id: string): Promise<DraftActionState> {
  const authorization = await authorize("SALE_CREATE")
  if (!authorization.ok) return forbiddenAction
  const deleted = await db.invoiceDraft.deleteMany({ where: { id, companyId: authorization.actor.companyId, userId: authorization.actor.id } })
  return deleted.count ? {} : { error: "Draft not found" }
}

export async function deleteInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("SALE_CANCEL")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const id = (formData.get("id") as string)?.trim()

  let invoiceNumber = ""
  try {
    await db.$transaction(async (tx: any) => {
      const invoice = await tx.saleInvoice.findFirst({
        where: { id, companyId },
        include: { payments: true, returns: true, _count: { select: { items: true } } },
      })
      if (!invoice) throw new Error("Invoice not found")
      const postings = await tx.journalEntry.count({ where: { companyId, sourceType: "SALE_INVOICE", sourceId: id } })
      assertDocumentCanBeDeleted(invoice.status, { stockMovements: invoice._count.items, payments: invoice.payments.length, returns: invoice.returns.length, journalEntries: postings })
      invoiceNumber = invoice.invoiceNumber
      await tx.saleInvoice.delete({ where: { id } })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete invoice" }
  }

  await writeAuditLog({
    companyId,
    userId: user.id,
    action: "DELETE",
    entity: "SaleInvoice",
    entityId: id,
    oldValues: { invoiceNumber },
  })

  revalidatePath("/sales")
  revalidatePath("/inventory")
  redirect("/sales")
}

export async function reverseInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authorization = await authorize("SALE_CANCEL")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const id = String(formData.get("id") || "").trim()
  let reason: string
  try { reason = requireReversalReason(formData.get("reason")) } catch (error) { return { error: (error as Error).message } }
  try {
    await db.$transaction(async tx => {
      const invoice = await tx.saleInvoice.findFirst({ where: { id, companyId }, include: { items: true, payments: true, returns: true } })
      if (!invoice) throw new Error("Invoice not found")
      if (invoice.status !== "POSTED") throw new Error("Only posted invoices can be reversed")
      if (invoice.payments.length || invoice.returns.length) throw new Error("Reverse linked payments and returns before reversing this invoice")
      for (const item of invoice.items) {
        await tx.productBatch.update({ where: { id: item.batchId }, data: { quantity: { increment: item.quantity } } })
        await tx.stockMovement.create({ data: { companyId, productId: item.productId, batchId: item.batchId, type: MovementType.SALE_RETURN, quantity: item.quantity, reference: `REV-${invoice.invoiceNumber}`, sourceType: "SALE_INVOICE_REVERSAL", sourceId: invoice.id, notes: reason } })
      }
      const activeSourceType = await currentActiveSourceType(tx, companyId, "SALE_INVOICE", invoice.id)
      const journal = await reversePosting(tx, companyId, activeSourceType, invoice.id, reason)
      if (!journal) throw new Error("Invoice accounting entry was not found")
      await tx.saleInvoice.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } })
      await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "SaleInvoice", originalDocumentId: id, reversalDocumentId: journal.id, reason })
    })
  } catch (error) { return { error: error instanceof Error ? error.message : "Failed to reverse invoice" } }
  revalidatePath("/sales"); revalidatePath("/inventory"); redirect(`/sales/${id}`)
}

type ReturnLineInput = {
  productId: string
  batchId: string
  quantity: number
  salePrice: number
}

export async function createSaleReturn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const customerId = (formData.get("customerId") as string) || null
  const invoiceId = (formData.get("invoiceId") as string) || null
  const returnDate = (formData.get("returnDate") as string) || new Date().toISOString()
  const notes = (formData.get("notes") as string)?.trim() || null
  const linesJson = formData.get("linesJson") as string

  if (!linesJson) return { error: "No items provided" }
  let lines: ReturnLineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid items data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one item" }

  let returnId = ""

  try {
    await db.$transaction(async (tx) => {
      const returnDateValue = new Date(returnDate)
      const returnNumber = await allocateDocumentNumber(tx, companyId, "SALE_RETURN", returnDateValue)

      const totalAmount = lines.reduce((s, l) => s + l.quantity * l.salePrice, 0)

      const ret = await tx.saleReturn.create({
        data: {
          status: "POSTED",
          companyId,
          customerId: customerId || null,
          invoiceId: invoiceId || null,
          returnNumber,
          returnDate: returnDateValue,
          totalAmount,
          notes,
        },
      })
      returnId = ret.id

      for (const line of lines) {
        const batch = await tx.productBatch.findFirst({
          where: { id: line.batchId, companyId, productId: line.productId },
        })
        if (!batch) throw new Error("Batch not found")

        await tx.saleReturnItem.create({
          data: {
            saleReturnId: ret.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            salePrice: line.salePrice,
            totalAmount: line.quantity * line.salePrice,
          },
        })

        await tx.productBatch.update({
          where: { id: line.batchId },
          data: { quantity: { increment: line.quantity } },
        })

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.SALE_RETURN,
            sourceType: "SALE_RETURN",
            sourceId: ret.id,
            quantity: line.quantity,
            reference: returnNumber,
            notes: `Sale Return ${returnNumber}`,
          },
        })
      }
      await postSaleReturn(tx, { companyId, sourceId: ret.id, number: returnNumber, date: ret.returnDate, amount: ret.totalAmount })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create sale return" }
  }

  revalidatePath("/sales/returns")
  revalidatePath("/inventory")
  redirect(`/sales/returns/${returnId}`)
}

type LineInput = {
  productId: string
  batchId: string
  quantity: number
  salePrice: number
  discount: number
  taxRate: number
  isBonus?: boolean
}

const VALID_PAYMENT_MODES = ["CASH", "BANK", "CHEQUE", "CREDIT"] as const

export async function createInvoice(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("SALE_CREATE")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const userId = user.id

  const customerId = (formData.get("customerId") as string) || null
  const invoiceDate = (formData.get("invoiceDate") as string) || new Date().toISOString()
  const dueDate = (formData.get("dueDate") as string) || null
  const paymentModeRaw = (formData.get("paymentMode") as string) || "CASH"
  const paidAmount = Math.max(0, parseFloat(formData.get("paidAmount") as string) || 0)
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const schemeNotes = (formData.get("schemeNotes") as string) || null
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string
  const bypassCreditLimit = formData.get("bypassCreditLimit") === "1"
  const draftId = String(formData.get("draftId") || "").trim() || null

  if (!linesJson) return { error: "No line items provided" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid line data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }

  // Credit limit check (fast pre-check outside the transaction; the
  // authoritative check re-runs on the same canonical formula inside the
  // transaction below, immediately before the invoice is created).
  if (customerId && !bypassCreditLimit) {
    const customer = await db.customer.findFirst({
      where: { id: customerId, companyId },
      select: { creditLimit: true, name: true },
    })
    if (customer) {
      const creditLimit = parseFloat(customer.creditLimit.toString())
      if (creditLimit > 0) {
        const balance = await getCustomerOutstandingBalance(db, companyId, customerId)
        const outstanding = balance?.closingBalance ?? 0

        // Estimate new invoice net amount from lines
        let estTotal = 0
        for (const l of lines) {
          estTotal += l.quantity * l.salePrice * (1 - (l.discount ?? 0) / 100)
        }
        const estNet = Math.max(0, estTotal - discountAmount)

        if (outstanding + estNet - paidAmount > creditLimit) {
          const role = user.role as string
          if (role !== "OWNER" && role !== "ADMIN") {
            return {
              error: `Credit limit exceeded. ${customer.name} has PKR ${outstanding.toLocaleString()} outstanding against a limit of PKR ${creditLimit.toLocaleString()}. Ask your manager to approve this sale.`,
            }
          }
        }
      }
    }
  }

  let invoiceId = ""

  try {
    await db.$transaction(async (tx) => {
      if (draftId) {
        const draft = await tx.invoiceDraft.findFirst({ where: { id: draftId, companyId, userId } })
        if (!draft) throw new Error("Draft not found or already posted")
      }
      const invoiceDateValue = new Date(invoiceDate)
      const invoiceNumber = await allocateDocumentNumber(tx, companyId, "SALE_INVOICE", invoiceDateValue)

      // Compute totals
      const { totalAmount, taxAmount, netAmount } = calculateDocumentTotals(lines, l => l.salePrice, discountAmount)
      if (customerId && paidAmount > netAmount + 0.001)
        throw new Error(`Payment exceeds the invoice total of ${netAmount.toFixed(2)}`)
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, companyId },
          select: { id: true, name: true, creditLimit: true },
        })
        if (!customer) throw new Error("Customer not found")

        if (!bypassCreditLimit) {
          const creditLimit = parseFloat(customer.creditLimit.toString())
          if (creditLimit > 0) {
            const role = user.role as string
            if (role !== "OWNER" && role !== "ADMIN") {
              const balance = await getCustomerOutstandingBalance(tx, companyId, customerId)
              const outstanding = balance?.closingBalance ?? 0
              if (outstanding + netAmount - paidAmount > creditLimit) {
                throw new Error(
                  `Credit limit exceeded. ${customer.name} has PKR ${outstanding.toLocaleString()} outstanding against a limit of PKR ${creditLimit.toLocaleString()}. Ask your manager to approve this sale.`
                )
              }
            }
          }
        }
      }

      // Create invoice
      const invoice = await tx.saleInvoice.create({
        data: {
          status: "POSTED",
          companyId,
          userId,
          customerId: customerId || null,
          invoiceNumber,
          invoiceDate: invoiceDateValue,
          dueDate: dueDate ? new Date(dueDate) : null,
          totalAmount,
          discountAmount,
          taxAmount,
          netAmount,
          paidAmount: customerId ? paidAmount : Math.min(paidAmount, netAmount),
          paymentMode: paymentModeRaw as PaymentMode,
          isCashSale: !customerId,
          schemeNotes: schemeNotes || null,
          notes: notes || null,
        },
      })

      invoiceId = invoice.id

      // CustomerPayment is the authoritative receipt event; paidAmount is only
      // a derived cache for invoice-oriented views.
      if (customerId && paidAmount > 0) {
        const receipt = await tx.customerPayment.create({
          data: {
            status: "POSTED",
            companyId, customerId, invoiceId: invoice.id,
            amount: paidAmount,
            paymentMode: paymentModeRaw as PaymentMode,
            paymentDate: new Date(invoiceDate),
            notes: "Receipt recorded with invoice",
          },
        })
        await postCustomerReceipt(tx, { companyId, sourceId: receipt.id, number: receipt.id, date: receipt.paymentDate, amount: receipt.amount, paymentMode: receipt.paymentMode })
      }

      // Process each line item
      for (const line of lines) {
        // Verify batch belongs to company and the right product
        const batch = await tx.productBatch.findFirst({
          where: { id: line.batchId, companyId, productId: line.productId },
        })
        if (!batch) throw new Error(`Batch not found`)
        if (daysUntilExpiry(batch.expiryDate) < 0) {
          throw new Error(`Cannot sell an expired batch (${batch.batchNumber})`)
        }
        // FEFO is enforced server-side: the client may only sell from the
        // earliest-expiring batch that still has stock for this product.
        const earliestAvailable = await tx.productBatch.findFirst({
          where: { companyId, productId: line.productId, quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: { id: true, expiryDate: true, batchNumber: true },
        })
        if (earliestAvailable && earliestAvailable.id !== batch.id && earliestAvailable.expiryDate < batch.expiryDate) {
          throw new Error(
            `Batch ${batch.batchNumber} skips FEFO order — batch ${earliestAvailable.batchNumber} expires earlier and still has stock`
          )
        }
        const lineTotal = lineBase(line.quantity, line.salePrice, line.discount, line.isBonus)

        await tx.saleInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            salePrice: line.salePrice,
            discount: line.discount,
            taxRate: line.taxRate,
            isBonus: !!line.isBonus,
            totalAmount: lineTotal,
          },
        })

        // Deduct from batch
        await reserveBatchStock(tx, {
          batchId: line.batchId, companyId, productId: line.productId, quantity: line.quantity,
        })

        // Record stock movement (negative = stock out)
        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.SALE,
            sourceType: "SALE_INVOICE",
            sourceId: invoice.id,
            quantity: -line.quantity,
            reference: invoiceNumber,
            notes: `Sale ${invoiceNumber}`,
          },
        })
      }
      await postSaleInvoice(tx, { companyId, sourceId: invoice.id, number: invoiceNumber, date: invoice.invoiceDate, amount: invoice.netAmount, tax: invoice.taxAmount, paid: customerId ? 0 : invoice.paidAmount, paymentMode: invoice.paymentMode })
      // Consuming the draft in this transaction makes posting all-or-nothing.
      if (draftId) await tx.invoiceDraft.delete({ where: { id: draftId } })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create invoice" }
  }

  logAudit({
    companyId,
    userId: user.id,
    userName: user.name ?? "",
    action: "CREATE_INVOICE",
    entityId: invoiceId,
    detail: `Invoice created`,
  })

  revalidatePath("/sales")
  revalidatePath("/inventory")
  revalidatePath("/alerts")
  redirect(`/sales/${invoiceId}`)
}

export async function updateInvoice(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("SALE_EDIT")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const userId = user.id
  const role = user.role as string

  const id = (formData.get("id") as string)?.trim()
  const customerId = (formData.get("customerId") as string) || null
  const invoiceDate = (formData.get("invoiceDate") as string) || new Date().toISOString()
  const dueDate = (formData.get("dueDate") as string) || null
  const paymentModeRaw = (formData.get("paymentMode") as string) || "CASH"
  const paidAmountInput = Math.max(0, parseFloat(formData.get("paidAmount") as string) || 0)
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string
  const confirmDependentEdit = formData.get("confirmDependentEdit") === "1"

  if (!id) return { error: "Invoice ID is required" }
  if (!linesJson) return { error: "No line items provided" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid line data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }

  let invoiceNumber = ""

  try {
    await db.$transaction(async (tx: any) => {
      const invoice = await tx.saleInvoice.findFirst({
        where: { id, companyId },
        include: { items: true, payments: true, returns: true },
      })
      if (!invoice) throw new Error("Invoice not found")

      const hasDependentRecords = invoice.payments.length > 0 || invoice.returns.length > 0
      if (hasDependentRecords && !((role === "OWNER" || role === "ADMIN") && confirmDependentEdit)) {
        throw new Error("Cannot edit — this invoice has recorded payments or sale returns. Owner/Admin confirmation is required.")
      }

      invoiceNumber = invoice.invoiceNumber

      for (const item of invoice.items) {
        await tx.productBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.quantity } },
        })
      }

      await tx.saleInvoiceItem.deleteMany({ where: { invoiceId: invoice.id } })
      await tx.stockMovement.deleteMany({ where: { companyId, reference: invoice.invoiceNumber } })

      for (const line of lines) {
        if (line.quantity < 1) throw new Error("Line quantities must be at least 1")
        if (line.discount < 0 || line.discount > 100) throw new Error("Line discount must be between 0 and 100")
      }
      const { totalAmount, taxAmount, netAmount } = calculateDocumentTotals(lines, l => l.salePrice, discountAmount)
      const postedPaidAmount = invoice.payments
        .filter((payment: { status: string }) => payment.status === "POSTED")
        .reduce((total: number, payment: { amount: { toString(): string } }) => total + Number(payment.amount.toString()), 0)
      if (postedPaidAmount > netAmount + 0.001)
        throw new Error(`Invoice total cannot be reduced below recorded payments of ${postedPaidAmount.toFixed(2)}`)
      if (invoice.payments.length && customerId !== invoice.customerId)
        throw new Error("Cannot change the customer on an invoice with recorded payments")

      // Credit-customer invoices are paid via CustomerPayment rows, which are
      // authoritative — never manufacture a second receipt from the editable
      // summary field. A walk-in cash sale has no CustomerPayment rows at
      // all, so its paid amount has to come from the form instead, or every
      // edit would silently zero out an already-paid cash sale.
      const finalPaidAmount = customerId ? postedPaidAmount : Math.min(paidAmountInput, netAmount)

      const financialsChanged =
        Number(invoice.netAmount) !== netAmount ||
        Number(invoice.taxAmount) !== taxAmount ||
        Number(invoice.paidAmount) !== finalPaidAmount ||
        (customerId || null) !== invoice.customerId ||
        paymentModeRaw !== invoice.paymentMode

      await tx.saleInvoice.update({
        where: { id: invoice.id },
        data: {
          customerId: customerId || null,
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          totalAmount,
          discountAmount,
          taxAmount,
          netAmount,
          paidAmount: finalPaidAmount,
          paymentMode: paymentModeRaw as PaymentMode,
          isCashSale: !customerId,
          notes: notes || null,
        },
      })

      for (const line of lines) {
        const batch = await tx.productBatch.findFirst({
          where: { id: line.batchId, companyId, productId: line.productId },
        })
        if (!batch) throw new Error("Batch not found")
        if (daysUntilExpiry(batch.expiryDate) < 0) {
          throw new Error(`Cannot sell an expired batch (${batch.batchNumber})`)
        }
        // FEFO is enforced server-side: the client may only sell from the
        // earliest-expiring batch that still has stock for this product.
        const earliestAvailable = await tx.productBatch.findFirst({
          where: { companyId, productId: line.productId, quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: { id: true, expiryDate: true, batchNumber: true },
        })
        if (earliestAvailable && earliestAvailable.id !== batch.id && earliestAvailable.expiryDate < batch.expiryDate) {
          throw new Error(
            `Batch ${batch.batchNumber} skips FEFO order — batch ${earliestAvailable.batchNumber} expires earlier and still has stock`
          )
        }
        const lineTotal = lineBase(line.quantity, line.salePrice, line.discount, line.isBonus)

        await tx.saleInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            salePrice: line.salePrice,
            discount: line.discount,
            taxRate: line.taxRate,
            isBonus: !!line.isBonus,
            totalAmount: lineTotal,
          },
        })

        await reserveBatchStock(tx, {
          batchId: line.batchId, companyId, productId: line.productId, quantity: line.quantity,
        })

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.SALE,
            sourceType: "SALE_INVOICE",
            sourceId: invoice.id,
            quantity: -line.quantity,
            reference: invoice.invoiceNumber,
            notes: `Sale ${invoice.invoiceNumber} (edited)`,
          },
        })
      }

      // The ledger entry posted when this invoice was created reflects the
      // OLD totals — if amounts, tax, payment mode, or the customer changed,
      // it must be reversed and reposted, or reports (P&L, trial balance,
      // receivables) would silently keep stale figures forever.
      if (financialsChanged) {
        await repostSaleInvoice(tx, companyId, invoice.id, `Invoice ${invoice.invoiceNumber} edited — totals recalculated`, new Date(), {
          companyId,
          sourceId: invoice.id,
          number: invoice.invoiceNumber,
          date: new Date(invoiceDate),
          amount: netAmount,
          tax: taxAmount,
          paid: customerId ? 0 : finalPaidAmount,
          paymentMode: paymentModeRaw as PaymentMode,
        })
      }
    })
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Failed to update invoice" }
  }

  logAudit({
    companyId,
    userId,
    userName: user.name ?? "",
    action: "UPDATE_INVOICE",
    entity: "SaleInvoice",
    entityId: id,
    detail: `Invoice ${invoiceNumber} updated`,
  })

  revalidatePath("/sales")
  revalidatePath(`/sales/${id}`)
  revalidatePath("/inventory")
  revalidatePath("/alerts")
  redirect(`/sales/${id}`)
}
