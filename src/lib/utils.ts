import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string | null | undefined, currency = "PKR"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0)
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
