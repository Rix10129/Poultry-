import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Poultry Vet System", template: "%s | Poultry Vet System" },
  description: "Poultry & Veterinary Medicine Distribution & Retail Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PoultryVet",
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
