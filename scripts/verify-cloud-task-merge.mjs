#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

const checks = [
  {
    label: "sales invoice edit page",
    type: "file",
    path: "src/app/(dashboard)/sales/[id]/edit/page.tsx",
  },
  {
    label: "updateInvoice server action",
    type: "content",
    path: "src/app/(dashboard)/sales/actions.ts",
    patterns: ["updateInvoice"],
  },
  {
    label: "sale invoice draft model/table",
    type: "anyContent",
    paths: ["prisma/schema.prisma", "src"],
    patterns: ["SaleInvoiceDraft", "sale_invoice_drafts"],
  },
  {
    label: "report export button",
    type: "content",
    path: "src/components/reports/report-export-button.tsx",
    patterns: ["ReportExportButton"],
  },
  {
    label: "report export API routes",
    type: "files",
    paths: [
      "src/app/api/reports/sales/export/route.ts",
      "src/app/api/reports/purchases/export/route.ts",
      "src/app/api/reports/stock/export/route.ts",
    ],
  },
  {
    label: "advanced sales filters",
    type: "content",
    path: "src/app/(dashboard)/sales/page.tsx",
    patterns: ["paymentMode", "customerType", "salesmanId", "routeId"],
  },
  {
    label: "compact invoice print classes",
    type: "content",
    path: "src/app/(dashboard)/sales/[id]/page.tsx",
    patterns: ["print:text-[", "print:py-", "print:px-"],
  },
]

function readText(path) {
  const fullPath = join(root, path)
  if (!existsSync(fullPath)) return ""
  return readFileSync(fullPath, "utf8")
}

function collectText(paths) {
  const chunks = []

  for (const path of paths) {
    const fullPath = join(root, path)
    if (!existsSync(fullPath)) continue

    if (statSync(fullPath).isDirectory()) {
      const entries = readdirSync(fullPath, { recursive: true, withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!/\.(ts|tsx|js|jsx|prisma|css)$/.test(entry.name)) continue
        chunks.push(readText(join(entry.parentPath, entry.name).slice(root.length + 1)))
      }
      continue
    }

    chunks.push(readText(path))
  }

  return chunks.join("\n")
}

const results = checks.map((check) => {
  if (check.type === "file") {
    return { ...check, passed: existsSync(join(root, check.path)) }
  }

  if (check.type === "files") {
    const missing = check.paths.filter((path) => !existsSync(join(root, path)))
    return { ...check, passed: missing.length === 0, missing }
  }

  if (check.type === "content") {
    const text = readText(check.path)
    const missing = check.patterns.filter((pattern) => !text.includes(pattern))
    return { ...check, passed: missing.length === 0, missing }
  }

  if (check.type === "anyContent") {
    const text = collectText(check.paths)
    return { ...check, passed: check.patterns.some((pattern) => text.includes(pattern)) }
  }

  return { ...check, passed: false }
})

for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL"
  const detail = result.missing?.length ? ` (missing: ${result.missing.join(", ")})` : ""
  console.log(`${status} ${result.label}${detail}`)
}

if (results.some((result) => !result.passed)) {
  process.exitCode = 1
}
