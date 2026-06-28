import path from "path"
import { defineConfig } from "prisma/config"
import fs from "fs"

// Prisma 7 doesn't auto-load .env when executing this config file, so we do it manually.
try {
  const envPath = path.join(__dirname, ".env")
  const lines = fs.readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !process.env[key]) process.env[key] = val
  }
} catch { /* .env not present — env vars must be set externally (e.g. Vercel) */ }

export default defineConfig({
  schema: path.join(__dirname, "prisma/schema.prisma"),
  migrations: {
    seed: "tsx ./prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
