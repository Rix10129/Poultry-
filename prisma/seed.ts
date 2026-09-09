import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, UserRole, CustomerType, UnitType } from "@prisma/client"
import bcrypt from "bcryptjs"
import fs from "fs"
import path from "path"
import { ensureSystemAccounts } from "../src/lib/accounting/system-accounts"

// Load .env so the seed works when run directly with tsx
try {
  const lines = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8").split("\n")
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
} catch { /* env vars already set externally */ }

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱  Seeding database…")

  // ── Company ──────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { id: "demo-company-001" },
    update: {},
    create: {
      id: "demo-company-001",
      name: "Demo Textile Traders",
      phone: "+92-300-1234567",
      email: "info@demotextile.pk",
      address: "Yarn Market, Faisalabad, Pakistan",
      taxNumber: "NTN-1234567",
      currency: "PKR",
    },
  })

  // ── Users ─────────────────────────────────────────────────────────────────
  const hashed = await bcrypt.hash("demo1234", 12)

  await prisma.user.upsert({
    where: { email_companyId: { email: "owner@demo.com", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Imran Sheikh (Owner)", email: "owner@demo.com", password: hashed, role: UserRole.OWNER, phone: "+92-300-1111111" },
  })
  await prisma.user.upsert({
    where: { email_companyId: { email: "cashier@demo.com", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Bilal Ahmed", email: "cashier@demo.com", password: hashed, role: UserRole.CASHIER, phone: "+92-300-2222222" },
  })
  await prisma.user.upsert({
    where: { email_companyId: { email: "salesman@demo.com", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Rashid Khan", email: "salesman@demo.com", password: hashed, role: UserRole.SALESMAN, phone: "+92-300-3333333" },
  })

  // ── Suppliers (Mills) ────────────────────────────────────────────────────
  const alRehman = await prisma.supplier.upsert({
    where: { id: "sup-alrehman-001" },
    update: {},
    create: { id: "sup-alrehman-001", companyId: company.id, name: "Al-Rehman Yarn Mills", phone: "+92-41-1234567", email: "orders@alrehmanyarn.pk", address: "Jhang Road, Faisalabad" },
  })
  const sadiq = await prisma.supplier.upsert({
    where: { id: "sup-sadiq-001" },
    update: {},
    create: { id: "sup-sadiq-001", companyId: company.id, name: "Sadiq Weaving Mills", phone: "+92-41-9876543", email: "orders@sadiqweaving.pk", address: "Sargodha Road, Faisalabad" },
  })
  const chenab = await prisma.supplier.upsert({
    where: { id: "sup-chenab-001" },
    update: {},
    create: { id: "sup-chenab-001", companyId: company.id, name: "Chenab Valley Textiles", phone: "+92-61-5555555", email: "orders@chenabvalley.pk", address: "Multan, Pakistan" },
  })

  // ── Customers (Buyers) ───────────────────────────────────────────────────
  await prisma.customer.createMany({
    skipDuplicates: true,
    data: [
      { id: "cust-001", companyId: company.id, name: "Anmol Cloth House", type: CustomerType.RETAILER, phone: "+92-311-1111111", area: "Faisalabad", creditLimit: 500000 },
      { id: "cust-002", companyId: company.id, name: "Khan Brothers Wholesale", type: CustomerType.WHOLESALER, phone: "+92-311-2222222", area: "Karachi", creditLimit: 1500000 },
      { id: "cust-003", companyId: company.id, name: "Elite Garments (Pvt) Ltd", type: CustomerType.GARMENT_UNIT, phone: "+92-311-3333333", area: "Lahore", creditLimit: 1000000 },
      { id: "cust-004", companyId: company.id, name: "Al-Fateh Export House", type: CustomerType.EXPORT_HOUSE, phone: "+92-311-4444444", area: "Karachi", creditLimit: 2000000 },
      { id: "cust-005", companyId: company.id, name: "Bismillah Cloth Store", type: CustomerType.RETAILER, phone: "+92-311-5555555", area: "Gujranwala", creditLimit: 200000 },
    ],
  })

  // ── Categories ────────────────────────────────────────────────────────────
  const yarn = await prisma.category.upsert({
    where: { name_companyId: { name: "Yarn", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Yarn", description: "Cotton, polyester and blended yarn (dhaga)" },
  })
  const greyCloth = await prisma.category.upsert({
    where: { name_companyId: { name: "Grey Cloth", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Grey Cloth", description: "Unprocessed woven cloth, straight off the loom" },
  })
  const printedCloth = await prisma.category.upsert({
    where: { name_companyId: { name: "Printed & Dyed Cloth", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Printed & Dyed Cloth", description: "Finished, printed and dyed fabric" },
  })

  // ── Products + Batches ────────────────────────────────────────────────────
  // Yarn and cloth carry no expiry — batches represent mill lots, tracked for
  // shade/quality matching rather than shelf life, so `exp` is left undefined.
  const productSeed = [
    {
      id: "prod-001", name: "20s Combed Cotton Yarn",
      genericName: "100% Cotton, Combed, 20s Count",
      unit: UnitType.CONE,
      categoryId: yarn.id, supplierId: alRehman.id,
      salePrice: 780, purchasePrice: 650, reorderLevel: 200,
      batches: [
        { id: "bat-001-a", num: "LOT-2451", qty: 400 },
        { id: "bat-001-b", num: "LOT-2467", qty: 350 },
      ],
    },
    {
      id: "prod-002", name: "30s Polyester Yarn",
      genericName: "100% Spun Polyester, 30s Count",
      unit: UnitType.CONE,
      categoryId: yarn.id, supplierId: alRehman.id,
      salePrice: 540, purchasePrice: 440, reorderLevel: 150,
      batches: [
        { id: "bat-002-a", num: "LOT-2480", qty: 90 },   // ⚠ below reorder (90 < 150)
      ],
    },
    {
      id: "prod-003", name: "Ring Spun Cotton Yarn 10s",
      genericName: "100% Cotton, Ring Spun, 10s Count",
      unit: UnitType.KG,
      categoryId: yarn.id, supplierId: sadiq.id,
      salePrice: 690, purchasePrice: 575, reorderLevel: 500,
      batches: [
        { id: "bat-003-a", num: "LOT-1188", qty: 1200 },
      ],
    },
    {
      id: "prod-004", name: "Grey Cloth 40x40 128",
      genericName: "Plain Weave Grey Cloth, 40x40 construction, 128 reed",
      unit: UnitType.THAAN,
      categoryId: greyCloth.id, supplierId: sadiq.id,
      salePrice: 12500, purchasePrice: 10200, reorderLevel: 20,
      batches: [
        { id: "bat-004-a", num: "LOT-3312", qty: 45 },
        { id: "bat-004-b", num: "LOT-3340", qty: 18 },
      ],
    },
    {
      id: "prod-005", name: "Grey Cloth 20x20 60x60",
      genericName: "Plain Weave Grey Cloth, 20x20 construction, 60x60",
      unit: UnitType.THAAN,
      categoryId: greyCloth.id, supplierId: chenab.id,
      salePrice: 15800, purchasePrice: 13100, reorderLevel: 15,
      batches: [
        { id: "bat-005-a", num: "LOT-4021", qty: 6 },    // ⚠ below reorder (6 < 15)
      ],
    },
    {
      id: "prod-006", name: "Lawn Print — Design 245",
      genericName: "Printed Lawn, Design 245, Multicolor",
      unit: UnitType.METER,
      categoryId: printedCloth.id, supplierId: chenab.id,
      salePrice: 340, purchasePrice: 265, reorderLevel: 500,
      batches: [
        { id: "bat-006-a", num: "LOT-5510", qty: 1800 },
        { id: "bat-006-b", num: "LOT-5533", qty: 900 },
      ],
    },
    {
      id: "prod-007", name: "Voile Printed — Floral",
      genericName: "Printed Voile, Floral Design",
      unit: UnitType.METER,
      categoryId: printedCloth.id, supplierId: alRehman.id,
      salePrice: 280, purchasePrice: 215, reorderLevel: 400,
      batches: [
        { id: "bat-007-a", num: "LOT-6109", qty: 260 },  // ⚠ below reorder (260 < 400)
      ],
    },
    {
      id: "prod-008", name: "Cambric Dyed — Navy",
      genericName: "Dyed Cambric, Solid Navy",
      unit: UnitType.ROLL,
      categoryId: printedCloth.id, supplierId: sadiq.id,
      salePrice: 6200, purchasePrice: 4900, reorderLevel: 30,
      batches: [
        { id: "bat-008-a", num: "LOT-7204", qty: 55 },
      ],
    },
    {
      id: "prod-009", name: "Karandi Printed Suit Length",
      genericName: "Printed Karandi, 3-Piece Suit Length",
      unit: UnitType.PIECE,
      categoryId: printedCloth.id, supplierId: chenab.id,
      salePrice: 2650, purchasePrice: 2050, reorderLevel: 100,
      batches: [
        { id: "bat-009-a", num: "LOT-8017", qty: 320 },
      ],
    },
    {
      id: "prod-010", name: "Khaddar Dyed — Maroon",
      genericName: "Dyed Khaddar, Solid Maroon",
      unit: UnitType.ROLL,
      categoryId: printedCloth.id, supplierId: alRehman.id,
      salePrice: 5800, purchasePrice: 4550, reorderLevel: 25,
      batches: [
        { id: "bat-010-a", num: "LOT-9002", qty: 9 },    // ⚠ below reorder (9 < 25)
      ],
    },
  ]

  for (const p of productSeed) {
    const { batches, ...data } = p
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        companyId: company.id,
        categoryId: data.categoryId,
        supplierId: data.supplierId,
        name: data.name,
        genericName: data.genericName,
        unit: data.unit,
        salePrice: data.salePrice,
        purchasePrice: data.purchasePrice,
        reorderLevel: data.reorderLevel,
      },
    })

    for (const b of batches) {
      await prisma.productBatch.upsert({
        where: { id: b.id },
        update: {},
        create: {
          id: b.id,
          companyId: company.id,
          productId: p.id,
          batchNumber: b.num,
          purchasePrice: data.purchasePrice,
          salePrice: data.salePrice,
          quantity: b.qty,
          initialQuantity: b.qty,
        },
      })
    }
  }

  /* // Legacy chart retained here for seed history; canonical system accounts
     are created and validated below.
  type AccSeed = { id: string; code: string; name: string; type: AccountType; parentId?: string }

  const parentAccounts: AccSeed[] = [
    { id: "acc-1000", code: "1000", name: "Current Assets",       type: AccountType.ASSET },
    { id: "acc-2000", code: "2000", name: "Current Liabilities",  type: AccountType.LIABILITY },
    { id: "acc-3000", code: "3000", name: "Equity",               type: AccountType.EQUITY },
    { id: "acc-4000", code: "4000", name: "Revenue",              type: AccountType.REVENUE },
    { id: "acc-5000", code: "5000", name: "Expenses",             type: AccountType.EXPENSE },
  ]

  const childAccounts: AccSeed[] = [
    { id: "acc-1010", code: "1010", name: "Cash in Hand",                   type: AccountType.ASSET,     parentId: "acc-1000" },
    { id: "acc-1020", code: "1020", name: "Bank Account",                   type: AccountType.ASSET,     parentId: "acc-1000" },
    { id: "acc-1030", code: "1030", name: "Accounts Receivable",            type: AccountType.ASSET,     parentId: "acc-1000" },
    { id: "acc-1040", code: "1040", name: "Inventory",                      type: AccountType.ASSET,     parentId: "acc-1000" },
    { id: "acc-2010", code: "2010", name: "Accounts Payable",               type: AccountType.LIABILITY, parentId: "acc-2000" },
    { id: "acc-2020", code: "2020", name: "Sales Tax Payable",              type: AccountType.LIABILITY, parentId: "acc-2000" },
    { id: "acc-3010", code: "3010", name: "Owner's Capital",                type: AccountType.EQUITY,    parentId: "acc-3000" },
    { id: "acc-3020", code: "3020", name: "Retained Earnings",              type: AccountType.EQUITY,    parentId: "acc-3000" },
    { id: "acc-4010", code: "4010", name: "Sales Revenue",                  type: AccountType.REVENUE,   parentId: "acc-4000" },
    { id: "acc-4020", code: "4020", name: "Sales Returns & Allowances",     type: AccountType.REVENUE,   parentId: "acc-4000" },
    { id: "acc-5010", code: "5010", name: "Cost of Goods Sold",             type: AccountType.EXPENSE,   parentId: "acc-5000" },
    { id: "acc-5020", code: "5020", name: "Operating Expenses",             type: AccountType.EXPENSE,   parentId: "acc-5000" },
    { id: "acc-5030", code: "5030", name: "Salaries & Wages",               type: AccountType.EXPENSE,   parentId: "acc-5000" },
  ]

  for (const a of [...parentAccounts, ...childAccounts]) {
    await prisma.account.upsert({
      where: { code_companyId: { code: a.code, companyId: company.id } },
      update: {},
      create: {
        id: a.id,
        companyId: company.id,
        code: a.code,
        name: a.name,
        type: a.type,
        parentId: a.parentId ?? null,
        isSystem: true,
      },
    })
  }
  */
  await prisma.$transaction(async tx => { await ensureSystemAccounts(tx, company.id) })

  console.log("✅  Seed complete.")
  console.log("")
  console.log("📋  Demo credentials (password: demo1234)")
  console.log("    owner@demo.com    →  OWNER")
  console.log("    cashier@demo.com  →  CASHIER")
  console.log("    salesman@demo.com →  SALESMAN")
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
