import type { UserRole, CustomerType, Species, UnitType, PaymentMode, MovementType, AccountType, VoucherType } from "@prisma/client"

export type { UserRole, CustomerType, Species, UnitType, PaymentMode, MovementType, AccountType, VoucherType }

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  companyId: string
  companyName: string
}
