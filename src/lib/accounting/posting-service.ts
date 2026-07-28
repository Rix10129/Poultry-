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
// A cheque isn't cleared cash — it sits in a clearing account until deposited
// (receivable side) or presented (payable side). Direction picks which side.
function funds(mode: PaymentMode | undefined, direction: "in" | "out"): SystemAccount {
  if (mode === "BANK") return "BANK"
  if (mode === "CHEQUE") return direction === "in" ? "CHEQUES_RECEIVABLE" : "CHEQUES_PAYABLE"
  return "CASH"
}

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

export async function postSaleInvoice(tx: Tx, p: Posting) { const total=money(p.amount), tax=money(p.tax), paid=Decimal.min(money(p.paid),total); return post(tx,"SALE_INVOICE",p,[{account:funds(p.paymentMode,"in"),amount:paid},{account:"ACCOUNTS_RECEIVABLE",amount:total.minus(paid)}],[{account:"SALES",amount:total.minus(tax)},{account:"OUTPUT_TAX",amount:tax}]) }

// Finds whichever generation of a document's posting is currently active.
// A document can be corrected more than once (see reverseAndRepost below);
// each correction reverses the previous entry and posts a new one under a
// distinct sourceType, since postingKey (companyId:sourceType:sourceId) is
// unique and a reversed entry still occupies its original key forever.
export async function currentActiveSourceType(tx: Tx, companyId: string, baseSourceType: string, sourceId: string): Promise<string> {
  const entries = await tx.journalEntry.findMany({
    where: { companyId, sourceId, status: "POSTED", sourceType: { startsWith: baseSourceType } },
    select: { sourceType: true },
  })
  // Reversal entries (baseSourceType_REVERSAL, baseSourceType_CORRECTION_N_REVERSAL)
  // are deliberately left POSTED — they're valid completed transactions, just not
  // the document's current state — so they must be excluded from this match.
  const activePattern = new RegExp(`^${baseSourceType}(_CORRECTION_\\d+)?$`)
  const active = entries.find(e => !!e.sourceType && activePattern.test(e.sourceType))
  return active?.sourceType ?? baseSourceType
}

// Corrects a posted document's amounts by reversing whatever posting is
// currently active for it and posting a fresh one — used when an already-
// posted sale invoice or supplier payment is edited. Preserves the original
// entry (now REVERSED) for audit purposes instead of mutating it in place.
async function reverseAndRepost(tx: Tx, companyId: string, baseSourceType: string, sourceId: string, reason: string, date: Date, p: Posting, debits: Side[], credits: Side[]) {
  const activeType = await currentActiveSourceType(tx, companyId, baseSourceType, sourceId)
  const reversal = await reversePosting(tx, companyId, activeType, sourceId, reason, date)
  if (!reversal) throw new Error(`${baseSourceType} accounting entry was not found to correct`)
  const priorCorrections = await tx.journalEntry.count({ where: { companyId, sourceId, sourceType: { startsWith: `${baseSourceType}_CORRECTION` } } })
  return post(tx, `${baseSourceType}_CORRECTION_${priorCorrections + 1}`, p, debits, credits)
}

export async function repostSaleInvoice(tx: Tx, companyId: string, invoiceId: string, reason: string, date: Date, p: Posting) {
  const total=money(p.amount), tax=money(p.tax), paid=Decimal.min(money(p.paid),total)
  return reverseAndRepost(tx, companyId, "SALE_INVOICE", invoiceId, reason, date, p,
    [{account:funds(p.paymentMode,"in"),amount:paid},{account:"ACCOUNTS_RECEIVABLE",amount:total.minus(paid)}],
    [{account:"SALES",amount:total.minus(tax)},{account:"OUTPUT_TAX",amount:tax}])
}

export async function repostSupplierPayment(tx: Tx, companyId: string, paymentId: string, reason: string, date: Date, p: Posting) {
  return reverseAndRepost(tx, companyId, "SUPPLIER_PAYMENT", paymentId, reason, date, p,
    [{account:"ACCOUNTS_PAYABLE",amount:p.amount}],
    [{account:funds(p.paymentMode,"out"),amount:p.amount}])
}
export async function postCustomerReceipt(tx: Tx, p: Posting) { return post(tx,"CUSTOMER_RECEIPT",p,[{account:funds(p.paymentMode,"in"),amount:p.amount}],[{account:"ACCOUNTS_RECEIVABLE",amount:p.amount}]) }
export async function postSaleReturn(tx: Tx, p: Posting) { return post(tx,"SALE_RETURN",p,[{account:"SALES",amount:p.amount}],[{account:"ACCOUNTS_RECEIVABLE",amount:p.amount}]) }
export async function postPurchase(tx: Tx, p: Posting) { const total=money(p.amount),tax=money(p.tax),paid=Decimal.min(money(p.paid),total); return post(tx,"PURCHASE",p,[{account:"INVENTORY",amount:total.minus(tax)},{account:"INPUT_TAX",amount:tax}],[{account:funds(p.paymentMode,"out"),amount:paid},{account:"ACCOUNTS_PAYABLE",amount:total.minus(paid)}]) }
export async function postSupplierPayment(tx: Tx, p: Posting) { return post(tx,"SUPPLIER_PAYMENT",p,[{account:"ACCOUNTS_PAYABLE",amount:p.amount}],[{account:funds(p.paymentMode,"out"),amount:p.amount}]) }
export async function postPurchaseReturn(tx: Tx, p: Posting) { return post(tx,"PURCHASE_RETURN",p,[{account:"ACCOUNTS_PAYABLE",amount:p.amount}],[{account:"INVENTORY",amount:p.amount}]) }
export async function postExpense(tx: Tx, p: Posting) { return post(tx,"EXPENSE",p,[{account:"EXPENSE",amount:p.amount}],[{account:funds(p.paymentMode,"out"),amount:p.amount}]) }
export async function postStockAdjustment(tx: Tx, p: Posting & { opening?: boolean; increase: boolean }) { const contra: SystemAccount=p.opening?"OPENING_EQUITY":"STOCK_ADJUSTMENT"; return post(tx,p.opening?"OPENING_STOCK":"STOCK_ADJUSTMENT",p,p.increase?[{account:"INVENTORY",amount:p.amount}]:[{account:contra,amount:p.amount}],p.increase?[{account:contra,amount:p.amount}]:[{account:"INVENTORY",amount:p.amount}]) }

// Transfers a cheque from the clearing account into Bank once it actually
// clears. Receivable cheques (from customers) move Bank <- Cheques in Hand;
// payable cheques (issued to suppliers) move Cheques Issued -> Bank.
export async function postPDCDeposit(tx: Tx, p: Posting, type: "RECEIVABLE" | "PAYABLE") {
  return type === "RECEIVABLE"
    ? post(tx, "PDC_DEPOSIT", p, [{ account: "BANK", amount: p.amount }], [{ account: "CHEQUES_RECEIVABLE", amount: p.amount }])
    : post(tx, "PDC_DEPOSIT", p, [{ account: "CHEQUES_PAYABLE", amount: p.amount }], [{ account: "BANK", amount: p.amount }])
}

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
