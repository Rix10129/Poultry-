import { Badge } from "@/components/ui/badge"
import { daysUntilExpiry, expiryUrgency } from "@/lib/utils"

interface ExpiryBadgeProps {
  expiryDate: Date | string
  className?: string
}

const urgencyVariant = {
  critical: "danger",
  warning: "warning",
  caution: "caution",
  ok: "success",
} as const

export function ExpiryBadge({ expiryDate, className }: ExpiryBadgeProps) {
  const days = daysUntilExpiry(expiryDate)
  const urgency = expiryUrgency(days)
  const label =
    days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `${days}d left`

  return (
    <Badge variant={urgencyVariant[urgency]} className={className}>
      {label}
    </Badge>
  )
}
