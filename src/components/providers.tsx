"use client"

import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"
import { useEffect } from "react"
import { kvSet } from "@/lib/offline-db"

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[SW] registration failed:", err))
    }

    // Background-sync customers + products into IndexedDB whenever online.
    // This gives the offline invoice form data to work with even if the
    // service worker hasn't cached /sales/new yet.
    function syncOfflineData() {
      if (!navigator.onLine) return
      fetch("/api/offline-data", { credentials: "same-origin" })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (!data) return
          kvSet("customers", data.customers).catch(() => null)
          kvSet("products", data.products).catch(() => null)
        })
        .catch(() => null) // never throw — this is background work
    }

    // Run on mount and whenever the browser comes back online
    syncOfflineData()
    window.addEventListener("online", syncOfflineData)
    return () => window.removeEventListener("online", syncOfflineData)
  }, [])

  return <SessionProvider session={session}>{children}</SessionProvider>
}
