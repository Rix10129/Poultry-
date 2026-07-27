import { db } from "@/lib/db"
import { PDCType } from "@prisma/client"
import { postCustomerReceipt, postSupplierPayment, postPDCDeposit, reversePosting } from "@/lib/accounting/posting-service"
import { requireReversalReason, recordReversalAudit } from "@/lib/document-lifecycle"

export type CreatePDCInput = {
  type: PDCType
  customerId?: string | null
  supplierId?: string | null
  chequeNumber: string
  bankName?: string | null
  chequeDate: Date
  amount: number
  notes?: string | null
}

export async function createPDCCheque(companyId: string, input: CreatePDCInput): Promise<{ id: string }> {
  const { type, chequeNumber, bankName, chequeDate, amount, notes } = input
  if (!chequeNumber) throw new Error("Cheque number is required")
  if (!amount || amount <= 0) throw new Error("Amount must be greater than 0")
  if (type === "RECEIVABLE" && !input.customerId) throw new Error("Customer is required for receivable cheques")
  if (type === "PAYABLE" && !input.supplierId) throw new Error("Supplier is required for payable cheques")

  const receivedDate = new Date()
  const chequeNote = `Post-dated cheque ${chequeNumber}${bankName ? ` (${bankName})` : ""}, due ${chequeDate.toISOString().slice(0, 10)}`

  return db.$transaction(async (tx) => {
    if (type === "RECEIVABLE") {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId!, companyId } })
      if (!customer) throw new Error("Customer not found")

      const payment = await tx.customerPayment.create({
        data: {
          status: "POSTED", companyId, customerId: input.customerId!,
          amount, paymentMode: "CHEQUE", paymentDate: receivedDate,
          reference: chequeNumber, notes: chequeNote,
        },
      })
      await postCustomerReceipt(tx, {
        companyId, sourceId: payment.id, number: payment.id, date: payment.paymentDate,
        amount: payment.amount, paymentMode: payment.paymentMode, description: `PDC ${chequeNumber} received`,
      })
      const pdc = await tx.pDCCheque.create({
        data: { companyId, type, customerId: input.customerId, chequeNumber, bankName, chequeDate, amount, notes, customerPaymentId: payment.id },
      })
      return { id: pdc.id }
    }

    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId!, companyId } })
    if (!supplier) throw new Error("Supplier not found")

    const payment = await tx.supplierPayment.create({
      data: {
        status: "POSTED", companyId, supplierId: input.supplierId!,
        amount, paymentMode: "CHEQUE", paymentDate: receivedDate,
        reference: chequeNumber, notes: chequeNote,
      },
    })
    await postSupplierPayment(tx, {
      companyId, sourceId: payment.id, number: payment.id, date: payment.paymentDate,
      amount: payment.amount, paymentMode: payment.paymentMode, description: `PDC ${chequeNumber} issued`,
    })
    const pdc = await tx.pDCCheque.create({
      data: { companyId, type, supplierId: input.supplierId, chequeNumber, bankName, chequeDate, amount, notes, supplierPaymentId: payment.id },
    })
    return { id: pdc.id }
  })
}

export async function depositPDCCheque(companyId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const cheque = await tx.pDCCheque.findFirst({ where: { id, companyId } })
    if (!cheque) throw new Error("Cheque not found")
    if (cheque.status !== "PENDING") throw new Error("Only a pending cheque can be marked deposited")

    const depositDate = new Date()
    await postPDCDeposit(tx, {
      companyId, sourceId: cheque.id, number: cheque.chequeNumber, date: depositDate,
      amount: cheque.amount, description: `Deposited cheque ${cheque.chequeNumber}`,
    }, cheque.type)

    await tx.pDCCheque.update({ where: { id }, data: { status: "DEPOSITED", depositedAt: depositDate } })
  })
}

export async function bouncePDCCheque(
  companyId: string,
  id: string,
  actor: { id: string; name?: string | null },
  reasonInput: FormDataEntryValue | null
): Promise<void> {
  const reason = requireReversalReason(reasonInput)

  await db.$transaction(async (tx) => {
    const cheque = await tx.pDCCheque.findFirst({ where: { id, companyId } })
    if (!cheque) throw new Error("Cheque not found")
    if (cheque.status !== "PENDING" && cheque.status !== "DEPOSITED")
      throw new Error("Only a pending or deposited cheque can bounce")

    const bounceDate = new Date()

    // If it had already been deposited, first undo the clearing-account -> Bank transfer.
    if (cheque.status === "DEPOSITED") {
      const depositReversal = await reversePosting(tx, companyId, "PDC_DEPOSIT", cheque.id, reason, bounceDate)
      if (!depositReversal) throw new Error("Deposit accounting entry was not found")
    }

    // Reverse the receipt/payment the cheque originally represented — the
    // customer's receivable (or the supplier's payable) is reinstated.
    if (cheque.customerPaymentId) {
      const payment = await tx.customerPayment.findFirst({ where: { id: cheque.customerPaymentId, companyId } })
      if (!payment || payment.status !== "POSTED") throw new Error("Linked customer payment was not found or already reversed")
      const reversal = await reversePosting(tx, companyId, "CUSTOMER_RECEIPT", payment.id, reason, bounceDate)
      if (!reversal) throw new Error("Customer receipt accounting entry was not found")
      await tx.customerPayment.update({ where: { id: payment.id }, data: { status: "REVERSED", reversedAt: bounceDate, reversedBy: actor.id, reversalReason: reason } })
      await recordReversalAudit(tx, { companyId, userId: actor.id, userName: actor.name ?? "", entity: "CustomerPayment", originalDocumentId: payment.id, reversalDocumentId: reversal.id, reason })
    } else if (cheque.supplierPaymentId) {
      const payment = await tx.supplierPayment.findFirst({ where: { id: cheque.supplierPaymentId, companyId } })
      if (!payment || payment.status !== "POSTED") throw new Error("Linked supplier payment was not found or already reversed")
      const reversal = await reversePosting(tx, companyId, "SUPPLIER_PAYMENT", payment.id, reason, bounceDate)
      if (!reversal) throw new Error("Supplier payment accounting entry was not found")
      await tx.supplierPayment.update({ where: { id: payment.id }, data: { isVoided: true, status: "REVERSED", voidedAt: bounceDate, voidedBy: actor.id, reversalReason: reason } })
      await recordReversalAudit(tx, { companyId, userId: actor.id, userName: actor.name ?? "", entity: "SupplierPayment", originalDocumentId: payment.id, reversalDocumentId: reversal.id, reason })
    }

    await tx.pDCCheque.update({ where: { id }, data: { status: "BOUNCED", bouncedAt: bounceDate, notes: cheque.notes ? `${cheque.notes}\nBounced: ${reason}` : `Bounced: ${reason}` } })
  })
}
