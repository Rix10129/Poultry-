import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"

import { db } from "@/lib/db"
import { generateReport } from "./excel-report"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

test("the Sales sheet reads a cash-sale invoice's paid amount off the invoice itself, not its (nonexistent) CustomerPayment rows", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Excel report test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Excel report test user", email: `excelreport-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })

  t.after(async () => {
    await db.saleInvoice.deleteMany({ where: { companyId: company.id } })
    await db.user.deleteMany({ where: { companyId: company.id } })
    await db.company.delete({ where: { id: company.id } })
  })

  const invoiceDate = new Date("2027-01-15")
  // A cash sale — no customerId — partially paid at the counter. Cash sales
  // never create CustomerPayment rows; their paid amount lives directly on
  // paidAmount, which is exactly what the export previously ignored.
  await db.saleInvoice.create({ data: {
    companyId: company.id, userId: user.id, customerId: null, isCashSale: true,
    invoiceNumber: `CM-EXCEL-${suffix}`, invoiceDate,
    totalAmount: 1000, discountAmount: 0, taxAmount: 0, netAmount: 1000,
    paidAmount: 600, paymentMode: "CASH", status: "POSTED",
  } })

  const buffer = await generateReport(company.id, "Excel Report Test Co", new Date("2027-01-01"), new Date("2027-01-31"))

  // ExcelJS ships its own (older) Buffer type declaration that's structurally
  // incompatible with the project's @types/node Buffer — a type-only clash,
  // not a runtime one, so a narrow cast here is the pragmatic fix.
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const sheet = workbook.getWorksheet("Sales")
  assert.ok(sheet, "expected a Sales sheet")

  const dataRow = sheet!.getRow(6) // title(3) + blank(1) + header(1) + first data row
  const [, , invoiceNo, , customerName, , , , net, paid, balance, status] = dataRow.values as unknown[]
  assert.match(String(invoiceNo), /CM-EXCEL/)
  assert.equal(customerName, "Walk-in")
  assert.equal(net, 1000)
  assert.equal(paid, 600, "paid must come from the invoice's own paidAmount, not an empty payments array")
  assert.equal(balance, 400)
  assert.equal(status, "PARTIAL")
})
