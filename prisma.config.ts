import path from "path"
import { defineConfig } from "prisma/config"

// Prisma 7: DB URL lives here (for migrate/introspect) instead of schema.prisma
// PrismaClient gets the connection via pg adapter (see src/lib/db.ts)
export default defineConfig({
  schema: path.join(__dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
