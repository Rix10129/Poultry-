import type { UserRole } from "@prisma/client"
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    role: UserRole
    companyId: string
    companyName: string
  }
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
      companyId: string
      companyName: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    companyId: string
    companyName: string
  }
}
