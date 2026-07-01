import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendRejectionEmail } from "@/lib/email"

export const runtime = "nodejs"

function html(title: string, message: string, color: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8">
     <title>${title}</title>
     <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;background:#f8fafc}
     .card{max-width:480px;text-align:center;padding:48px 40px;background:#fff;
     border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
     h1{color:${color};margin-bottom:12px}p{color:#64748b}</style></head>
     <body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  if (!token) return html("Invalid Link", "No token provided.", "#dc2626")

  const company = await db.company.findFirst({
    where: { approvalToken: token },
    include: {
      users: { where: { role: "OWNER" }, select: { email: true, name: true }, take: 1 },
    },
  })

  if (!company) {
    return html(
      "Link Expired",
      "This rejection link has already been used or is invalid.",
      "#f59e0b"
    )
  }

  const owner = company.users[0]
  if (owner) {
    await sendRejectionEmail(owner.email, owner.name, company.name).catch(() => null)
  }

  // Delete the company — cascades to the user
  await db.company.delete({ where: { id: company.id } })

  return html(
    "❌ Rejected",
    `The registration for <strong>${company.name}</strong> has been rejected and deleted. The owner has been notified.`,
    "#dc2626"
  )
}
