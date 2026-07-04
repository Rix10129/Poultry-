"use client"

import { MessageCircle } from "lucide-react"

interface WhatsAppReminderButtonProps {
  customerName: string
  customerPhone?: string
  companyName: string
  balance: number
  oldestDueDate?: string
}

export function WhatsAppReminderButton({
  customerName,
  customerPhone,
  companyName,
  balance,
  oldestDueDate,
}: WhatsAppReminderButtonProps) {
  function openWhatsApp() {
    const lines = [
      `السلام علیکم ${customerName}،`,
      ``,
      `*${companyName}* کی طرف سے یاد دہانی:`,
      ``,
      `آپ کا واجب الادا بقایا:`,
      `*PKR ${balance.toLocaleString("en-PK", { minimumFractionDigits: 2 })}*`,
      oldestDueDate ? `Due since: ${oldestDueDate}` : null,
      ``,
      `براہ کرم جلد از جلد ادائیگی فرمائیں۔`,
      `شکریہ 🙏`,
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

  if (balance <= 0) return null

  return (
    <button
      onClick={openWhatsApp}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
    >
      <MessageCircle className="h-4 w-4" />
      Send Reminder
    </button>
  )
}
