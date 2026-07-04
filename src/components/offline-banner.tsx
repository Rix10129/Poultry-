"use client"

import { WifiOff } from "lucide-react"
import { useOfflineStatus } from "@/hooks/use-offline-status"

export function OfflineBanner() {
  const isOffline = useOfflineStatus()
  if (!isOffline) return null

  return (
    <div className="bg-amber-500 text-white text-xs font-medium px-5 py-1.5 flex items-center gap-2 shrink-0 print:hidden">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      You are offline — new invoices will be saved on this device and synced automatically when you reconnect
    </div>
  )
}
