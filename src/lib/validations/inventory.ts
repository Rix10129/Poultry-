import { z } from "zod"

// ── Product ───────────────────────────────────────────────────────────────────

export const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  genericName: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  supplierId: z.string().optional(),
  species: z.string().min(1, "Species is required"),
  unit: z.string().min(1, "Unit is required"),
  subUnit: z.string().optional(),
  unitsPerPack: z.coerce.number().int().positive().optional(),
  salePrice: z.coerce.number().positive("Sale price must be greater than 0"),
  purchasePrice: z.coerce.number().positive("Purchase price must be greater than 0"),
  reorderLevel: z.coerce.number().int().min(0).default(10),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  description: z.string().optional(),
})

export type ProductInput = z.infer<typeof productSchema>

// ── Batch ─────────────────────────────────────────────────────────────────────

export const batchSchema = z.object({
  batchNumber: z.string().min(1, "Batch number is required"),
  manufactureDate: z.string().optional(),
  expiryDate: z.string().min(1, "Expiry date is required"),
  purchasePrice: z.coerce.number().positive("Purchase price must be greater than 0"),
  salePrice: z.coerce.number().positive("Sale price must be greater than 0"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
})

export type BatchInput = z.infer<typeof batchSchema>

// ── Stock Adjustment ──────────────────────────────────────────────────────────

export const stockAdjustSchema = z.object({
  batchId: z.string().min(1),
  quantity: z.coerce.number().int(),
  notes: z.string().optional(),
})

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>
