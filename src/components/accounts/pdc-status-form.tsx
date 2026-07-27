"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { depositPDC, bouncePDC } from "@/app/(dashboard)/accounts/pdc/actions"
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react"

interface Props {
  id: string
}

export function PDCStatusForm({ id }: Props) {
  const [depositState, depositAction, depositPending] = useActionState(depositPDC, null)
  const [bounceState, bounceAction, bouncePending] = useActionState(bouncePDC, null)

  return (
    <div className="space-y-3">
      {(depositState?.error || bounceState?.error) && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {depositState?.error || bounceState?.error}
        </div>
      )}
      <div className="flex gap-3">
        <form action={depositAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" disabled={depositPending || bouncePending} className="bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle2 className="h-4 w-4" />
            Mark Deposited
          </Button>
        </form>
        <form
          action={bounceAction}
          onSubmit={(e) => {
            const reason = window.prompt("Reason for the cheque bouncing (at least 3 characters):")?.trim()
            if (!reason || reason.length < 3) {
              e.preventDefault()
              return
            }
            const input = e.currentTarget.elements.namedItem("reason") as HTMLInputElement
            input.value = reason
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="reason" />
          <Button type="submit" variant="destructive" disabled={depositPending || bouncePending}>
            <XCircle className="h-4 w-4" />
            Mark Bounced
          </Button>
        </form>
      </div>
    </div>
  )
}
