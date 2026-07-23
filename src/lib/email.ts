import { Resend } from "resend"

const FROM = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"
const APP_URL = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")

function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured")
  }

  return new Resend(apiKey)
}

function baseTemplate(content: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
        <span style="font-size:20px;font-weight:700;color:#1e3a5f">Poultry Vet System</span>
      </div>
      <p style="color:#64748b;margin-top:2px;font-size:13px">Distribution &amp; Retail Management</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
      ${content}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px"/>
      <p style="color:#94a3b8;font-size:11px;margin:0">
        This email was sent by Poultry Vet System. If you didn't request this, you can safely ignore it.
      </p>
    </div>
  `
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const url = `${APP_URL}/verify-email?token=${token}`
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Verify your email — Poultry Vet System",
    html: baseTemplate(`
      <p>Hi <strong>${name}</strong>,</p>
      <p>Thank you for registering. Please verify your email address to activate your account:</p>
      <p style="margin:28px 0">
        <a href="${url}"
           style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:15px">
          Verify My Email
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">
        This link expires in <strong>24 hours</strong>.<br/>
        Or copy this URL: <a href="${url}" style="color:#2563eb">${url}</a>
      </p>
    `),
  })
}

export async function sendAdminApprovalRequest(opts: {
  to: string
  companyName: string
  ownerName: string
  ownerEmail: string
  approveUrl: string
  rejectUrl: string
}): Promise<void> {
  await getResend().emails.send({
    from: FROM,
    to: opts.to,
    subject: `[Action Required] New company registration: ${opts.companyName}`,
    html: baseTemplate(`
      <p>A new company has registered on Poultry Vet System and requires your approval.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;color:#64748b;width:140px">Company</td>
            <td style="padding:8px;border:1px solid #e2e8f0"><strong>${opts.companyName}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;color:#64748b">Owner</td>
            <td style="padding:8px;border:1px solid #e2e8f0">${opts.ownerName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;color:#64748b">Email</td>
            <td style="padding:8px;border:1px solid #e2e8f0">${opts.ownerEmail}</td></tr>
      </table>
      <p style="margin:28px 0;display:flex;gap:12px">
        <a href="${opts.approveUrl}"
           style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:14px;margin-right:12px">
          ✅ Approve
        </a>
        <a href="${opts.rejectUrl}"
           style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:14px">
          ❌ Reject
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">
        Approving activates the account. Rejecting permanently deletes it.
      </p>
    `),
  })
}

export async function sendApprovalConfirmationEmail(
  to: string,
  name: string,
  companyName: string
): Promise<void> {
  const loginUrl = `${APP_URL}/login`
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Your ${companyName} account is approved — Poultry Vet System`,
    html: baseTemplate(`
      <p>Hi <strong>${name}</strong>,</p>
      <p>Great news! Your company <strong>${companyName}</strong> has been approved.
         You can now sign in and start using Poultry Vet System.</p>
      <p style="margin:28px 0">
        <a href="${loginUrl}"
           style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:15px">
          Sign In Now
        </a>
      </p>
    `),
  })
}

export async function sendRejectionEmail(
  to: string,
  name: string,
  companyName: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Registration update — Poultry Vet System`,
    html: baseTemplate(`
      <p>Hi <strong>${name}</strong>,</p>
      <p>Unfortunately, the registration for <strong>${companyName}</strong> was not approved.
         If you believe this is an error, please contact support.</p>
    `),
  })
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  companyName: string
): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${token}`
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Reset your password — ${companyName}`,
    html: baseTemplate(`
      <p>Hi <strong>${name}</strong>,</p>
      <p>We received a request to reset the password for your <strong>${companyName}</strong> account.</p>
      <p style="margin:28px 0">
        <a href="${url}"
           style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:15px">
          Reset Password
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">
        This link expires in <strong>1 hour</strong>.<br/>
        If you didn't request a reset, your account is safe — just ignore this email.
      </p>
    `),
  })
}
