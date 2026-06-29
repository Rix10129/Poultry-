"use client"

import { useState } from "react"
import { MessageCircle, Check } from "lucide-react"

interface Props {
  customerName: string
  amount: string
  companyName: string
}

export function WhatsAppCopyButton({ customerName, amount, companyName }: Props) {
  const [copied, setCopied] = useState(false)

  const message =
    `Assalam-o-Alaikum ${customerName},\n\n` +
    `Yeh ek friendly reminder hai ke aap ka outstanding balance *PKR ${amount}* abhi bhi pending hai.\n\n` +
    `Kirpya jald se jald payment ka intezam farmayein.\n\n` +
    `Shukriya.\n${companyName}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: show alert with text
      window.alert(message)
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy WhatsApp reminder message"
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
        bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          Copied!
        </>
      ) : (
        <>
          <MessageCircle className="h-3 w-3" />
          WhatsApp
        </>
      )}
    </button>
  )
}
