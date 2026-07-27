import { NextResponse } from "next/server"
import { Resend } from "resend"
import { secureEquals } from "@/lib/secure-compare"

// Simple endpoint to test Resend config.
// curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/admin/test-email
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")

  if (!process.env.CRON_SECRET || !secureEquals(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"
  const to = process.env.ADMIN_EMAIL

  const config = {
    apiKeySet: !!apiKey,
    from,
    to: to ?? "(ADMIN_EMAIL not set)",
    nextauthUrl: process.env.NEXTAUTH_URL ?? "(not set)",
  }

  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "RESEND_API_KEY not set", config })
  }
  if (!to) {
    return NextResponse.json({ ok: false, reason: "ADMIN_EMAIL not set", config })
  }

  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "Test email — Poultry Vet System",
    html: `
      <p>If you received this, Resend is working correctly.</p>
      <ul>
        <li>FROM: <code>${from}</code></li>
        <li>TO: <code>${to}</code></li>
        <li>NEXTAUTH_URL: <code>${process.env.NEXTAUTH_URL ?? "(not set)"}</code></li>
      </ul>
    `,
  })

  if (error) {
    return NextResponse.json({ ok: false, reason: "Resend API error", error, config })
  }

  return NextResponse.json({ ok: true, messageId: data?.id, config })
}
