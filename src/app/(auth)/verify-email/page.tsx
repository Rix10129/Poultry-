import { db } from "@/lib/db"
import Link from "next/link"
import { CheckCircle, XCircle } from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Verify Email" }

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <Result success={false} message="No verification token provided." />
  }

  const user = await db.user.findFirst({ where: { verificationToken: token } })

  if (!user) {
    return (
      <Result
        success={false}
        message="This verification link is invalid or has already been used."
      />
    )
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null },
  })

  return <Result success={true} message="Your email has been verified. You can now sign in." />
}

function Result({ success, message }: { success: boolean; message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 ${
            success
              ? "bg-green-500/20 border border-green-500/30"
              : "bg-red-500/20 border border-red-500/30"
          }`}
        >
          {success ? (
            <CheckCircle className="w-8 h-8 text-green-400" />
          ) : (
            <XCircle className="w-8 h-8 text-red-400" />
          )}
        </div>
        <h1 className={`text-2xl font-bold mb-3 ${success ? "text-white" : "text-red-300"}`}>
          {success ? "Email Verified!" : "Verification Failed"}
        </h1>
        <p className="text-slate-400 mb-8">{message}</p>
        <Link
          href="/login"
          className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          Go to Sign In
        </Link>
      </div>
    </div>
  )
}
