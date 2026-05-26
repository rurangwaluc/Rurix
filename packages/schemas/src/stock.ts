import { z } from "zod";

export const stockAdjustmentTypeSchema = z.enum([
  "COUNT_CORRECTION",
  "DAMAGED_REPORTED",
  "DAMAGED_RESTORED",
  "MISSING_REPORTED",
  "STOLEN_REPORTED",
]);

const baseStockAdjustmentSchema = z.object({
  branchId: z.string().uuid(),
  itemId: z.string().uuid(),
  note: z.string().trim().min(2).max(1000),
  reference: z.string().trim().max(160).optional(),
});

export const receiveStockSchema = z.object({
  branchId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitCostCents: z.number().int().min(0).optional(),
  supplierName: z.string().trim().max(160).optional(),
  reference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const adjustStockSchema = z.discriminatedUnion("adjustmentType", [
  baseStockAdjustmentSchema.extend({
    adjustmentType: z.literal("COUNT_CORRECTION"),
    countedAvailableQuantity: z.number().int().min(0),
  }),
  baseStockAdjustmentSchema.extend({
    adjustmentType: z.literal("DAMAGED_REPORTED"),
    quantity: z.number().int().min(1),
  }),
  baseStockAdjustmentSchema.extend({
    adjustmentType: z.literal("DAMAGED_RESTORED"),
    quantity: z.number().int().min(1),
  }),
  baseStockAdjustmentSchema.extend({
    adjustmentType: z.literal("MISSING_REPORTED"),
    quantity: z.number().int().min(1),
  }),
  baseStockAdjustmentSchema.extend({
    adjustmentType: z.literal("STOLEN_REPORTED"),
    quantity: z.number().int().min(1),
  }),
]);

export const updateStockAlertSchema = z.object({
  branchId: z.string().uuid(),
  itemId: z.string().uuid(),
  lowStockAlertQuantity: z.number().int().min(0).max(1_000_000),
});

export const listStockQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  onlyLowStock: z.coerce.boolean().optional(),
});

export const listStockMovementsQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  movementType: z
    .enum([
      "INITIAL_STOCK",
      "STOCK_RECEIVED",
      "COUNT_CORRECTION",
      "DAMAGED_REPORTED",
      "DAMAGED_RESTORED",
      "MISSING_REPORTED",
      "STOLEN_REPORTED",
    ])
    .optional(),
});

export type StockAdjustmentType = z.infer<typeof stockAdjustmentTypeSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type UpdateStockAlertInput = z.infer<typeof updateStockAlertSchema>;
export type ListStockQueryInput = z.infer<typeof listStockQuerySchema>;
export type ListStockMovementsQueryInput = z.infer<
  typeof listStockMovementsQuerySchema
>;
