import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { generateReport } from "@/lib/excel-report"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Vercel sends this header automatically for cron jobs
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"

  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date(to.getTime() - 15 * 86400_000)
  from.setHours(0, 0, 0, 0)

  const fromStr = from.toLocaleDateString("en-GB")
  const toStr = to.toLocaleDateString("en-GB")

  const companies = await db.company.findMany({
    include: {
      users: {
        where: { role: "OWNER", isActive: true },
        select: { email: true, name: true },
        take: 1,
      },
    },
  })

  const results: string[] = []

  for (const company of companies) {
    const owner = company.users[0]
    const emailTo = owner?.email ?? company.email
    if (!emailTo) {
      results.push(`${company.name}: skipped — no email`)
      continue
    }

    try {
      const buffer = await generateReport(company.id, company.name, from, to)
      const filename = `${company.name.replace(/\s+/g, "-")}-report-${toStr.replace(/\//g, "-")}.xlsx`

      await resend.emails.send({
        from: fromEmail,
        to: emailTo,
        subject: `${company.name} — Business Report (${fromStr} to ${toStr})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1E3A5F;margin-bottom:4px">Poultry Vet System</h2>
            <p style="color:#64748B;margin-top:0">Bi-Weekly Business Report</p>
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0"/>
            <p>Dear <strong>${owner?.name ?? "Owner"}</strong>,</p>
            <p>Your business report for <strong>${fromStr}</strong> to <strong>${toStr}</strong> is attached.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#F8FAFC">
                <td style="padding:10px;border:1px solid #E2E8F0">📊 Sales Summary</td>
                <td style="padding:10px;border:1px solid #E2E8F0">All invoices in the period</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #E2E8F0">🛒 Purchase Summary</td>
                <td style="padding:10px;border:1px solid #E2E8F0">All purchase orders in the period</td>
              </tr>
              <tr style="background:#F8FAFC">
                <td style="padding:10px;border:1px solid #E2E8F0">📦 Inventory Status</td>
                <td style="padding:10px;border:1px solid #E2E8F0">Stock levels, values, expiry alerts</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #E2E8F0">💰 Receivables</td>
                <td style="padding:10px;border:1px solid #E2E8F0">Customer outstanding balances</td>
              </tr>
            </table>
            <p style="color:#64748B;font-size:12px;margin-top:32px">
              This report is automatically generated every 15 days by Poultry Vet System.<br/>
              Next report: <strong>${new Date(to.getTime() + 15 * 86400_000).toLocaleDateString("en-GB")}</strong>
            </p>
          </div>
        `,
        attachments: [{ filename, content: buffer }],
      })

      results.push(`${company.name}: sent to ${emailTo}`)
    } catch (err) {
      results.push(`${company.name}: failed — ${err}`)
    }
  }

  return NextResponse.json({ ok: true, period: `${fromStr} – ${toStr}`, results })
}
