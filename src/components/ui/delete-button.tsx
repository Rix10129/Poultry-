"use client"

import { useActionState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type DeleteAction = (
  prev: { error: string } | null,
  formData: FormData
) => Promise<{ error: string } | null>

interface Props {
  action: DeleteAction
  id: string
  label?: string
  confirmMessage?: string
}

export function DeleteButton({ action, id, label = "Delete", confirmMessage }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const msg = confirmMessage ?? "Are you sure? This cannot be undone."
        if (!confirm(msg)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col items-start gap-1">
        {state?.error && (
          <p className="text-xs text-red-600 max-w-xs">{state.error}</p>
        )}
        <Button type="submit" variant="destructive" size="sm" loading={pending}>
          <Trash2 className="h-4 w-4" />
          {label}
        </Button>
      </div>
    </form>
  )
}
