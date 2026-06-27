# Poultry & Vet Medicine Distribution System

A full-stack web application for poultry and veterinary medicine distributors and retailers. Runs offline on a LAN server or online in the cloud — accessible from any desktop browser.

**Tech stack:** Next.js 16 · TypeScript · PostgreSQL · Prisma ORM · NextAuth.js · Tailwind CSS v4

---

## Quick start (local development)

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ running locally

### 1. Clone and install

```bash
git clone <repo-url>
cd Poultry-
npm install           # downloads Prisma engine binaries automatically
```

### 2. Set up environment

```bash
cp .env.example .env.local
# Edit .env.local — fill in DATABASE_URL and generate NEXTAUTH_SECRET:
#   openssl rand -base64 32
```

### 3. Set up the database

```bash
# Create the schema via migrations
npm run db:migrate

# Seed with demo data (10 products, 3 suppliers, 5 customers, chart of accounts)
npm run db:seed
```

### 4. Start the dev server

```bash
npm run dev
# → http://localhost:3000
```

---

## Demo login credentials

| Email | Password | Role |
|---|---|---|
| owner@demo.com | demo1234 | OWNER |
| cashier@demo.com | demo1234 | CASHIER |
| salesman@demo.com | demo1234 | SALESMAN |

---

## Useful commands

```bash
npm run db:studio     # Prisma Studio — visual database browser
npm run db:reset      # Wipe and re-seed (dev only)
npm run db:generate   # Regenerate Prisma client after schema changes
npm run build         # Production build
npm run start         # Start production server
```

---

## Project structure

```
prisma/
  schema.prisma       # Full database schema (20+ models)
  seed.ts             # Demo data (idempotent upserts)

src/
  app/
    (auth)/login/     # Login page (no sidebar)
    (dashboard)/      # All protected pages share the sidebar layout
      page.tsx        # Dashboard home — live DB stats + roadmap
      inventory/      # Module 2  — Products & batches
      sales/          # Module 4  — Invoicing
      purchases/      # Module 5  — Purchase orders
      customers/      # Module 6  — Customer ledger
      suppliers/      # Module 5  — Supplier directory
      accounts/       # Module 7  — Double-entry accounting
      reports/        # Module 8  — Reports
      settings/       # Module 9  — Users & roles
    api/auth/         # NextAuth route handler

  components/
    layout/           # Sidebar, Topbar
    providers.tsx     # SessionProvider wrapper

  lib/
    db.ts             # Prisma client singleton
    auth.ts           # NextAuth credentials config
    utils.ts          # cn(), formatCurrency, formatDate, daysUntilExpiry

  types/
    index.ts          # Shared TS types
    next-auth.d.ts    # NextAuth session augmentation (role, companyId)
```

---

## Key design decisions

- **FEFO enforced**: `SaleInvoiceItem.batchId` is non-nullable. Every sale line references a specific batch; the API always picks the one with the earliest `expiryDate` that has stock.
- **Money in `Decimal(12,2)`**: No floating-point arithmetic anywhere near money.
- **Double-entry accounting**: Every financial event (sale, payment) auto-creates a balanced `JournalEntry` with `JournalLine` rows inside a database transaction.
- **Multi-tenant**: Every record carries `companyId`. Isolating a new business means creating a `Company` + `OWNER` user — no schema changes.
- **Audit trail**: `AuditLog` records who changed what with before/after JSON values.

---

## Module delivery plan

| # | Module | Status |
|---|---|---|
| 1 | Project Setup, schema, seed, auth, layout | ✅ Done |
| 2 | Inventory (products, batches, stock) | 🔜 Next |
| 3 | Expiry & Low-Stock Alerts + FEFO logic | ⏳ |
| 4 | Sales & Invoicing (PDF, WhatsApp link) | ⏳ |
| 5 | Purchases & Suppliers | ⏳ |
| 6 | Customers & Ledger | ⏳ |
| 7 | Accounts (double-entry, day book, P&L) | ⏳ |
| 8 | Reports & Dashboard | ⏳ |
| 9 | Users, Roles & Audit Log | ⏳ |

---

## Deployment

Standard Next.js app — any Node.js host works (VPS, Railway, Render, Vercel + Neon, etc.).

1. Set `DATABASE_URL` to your production PostgreSQL URL.
2. Set `NEXTAUTH_SECRET` (strong random string).
3. Set `NEXTAUTH_URL` to your public domain.
4. `npm run db:migrate` on first deploy.
5. `npm start` (or let the platform handle it).
