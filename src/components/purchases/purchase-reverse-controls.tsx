"use client"

import { useActionState } from "react"
import { Undo2 } from "lucide-react"
import { ReasonField } from "@/components/ui/reason-field"
import { reversePurchase } from "@/app/(dashboard)/purchases/actions"

export function PurchaseReverseControls({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(reversePurchase, null)
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={purchaseId} />
      <ReasonField triggerLabel="Reverse" triggerIcon={<Undo2 className="h-4 w-4" />} pending={pending} variant="outline" />
      {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  )
}
