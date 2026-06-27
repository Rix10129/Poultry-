import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, UserRole, CustomerType, Species, UnitType, AccountType } from "@prisma/client"
import bcrypt from "bcryptjs"

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
      name: "Demo Pharma Distributors",
      phone: "+92-300-1234567",
      email: "info@demopharma.pk",
      address: "123 Industrial Area, Lahore, Pakistan",
      taxNumber: "NTN-1234567",
      currency: "PKR",
    },
  })

  // ── Users ─────────────────────────────────────────────────────────────────
  const hashed = await bcrypt.hash("demo1234", 12)

  await prisma.user.upsert({
    where: { email_companyId: { email: "owner@demo.com", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Muhammad Ali (Owner)", email: "owner@demo.com", password: hashed, role: UserRole.OWNER, phone: "+92-300-1111111" },
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

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const msd = await prisma.supplier.upsert({
    where: { id: "sup-msd-001" },
    update: {},
    create: { id: "sup-msd-001", companyId: company.id, name: "MSD Animal Health Pakistan", phone: "+92-21-1234567", email: "orders@msd-ah.pk", address: "Karachi, Pakistan" },
  })
  const pfizer = await prisma.supplier.upsert({
    where: { id: "sup-pfizer-001" },
    update: {},
    create: { id: "sup-pfizer-001", companyId: company.id, name: "Pfizer Animal Health", phone: "+92-42-9876543", email: "orders@pfizer-ah.pk", address: "Lahore, Pakistan" },
  })
  const intervet = await prisma.supplier.upsert({
    where: { id: "sup-intervet-001" },
    update: {},
    create: { id: "sup-intervet-001", companyId: company.id, name: "Intervet Pakistan (Pvt) Ltd", phone: "+92-51-5555555", email: "orders@intervet.pk", address: "Islamabad, Pakistan" },
  })

  // ── Customers ─────────────────────────────────────────────────────────────
  await prisma.customer.createMany({
    skipDuplicates: true,
    data: [
      { id: "cust-001", companyId: company.id, name: "Ali Poultry Farm", type: CustomerType.FARM, phone: "+92-311-1111111", area: "Sheikhupura", creditLimit: 500000 },
      { id: "cust-002", companyId: company.id, name: "Dr. Khan Vet Shop", type: CustomerType.VET_SHOP, phone: "+92-311-2222222", area: "Gujranwala", creditLimit: 200000 },
      { id: "cust-003", companyId: company.id, name: "Raza Agricultural Supplies", type: CustomerType.SUB_DEALER, phone: "+92-311-3333333", area: "Faisalabad", creditLimit: 1000000 },
      { id: "cust-004", companyId: company.id, name: "City Poultry Farm", type: CustomerType.FARM, phone: "+92-311-4444444", area: "Lahore", creditLimit: 300000 },
      { id: "cust-005", companyId: company.id, name: "Hassan Brothers", type: CustomerType.RETAIL, phone: "+92-311-5555555", area: "Multan", creditLimit: 100000 },
    ],
  })

  // ── Categories ────────────────────────────────────────────────────────────
  const vaccines = await prisma.category.upsert({
    where: { name_companyId: { name: "Vaccines", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Vaccines", description: "Poultry and livestock vaccines" },
  })
  const antibiotics = await prisma.category.upsert({
    where: { name_companyId: { name: "Antibiotics", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Antibiotics", description: "Antibacterial medicines" },
  })
  const vitamins = await prisma.category.upsert({
    where: { name_companyId: { name: "Vitamins & Supplements", companyId: company.id } },
    update: {},
    create: { companyId: company.id, name: "Vitamins & Supplements", description: "Nutritional supplements" },
  })

  // ── Products + Batches ────────────────────────────────────────────────────
  const now = Date.now()
  const days = (n: number) => new Date(now + n * 86400_000)
  const mfgFromExpiry = (exp: Date) => new Date(exp.getTime() - 365 * 86400_000)

  const productSeed = [
    {
      id: "prod-001", name: "Newcastle Disease Vaccine (NDV) La Sota",
      genericName: "Newcastle Disease Virus Live Vaccine",
      species: Species.BROILER, unit: UnitType.VIAL,
      categoryId: vaccines.id, supplierId: msd.id,
      salePrice: 850, purchasePrice: 620, reorderLevel: 50,
      batches: [
        { id: "bat-001-a", num: "NDV-2024-001", exp: days(20),  qty: 30 },   // ⚠ critical <30d
        { id: "bat-001-b", num: "NDV-2024-002", exp: days(55),  qty: 100 },  // ⚠ <60d
        { id: "bat-001-c", num: "NDV-2025-001", exp: days(200), qty: 200 },
      ],
    },
    {
      id: "prod-002", name: "Infectious Bursal Disease Vaccine (IBD/Gumboro)",
      genericName: "IBD Live Vaccine – Intermediate Plus",
      species: Species.BROILER, unit: UnitType.VIAL,
      categoryId: vaccines.id, supplierId: msd.id,
      salePrice: 1200, purchasePrice: 890, reorderLevel: 30,
      batches: [
        { id: "bat-002-a", num: "IBD-2024-001", exp: days(45),  qty: 60 },   // ⚠ <60d
        { id: "bat-002-b", num: "IBD-2025-001", exp: days(180), qty: 150 },
      ],
    },
    {
      id: "prod-003", name: "Marek's Disease Vaccine (HVT)",
      genericName: "Herpesvirus of Turkeys Type 1",
      species: Species.LAYER, unit: UnitType.VIAL,
      categoryId: vaccines.id, supplierId: pfizer.id,
      salePrice: 2500, purchasePrice: 1800, reorderLevel: 20,
      batches: [
        { id: "bat-003-a", num: "MDV-2024-001", exp: days(85),  qty: 25 },   // ⚠ <90d
        { id: "bat-003-b", num: "MDV-2025-001", exp: days(270), qty: 80 },
      ],
    },
    {
      id: "prod-004", name: "Infectious Bronchitis Vaccine (IB H120)",
      genericName: "IB Live Attenuated Vaccine H120 Strain",
      species: Species.LAYER, unit: UnitType.VIAL,
      categoryId: vaccines.id, supplierId: intervet.id,
      salePrice: 950, purchasePrice: 700, reorderLevel: 40,
      batches: [
        { id: "bat-004-a", num: "IB-2025-001", exp: days(150), qty: 8 },     // ⚠ below reorder (8 < 40)
      ],
    },
    {
      id: "prod-005", name: "Oxytetracycline 20% Soluble Powder",
      genericName: "Oxytetracycline Hydrochloride",
      species: Species.GENERAL, unit: UnitType.SACHET,
      categoryId: antibiotics.id, supplierId: pfizer.id,
      salePrice: 450, purchasePrice: 320, reorderLevel: 100,
      batches: [
        { id: "bat-005-a", num: "OTC-2024-001", exp: days(25),  qty: 80 },   // ⚠ critical <30d
        { id: "bat-005-b", num: "OTC-2025-001", exp: days(365), qty: 300 },
      ],
    },
    {
      id: "prod-006", name: "Tylosin Tartrate 50% Soluble Powder",
      genericName: "Tylosin Tartrate",
      species: Species.BROILER, unit: UnitType.SACHET,
      categoryId: antibiotics.id, supplierId: msd.id,
      salePrice: 680, purchasePrice: 490, reorderLevel: 80,
      batches: [
        { id: "bat-006-a", num: "TYL-2025-001", exp: days(400), qty: 5 },    // ⚠ below reorder (5 < 80)
      ],
    },
    {
      id: "prod-007", name: "Enrofloxacin 10% Oral Solution",
      genericName: "Enrofloxacin",
      species: Species.GENERAL, unit: UnitType.ML,
      categoryId: antibiotics.id, supplierId: intervet.id,
      salePrice: 1800, purchasePrice: 1300, reorderLevel: 50,
      batches: [
        { id: "bat-007-a", num: "ENR-2024-001", exp: days(70),  qty: 60 },   // ⚠ <90d
        { id: "bat-007-b", num: "ENR-2025-001", exp: days(500), qty: 120 },
      ],
    },
    {
      id: "prod-008", name: "Amoxicillin 70% Water Soluble Powder",
      genericName: "Amoxicillin Trihydrate",
      species: Species.GENERAL, unit: UnitType.SACHET,
      categoryId: antibiotics.id, supplierId: pfizer.id,
      salePrice: 380, purchasePrice: 270, reorderLevel: 120,
      batches: [
        { id: "bat-008-a", num: "AMX-2025-001", exp: days(300), qty: 250 },
      ],
    },
    {
      id: "prod-009", name: "Vitamin AD3E Oral Solution",
      genericName: "Vitamins A, D3, and E",
      species: Species.GENERAL, unit: UnitType.ML,
      categoryId: vitamins.id, supplierId: intervet.id,
      salePrice: 1200, purchasePrice: 850, reorderLevel: 60,
      batches: [
        { id: "bat-009-a", num: "VIT-2024-001", exp: days(40),  qty: 90 },   // ⚠ <60d
        { id: "bat-009-b", num: "VIT-2025-001", exp: days(450), qty: 200 },
      ],
    },
    {
      id: "prod-010", name: "Multivitamin Electrolyte Powder",
      genericName: "Multivitamin + Electrolyte Complex",
      species: Species.GENERAL, unit: UnitType.SACHET,
      categoryId: vitamins.id, supplierId: msd.id,
      salePrice: 290, purchasePrice: 200, reorderLevel: 150,
      batches: [
        { id: "bat-010-a", num: "MVE-2025-001", exp: days(550), qty: 12 },   // ⚠ below reorder (12 < 150)
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
        species: data.species,
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
          expiryDate: b.exp,
          manufactureDate: mfgFromExpiry(b.exp),
          purchasePrice: data.purchasePrice,
          salePrice: data.salePrice,
          quantity: b.qty,
          initialQuantity: b.qty,
        },
      })
    }
  }

  // ── Chart of Accounts ─────────────────────────────────────────────────────
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
