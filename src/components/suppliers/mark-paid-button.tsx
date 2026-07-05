"use client"

import { useActionState } from "react"
import { markSchedulePaid } from "@/app/(dashboard)/suppliers/schedule/actions"
import { CheckCircle2 } from "lucide-react"

export function MarkPaidButton({ id }: { id: string }) {
  const [, formAction, pending] = useActionState(markSchedulePaid, null)

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Paid
      </button>
    </form>
  )
}
