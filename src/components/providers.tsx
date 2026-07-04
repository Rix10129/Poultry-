"use client"

import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"
import { useEffect } from "react"

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[SW] registration failed:", err))
    }
  }, [])

  return <SessionProvider session={session}>{children}</SessionProvider>
}
