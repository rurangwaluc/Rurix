import { z } from "zod";

export const catalogItemKindSchema = z.enum(["PRODUCT", "SERVICE"]);

export const catalogItemStatusSchema = z.enum(["active", "inactive"]);

export const createItemCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

export const updateItemCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  status: catalogItemStatusSchema,
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(120).optional(),
  sellingPriceCents: z.number().int().min(0),
  costPriceCents: z.number().int().min(0).optional(),
  trackStock: z.boolean(),
  lowStockAlertQuantity: z.number().int().min(0).optional(),
  startingStock: z
    .array(
      z.object({
        branchId: z.string().uuid(),
        quantity: z.number().int().min(0),
      }),
    )
    .optional(),
  note: z.string().trim().max(1000).optional(),
});

export const createServiceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  serviceCode: z.string().trim().max(80).optional(),
  sellingPriceCents: z.number().int().min(0),
  costEstimateCents: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(120).optional(),
  sellingPriceCents: z.number().int().min(0),
  costPriceCents: z.number().int().min(0).optional(),
  trackStock: z.boolean(),
  lowStockAlertQuantity: z.number().int().min(0).optional(),
  status: catalogItemStatusSchema,
  priceChangeReason: z.string().trim().max(500).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  serviceCode: z.string().trim().max(80).optional(),
  sellingPriceCents: z.number().int().min(0),
  costEstimateCents: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  status: catalogItemStatusSchema,
  priceChangeReason: z.string().trim().max(500).optional(),
});

export const listCatalogItemsQuerySchema = z.object({
  kind: catalogItemKindSchema.optional(),
  status: catalogItemStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export type CatalogItemKind = z.infer<typeof catalogItemKindSchema>;
export type CatalogItemStatus = z.infer<typeof catalogItemStatusSchema>;

export type CreateItemCategoryInput = z.infer<typeof createItemCategorySchema>;
export type UpdateItemCategoryInput = z.infer<typeof updateItemCategorySchema>;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export type ListCatalogItemsQueryInput = z.infer<
  typeof listCatalogItemsQuerySchema
>;
