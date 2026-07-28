"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ReasonFieldProps {
  name?: string
  triggerLabel: string
  triggerIcon?: ReactNode
  confirmLabel?: string
  pending?: boolean
  variant?: "ghost" | "outline" | "destructive"
}

// Inline reason capture used inside a <form action={...}>. Replaces
// window.prompt(), which silently no-ops in some installed/PWA browser
// windows — leaving Reverse/Void buttons looking like they do nothing.
export function ReasonField({ name = "reason", triggerLabel, triggerIcon, confirmLabel, pending, variant = "ghost" }: ReasonFieldProps) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState("")

  if (!asking) {
    return (
      <Button type="button" variant={variant} size="sm" disabled={pending} onClick={() => setAsking(true)}>
        {triggerIcon}
        {triggerLabel}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={reason} />
      <Input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (at least 3 characters)"
        className="h-8 w-56 text-xs"
      />
      <Button type="submit" size="sm" disabled={pending || reason.trim().length < 3}>
        {confirmLabel ?? triggerLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setAsking(false); setReason("") }}>
        Cancel
      </Button>
    </div>
  )
}
