"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { updatePDCStatus } from "@/app/(dashboard)/accounts/pdc/actions"
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react"

interface Props {
  id: string
}

export function PDCStatusForm({ id }: Props) {
  const [state, formAction, pending] = useActionState(updatePDCStatus, null)

  return (
    <div className="space-y-3">
      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {state.error}
        </div>
      )}
      <div className="flex gap-3">
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="DEPOSITED" />
          <Button type="submit" disabled={pending} className="bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle2 className="h-4 w-4" />
            Mark Deposited
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="BOUNCED" />
          <Button type="submit" variant="destructive" disabled={pending}>
            <XCircle className="h-4 w-4" />
            Mark Bounced
          </Button>
        </form>
      </div>
    </div>
  )
}
