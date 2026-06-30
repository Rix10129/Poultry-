import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email.toLowerCase().trim()

        // Rate limiting: block after 5 failed attempts in 15 minutes
        const windowStart = new Date(Date.now() - 15 * 60 * 1000)
        const recentFailures = await db.failedLogin.count({
          where: { email, createdAt: { gte: windowStart } },
        })
        if (recentFailures >= 5) return null

        const user = await db.user.findFirst({
          where: { email, isActive: true },
          include: { company: { select: { name: true } } },
        })

        if (!user) {
          await db.failedLogin.create({ data: { email } })
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          await db.failedLogin.create({ data: { email } })
          return null
        }

        // Clear failure history on successful login
        await db.failedLogin.deleteMany({ where: { email } }).catch(() => null)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company.name,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.companyId = (user as any).companyId
        token.companyName = (user as any).companyName
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).companyId = token.companyId
        ;(session.user as any).companyName = token.companyName
      }
      return session
    },
  },
}
