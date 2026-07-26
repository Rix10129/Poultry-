import { AccountType, type Prisma } from "@prisma/client"

export const SYSTEM_ACCOUNTS = {
  CASH: { code: "1000", name: "Cash", type: AccountType.ASSET },
  BANK: { code: "1010", name: "Bank", type: AccountType.ASSET },
  ACCOUNTS_RECEIVABLE: { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET },
  INVENTORY: { code: "1200", name: "Inventory", type: AccountType.ASSET },
  INPUT_TAX: { code: "1300", name: "Input Tax", type: AccountType.ASSET },
  ACCOUNTS_PAYABLE: { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
  OUTPUT_TAX: { code: "2100", name: "Output Tax", type: AccountType.LIABILITY },
  OPENING_EQUITY: { code: "3000", name: "Opening Balance Equity", type: AccountType.EQUITY },
  SALES: { code: "4000", name: "Sales Revenue", type: AccountType.REVENUE },
  COGS: { code: "5000", name: "Cost of Goods Sold", type: AccountType.EXPENSE },
  EXPENSE: { code: "6000", name: "Operating Expenses", type: AccountType.EXPENSE },
  STOCK_ADJUSTMENT: { code: "6100", name: "Stock Adjustment", type: AccountType.EXPENSE },
} as const

export type SystemAccount = keyof typeof SYSTEM_ACCOUNTS
type Tx = Prisma.TransactionClient

export async function ensureSystemAccounts(tx: Tx, companyId: string) {
  for (const account of Object.values(SYSTEM_ACCOUNTS)) {
    await tx.account.upsert({
      where: { code_companyId: { code: account.code, companyId } },
      update: { name: account.name, type: account.type, isSystem: true },
      create: { companyId, ...account, isSystem: true },
    })
  }
  return validateSystemAccounts(tx, companyId)
}

export async function validateSystemAccounts(tx: Tx, companyId: string) {
  const accounts = await tx.account.findMany({ where: { companyId, code: { in: Object.values(SYSTEM_ACCOUNTS).map(a => a.code) } } })
  const byCode = new Map(accounts.map(a => [a.code, a]))
  const missing = Object.values(SYSTEM_ACCOUNTS).filter(a => !byCode.has(a.code))
  if (missing.length) throw new Error(`Missing system accounts: ${missing.map(a => `${a.code} ${a.name}`).join(", ")}`)
  return Object.fromEntries(Object.entries(SYSTEM_ACCOUNTS).map(([key, value]) => [key, byCode.get(value.code)!])) as Record<SystemAccount, (typeof accounts)[number]>
}
