import { db } from "@/lib/db"
import { ROLE_PERMISSIONS } from "@/lib/authorization"
import { makeBackup, type BackupData } from "@/lib/company-backup"

/** Produce the complete, lossless tenant dataset. Password hashes are included, so callers must encrypt it. */
export async function dumpCompanyBackup(companyId: string) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } })
  const [users, documentSequences, suppliers, customers, categories, products, batches, stockMovements,
    purchases, purchaseItems, purchaseReturns, purchaseReturnItems, invoices, invoiceItems, saleReturns,
    saleReturnItems, customerPayments, supplierPayments, accounts, journalEntries, journalLines, pdcCheques,
    expenses, salesTargets, routes, routeVisits, quotations, quotationItems, supplierPaymentSchedules, invoiceDrafts, auditLogs] = await Promise.all([
    db.user.findMany({where:{companyId}}), db.documentSequence.findMany({where:{companyId}}), db.supplier.findMany({where:{companyId}}),
    db.customer.findMany({where:{companyId}}), db.category.findMany({where:{companyId}}), db.product.findMany({where:{companyId}}),
    db.productBatch.findMany({where:{companyId}}), db.stockMovement.findMany({where:{companyId}}), db.purchaseOrder.findMany({where:{companyId}}),
    db.purchaseOrderItem.findMany({where:{purchaseOrder:{companyId}}}), db.purchaseReturn.findMany({where:{companyId}}),
    db.purchaseReturnItem.findMany({where:{purchaseReturn:{companyId}}}), db.saleInvoice.findMany({where:{companyId}}),
    db.saleInvoiceItem.findMany({where:{invoice:{companyId}}}), db.saleReturn.findMany({where:{companyId}}),
    db.saleReturnItem.findMany({where:{saleReturn:{companyId}}}), db.customerPayment.findMany({where:{companyId}}),
    db.supplierPayment.findMany({where:{companyId}}), db.account.findMany({where:{companyId}}), db.journalEntry.findMany({where:{companyId}}),
    db.journalLine.findMany({where:{journalEntry:{companyId}}}), db.pDCCheque.findMany({where:{companyId}}), db.expense.findMany({where:{companyId}}),
    db.salesTarget.findMany({where:{companyId}}), db.route.findMany({where:{companyId}}), db.routeVisit.findMany({where:{companyId}}),
    db.quotation.findMany({where:{companyId}}), db.quotationItem.findMany({where:{quotation:{companyId}}}),
    db.supplierPaymentSchedule.findMany({where:{companyId}}), db.invoiceDraft.findMany({where:{companyId}}), db.auditLog.findMany({where:{companyId}}),
  ])
  const data: BackupData = { company: [company], users, permissions: Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({ role, permissions })), documentSequences, suppliers, customers, categories, products, batches, stockMovements, purchases, purchaseItems, purchaseReturns, purchaseReturnItems, invoices, invoiceItems, saleReturns, saleReturnItems, customerPayments, supplierPayments, accounts, journalEntries, journalLines, pdcCheques, expenses, salesTargets, routes, routeVisits, quotations, quotationItems, supplierPaymentSchedules, invoiceDrafts, auditLogs }
  return makeBackup(company.id, company.name, data)
}
