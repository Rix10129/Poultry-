import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: { signIn: "/login" },
})

export const config = {
  matcher: [
    // Protect everything except auth routes, static files, and favicon
    "/((?!api/auth|_next/static|_next/image|login|favicon\\.ico).*)",
  ],
}
