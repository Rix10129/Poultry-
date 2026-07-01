import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  )
  return response
}

export default withAuth(
  function middleware(_req: NextRequest, event: any) {
    const response = NextResponse.next()
    return addSecurityHeaders(response)
  },
  {
    pages: { signIn: "/login" },
  }
)

export const config = {
  matcher: [
    // Protect everything except auth routes and static files
    "/((?!api/auth|api/admin|api/health|_next/static|_next/image|login|register|forgot-password|reset-password|verify-email|favicon\\.ico).*)",
  ],
}
