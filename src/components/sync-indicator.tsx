"use client"

import { useState, useEffect, useCallback } from "react"
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import {
  getPendingSales,
  getQueueCount,
  removeFromQueue,
  updateQueuedSale,
} from "@/lib/offline-db"
import { useOfflineStatus } from "@/hooks/use-offline-status"

export function SyncIndicator() {
  const isOffline = useOfflineStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")

  const refreshCount = useCallback(async () => {
    try {
      const n = await getQueueCount()
      setPendingCount(n)
    } catch {}
  }, [])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, 5000)
    return () => clearInterval(id)
  }, [refreshCount])

  const syncNow = useCallback(async () => {
    if (syncing || isOffline) return
    setSyncing(true)
    setStatus("idle")

    try {
      const pending = await getPendingSales()
      let anyFailed = false

      for (const sale of pending) {
        await updateQueuedSale(sale.id, { status: "syncing" })
        try {
          const res = await fetch("/api/sync/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sale),
          })
          if (res.ok) {
            await removeFromQueue(sale.id)
          } else {
            const data = await res.json().catch(() => ({}))
            await updateQueuedSale(sale.id, {
              status: "failed",
              errorMessage: data.error ?? "Sync failed",
            })
            anyFailed = true
          }
        } catch {
          await updateQueuedSale(sale.id, { status: "failed", errorMessage: "Network error" })
          anyFailed = true
        }
      }

      setStatus(anyFailed ? "error" : "success")
      await refreshCount()

      if (!anyFailed) {
        setTimeout(() => setStatus("idle"), 3000)
      }
    } finally {
      setSyncing(false)
    }
  }, [syncing, isOffline, refreshCount])

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOffline && pendingCount > 0) {
      syncNow()
    }
  }, [isOffline]) // eslint-disable-line react-hooks/exhaustive-deps

  if (pendingCount === 0 && status === "idle") return null

  const colorClass =
    status === "success"
      ? "bg-green-50 border-green-200 text-green-700"
      : status === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-blue-50 border-blue-200 text-blue-700"

  const Icon = syncing
    ? Loader2
    : status === "success"
    ? CheckCircle2
    : status === "error"
    ? AlertCircle
    : Upload

  const label = syncing
    ? "Syncing…"
    : status === "success"
    ? "Synced"
    : status === "error"
    ? "Sync failed — click to retry"
    : `${pendingCount} offline ${pendingCount === 1 ? "invoice" : "invoices"}`

  return (
    <button
      onClick={syncNow}
      disabled={syncing || isOffline}
      title={isOffline ? "Waiting for internet connection…" : label}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${colorClass} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <Icon className={`h-3 w-3 shrink-0 ${syncing ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
