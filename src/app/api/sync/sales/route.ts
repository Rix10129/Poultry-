import { NextRequest, NextResponse } from "next/server"
import { getActiveSession } from "@/lib/session"
import { db } from "@/lib/db"
import { allocateDocumentNumber } from "@/lib/document-number"
import { daysUntilExpiry } from "@/lib/utils"
import { MovementType, PaymentMode } from "@prisma/client"
import { postCustomerReceipt, postSaleInvoice } from "@/lib/accounting/posting-service"
import { reserveBatchStock } from "@/lib/inventory-reconciliation"
import { lineBase, calculateDocumentTotals } from "@/lib/invoice-math"

const VALID_PAYMENT_MODES = ["CASH", "BANK", "CHEQUE", "CREDIT"] as const

type LineInput = {
  productId: string
  batchId: string
  quantity: number
  salePrice: number
  discount: number
  taxRate: number
  isBonus?: boolean
}

export async function POST(req: NextRequest) {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const companyId = user.companyId as string
  const userId = user.id as string

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const {
    customerId,
    invoiceDate,
    dueDate,
    paymentMode,
    paidAmount,
    discountAmount,
    notes,
    linesJson,
  } = body

  if (!VALID_PAYMENT_MODES.includes(paymentMode as any)) {
    return NextResponse.json({ error: "Invalid payment mode" }, { status: 400 })
  }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return NextResponse.json({ error: "Invalid line data" }, { status: 400 })
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "No line items" }, { status: 400 })
  }

  const disc = Math.max(0, parseFloat(discountAmount) || 0)
  const paid = Math.max(0, parseFloat(paidAmount) || 0)

  let invoiceId = ""

  try {
    await db.$transaction(async (tx) => {
      const invoiceDateValue = new Date(body.invoiceDate || Date.now())
      const invoiceNumber = await allocateDocumentNumber(tx, companyId, customerId ? "SALE_INVOICE" : "CASH_MEMO", invoiceDateValue)

      const { totalAmount, taxAmount, netAmount } = calculateDocumentTotals(lines, l => l.salePrice, disc)
      if (customerId && paid > netAmount + 0.001)
        throw new Error(`Payment exceeds the invoice total of ${netAmount.toFixed(2)}`)
      if (customerId) {
        const customer = await tx.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } })
        if (!customer) throw new Error("Customer not found")
      }

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
          discountAmount: disc,
          taxAmount,
          netAmount,
          paidAmount: customerId ? paid : Math.min(paid, netAmount),
          paymentMode: paymentMode as PaymentMode,
          isCashSale: !customerId,
          notes: notes || null,
        },
      })

      invoiceId = invoice.id

      if (customerId && paid > 0) {
        const receipt = await tx.customerPayment.create({
          data: {
            status: "POSTED",
            companyId, customerId, invoiceId: invoice.id,
            amount: paid,
            paymentMode: paymentMode as PaymentMode,
            paymentDate: new Date(invoiceDate || Date.now()),
            notes: "Receipt recorded with invoice",
          },
        })
        await postCustomerReceipt(tx, { companyId, sourceId: receipt.id, number: receipt.id,
          date: receipt.paymentDate, amount: receipt.amount, paymentMode: receipt.paymentMode })
      }

      for (const line of lines) {
        const batch = await tx.productBatch.findFirst({
          where: { id: line.batchId, companyId, productId: line.productId },
        })
        if (!batch) throw new Error("Batch not found — inventory may have changed while offline")
        if (batch.quantity < line.quantity) {
          throw new Error(
            `Only ${batch.quantity} units available (you requested ${line.quantity}). Inventory changed while offline.`
          )
        }
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

        await reserveBatchStock(tx, { batchId: line.batchId, companyId, productId: line.productId,
          quantity: line.quantity })

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
            notes: `Sale ${invoiceNumber} (offline sync)`,
          },
        })
      }
      await postSaleInvoice(tx, { companyId, sourceId: invoice.id, number: invoiceNumber,
        date: invoice.invoiceDate, amount: invoice.netAmount, tax: invoice.taxAmount,
        paid: customerId ? 0 : invoice.paidAmount, paymentMode: invoice.paymentMode })
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to sync invoice" },
      { status: 422 }
    )
  }

  return NextResponse.json({ success: true, invoiceId })
}
