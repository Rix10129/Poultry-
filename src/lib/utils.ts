import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  FARM: "Farm",
  VET_SHOP: "Vet Shop",
  SUB_DEALER: "Sub-Dealer",
  RETAIL: "Retail",
}

/**
 * Groups an integer-part digit string using the South Asian lakh/crore
 * convention (12,34,567 not 1,234,567) — the last 3 digits together, then
 * pairs of 2 thereafter.
 */
function groupSouthAsian(digits: string): string {
  if (digits.length <= 3) return digits
  let result = digits.slice(-3)
  let remaining = digits.slice(0, -3)
  while (remaining.length > 2) {
    result = `${remaining.slice(-2)},${result}`
    remaining = remaining.slice(0, -2)
  }
  return remaining.length > 0 ? `${remaining},${result}` : result
}

export function formatCurrency(amount: number | string | null | undefined, currency = "PKR"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0)

  // PKR is the overwhelming default for this app's market — Node's ICU data
  // groups "en-PK" using Western 3-digit commas, not the lakh/crore grouping
  // Pakistani users actually expect, so it's formatted by hand here.
  if (currency === "PKR") {
    const isNegative = num < 0
    const [intPart, decPart] = Math.abs(num).toFixed(2).split(".")
    return `${isNegative ? "-" : ""}Rs ${groupSouthAsian(intPart)}.${decPart}`
  }

  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(num)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

export function daysUntilExpiry(expiryDate: Date | string): number {
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate
  const now = new Date()
  return Math.ceil((expiry.getTime() - now.getTime()) / 86400_000)
}

export function expiryUrgency(days: number): "critical" | "warning" | "caution" | "ok" {
  if (days <= 30) return "critical"
  if (days <= 60) return "warning"
  if (days <= 90) return "caution"
  return "ok"
}
