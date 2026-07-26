import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { allocateDocumentNumber } from "@/lib/document-number"
import { MovementType, PaymentMode } from "@prisma/client"

const VALID_PAYMENT_MODES = ["CASH", "BANK", "CHEQUE", "CREDIT"] as const

type LineInput = {
  productId: string
  batchId: string
  quantity: number
  salePrice: number
  discount: number
  taxRate: number
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
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
      const invoiceNumber = await allocateDocumentNumber(tx, companyId, "SALE_INVOICE", invoiceDateValue)

      let totalAmount = 0
      let taxAmount = 0
      for (const line of lines) {
        const base = line.quantity * line.salePrice * (1 - line.discount / 100)
        totalAmount += base
        taxAmount += base * line.taxRate / 100
      }
      const netAmount = Math.max(0, totalAmount - disc + taxAmount)

      const invoice = await tx.saleInvoice.create({
        data: {
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
          paidAmount: Math.min(paid, netAmount + 0.001),
          paymentMode: paymentMode as PaymentMode,
          isCashSale: !customerId,
          notes: notes || null,
        },
      })

      invoiceId = invoice.id

      if (customerId && paid > 0) {
        await tx.customerPayment.create({
          data: {
            companyId, customerId, invoiceId: invoice.id,
            amount: Math.min(paid, netAmount + 0.001),
            paymentMode: paymentMode as PaymentMode,
            paymentDate: new Date(invoiceDate || Date.now()),
            notes: "Receipt recorded with invoice",
          },
        })
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

        const lineTotal = line.quantity * line.salePrice * (1 - line.discount / 100)

        await tx.saleInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            salePrice: line.salePrice,
            discount: line.discount,
            taxRate: line.taxRate,
            totalAmount: lineTotal,
          },
        })

        await tx.productBatch.update({
          where: { id: line.batchId },
          data: { quantity: { decrement: line.quantity } },
        })

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.SALE,
            quantity: -line.quantity,
            reference: invoiceNumber,
            notes: `Sale ${invoiceNumber} (offline sync)`,
          },
        })
      }
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to sync invoice" },
      { status: 422 }
    )
  }

  return NextResponse.json({ success: true, invoiceId })
}
