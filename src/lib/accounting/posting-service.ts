import { Prisma, VoucherType, type PaymentMode } from "@prisma/client"
import Decimal from "decimal.js"
import { SYSTEM_ACCOUNTS, validateSystemAccounts, type SystemAccount } from "./system-accounts"
import { allocateDocumentNumber } from "../document-number"

type Tx = Prisma.TransactionClient
type Amount = Prisma.Decimal | Decimal | number | string
type Side = { account: SystemAccount; amount: Amount; description?: string }
export type Posting = { companyId: string; sourceId: string; date: Date; number: string; description?: string; amount: Amount; tax?: Amount; paid?: Amount; paymentMode?: PaymentMode; cost?: Amount }

function money(value: Amount = 0) { return new Decimal(value.toString()).toDecimalPlaces(2) }
export function assertBalanced(debits: Side[], credits: Side[]) {
  const debit = debits.reduce((n, l) => n.plus(money(l.amount)), new Decimal(0))
  const credit = credits.reduce((n, l) => n.plus(money(l.amount)), new Decimal(0))
  if (!debit.equals(credit)) throw new Error(`Unbalanced journal entry: debits ${debit.toFixed(2)} != credits ${credit.toFixed(2)}`)
  if (debit.lte(0)) throw new Error("Journal entry total must be greater than zero")
  return debit
}
export function swapJournalSides<T extends { debitAccountId: string | null; creditAccountId: string | null; amount: Amount }>(lines: T[]) {
  return lines.map(line => ({
    debitAccountId: line.creditAccountId,
    creditAccountId: line.debitAccountId,
    amount: line.amount,
  }))
}
function funds(mode?: PaymentMode): SystemAccount { return mode === "BANK" || mode === "CHEQUE" ? "BANK" : "CASH" }

async function post(tx: Tx, sourceType: string, p: Posting, debits: Side[], credits: Side[]) {
  const total = assertBalanced(debits, credits)
  const postingKey = `${p.companyId}:${sourceType}:${p.sourceId}`
  const prior = await tx.journalEntry.findUnique({ where: { postingKey } })
  if (prior) return prior
  const accounts = await validateSystemAccounts(tx, p.companyId)
  const voucherNumber = await allocateDocumentNumber(tx, p.companyId, "JOURNAL_ENTRY", p.date)
  return tx.journalEntry.create({ data: {
    companyId: p.companyId, voucherType: VoucherType.JOURNAL, voucherNumber,
    entryDate: p.date, description: p.description ?? `${sourceType} ${p.number}`, totalAmount: total.toFixed(2),
    reference: p.number, sourceType, sourceId: p.sourceId, postingKey, status: "POSTED",
    lines: { create: [
      ...debits.filter(x => money(x.amount).gt(0)).map(x => ({ debitAccountId: accounts[x.account].id, amount: money(x.amount).toFixed(2), description: x.description })),
      ...credits.filter(x => money(x.amount).gt(0)).map(x => ({ creditAccountId: accounts[x.account].id, amount: money(x.amount).toFixed(2), description: x.description })),
    ] },
  } })
}

export async function postSaleInvoice(tx: Tx, p: Posting) { const total=money(p.amount), tax=money(p.tax), paid=Decimal.min(money(p.paid),total); return post(tx,"SALE_INVOICE",p,[{account:funds(p.paymentMode),amount:paid},{account:"ACCOUNTS_RECEIVABLE",amount:total.minus(paid)}],[{account:"SALES",amount:total.minus(tax)},{account:"OUTPUT_TAX",amount:tax}]) }
export async function postCustomerReceipt(tx: Tx, p: Posting) { return post(tx,"CUSTOMER_RECEIPT",p,[{account:funds(p.paymentMode),amount:p.amount}],[{account:"ACCOUNTS_RECEIVABLE",amount:p.amount}]) }
export async function postSaleReturn(tx: Tx, p: Posting) { return post(tx,"SALE_RETURN",p,[{account:"SALES",amount:p.amount}],[{account:"ACCOUNTS_RECEIVABLE",amount:p.amount}]) }
export async function postPurchase(tx: Tx, p: Posting) { const total=money(p.amount),tax=money(p.tax),paid=Decimal.min(money(p.paid),total); return post(tx,"PURCHASE",p,[{account:"INVENTORY",amount:total.minus(tax)},{account:"INPUT_TAX",amount:tax}],[{account:funds(p.paymentMode),amount:paid},{account:"ACCOUNTS_PAYABLE",amount:total.minus(paid)}]) }
export async function postSupplierPayment(tx: Tx, p: Posting) { return post(tx,"SUPPLIER_PAYMENT",p,[{account:"ACCOUNTS_PAYABLE",amount:p.amount}],[{account:funds(p.paymentMode),amount:p.amount}]) }
export async function postPurchaseReturn(tx: Tx, p: Posting) { return post(tx,"PURCHASE_RETURN",p,[{account:"ACCOUNTS_PAYABLE",amount:p.amount}],[{account:"INVENTORY",amount:p.amount}]) }
export async function postExpense(tx: Tx, p: Posting) { return post(tx,"EXPENSE",p,[{account:"EXPENSE",amount:p.amount}],[{account:funds(p.paymentMode),amount:p.amount}]) }
export async function postStockAdjustment(tx: Tx, p: Posting & { opening?: boolean; increase: boolean }) { const contra: SystemAccount=p.opening?"OPENING_EQUITY":"STOCK_ADJUSTMENT"; return post(tx,p.opening?"OPENING_STOCK":"STOCK_ADJUSTMENT",p,p.increase?[{account:"INVENTORY",amount:p.amount}]:[{account:contra,amount:p.amount}],p.increase?[{account:contra,amount:p.amount}]:[{account:"INVENTORY",amount:p.amount}]) }

export async function reversePosting(tx: Tx, companyId: string, sourceType: string, sourceId: string, reason: string, date = new Date()) {
  const original = await tx.journalEntry.findUnique({ where: { postingKey: `${companyId}:${sourceType}:${sourceId}` }, include: { lines: true } })
  if (!original) return null
  const existing = await tx.journalEntry.findUnique({ where: { reversesEntryId: original.id } }); if (existing) return existing
  const debits: Side[] = [], credits: Side[] = []
  const accounts = await tx.account.findMany({ where: { companyId } }); const keys=new Map(accounts.map(a=>[a.id,Object.entries(SYSTEM_ACCOUNTS).find(([,v])=>v.code===a.code)?.[0] as SystemAccount]))
  for (const l of original.lines) { if(l.creditAccountId) debits.push({account:keys.get(l.creditAccountId)!,amount:l.amount}); if(l.debitAccountId) credits.push({account:keys.get(l.debitAccountId)!,amount:l.amount}) }
  const reversal = await post(tx,`${sourceType}_REVERSAL`,{companyId,sourceId,date,number:`REV-${original.voucherNumber}`,amount:original.totalAmount,description:reason},debits,credits)
  await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED", reversedAt: date, reversalReason: reason } })
  return tx.journalEntry.update({ where:{id:reversal.id}, data:{isReversal:true,reversesEntryId:original.id,status:"POSTED"} })
}
