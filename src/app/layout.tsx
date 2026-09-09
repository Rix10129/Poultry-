import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Godown Ledger", template: "%s | Godown Ledger" },
  description: "Textile Trading & Mill-to-Market Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Godown Ledger",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
