import { withAuth } from "next-auth/middleware"

// NextAuth's built-in middleware: redirect unauthenticated users to /login
export default withAuth({ pages: { signIn: "/login" } })

export const config = {
  matcher: [
    "/((?!login|register|forgot-password|reset-password|offline|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/).*)",
  ],
}
