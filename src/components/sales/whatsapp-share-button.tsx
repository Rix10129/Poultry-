"use client"

import { MessageCircle } from "lucide-react"

interface WhatsAppShareButtonProps {
  invoiceNumber: string
  invoiceDate: string
  netAmount: string
  paidAmount: string
  customerName?: string
  customerPhone?: string
  companyName: string
  isPaid: boolean
}

export function WhatsAppShareButton({
  invoiceNumber,
  invoiceDate,
  netAmount,
  paidAmount,
  customerName,
  customerPhone,
  companyName,
  isPaid,
}: WhatsAppShareButtonProps) {
  function openWhatsApp() {
    const net = parseFloat(netAmount)
    const paid = parseFloat(paidAmount)
    const balance = Math.max(0, net - paid)

    const lines = [
      `*${companyName}*`,
      `Invoice: *${invoiceNumber}*`,
      `Date: ${invoiceDate}`,
      customerName ? `Customer: ${customerName}` : null,
      `Amount: *PKR ${net.toLocaleString("en-PK", { minimumFractionDigits: 2 })}*`,
      isPaid
        ? `Status: ✅ *PAID*`
        : `Balance Due: *PKR ${balance.toLocaleString("en-PK", { minimumFractionDigits: 2 })}*`,
      ``,
      `_Thank you for your business!_`,
    ]
      .filter((l) => l !== null)
      .join("\n")

    const encoded = encodeURIComponent(lines)
    const phone = customerPhone
      ? customerPhone.replace(/[^0-9]/g, "").replace(/^0/, "92")
      : ""

    const url = phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`

    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <button
      onClick={openWhatsApp}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
    >
      <MessageCircle className="h-4 w-4" />
      WhatsApp
    </button>
  )
}
