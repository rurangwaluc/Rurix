import { z } from "zod";

const uuidSchema = z.string().uuid();

const optionalText = (max = 1000) => z.string().trim().max(max).optional();

const optionalDateText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .optional();

export const purchaseOrderStatusSchema = z.enum([
  "draft",
  "ordered",
  "partly_received",
  "fully_received",
  "cancelled",
]);

export const purchaseOrderSendMethodSchema = z.enum([
  "pdf_download",
  "email",
  "whatsapp",
]);

export const createStockTransferSchema = z
  .object({
    itemId: uuidSchema,
    fromBranchId: uuidSchema,
    toBranchId: uuidSchema,
    quantity: z.coerce.number().int().min(1).max(999999),
    reference: z.string().trim().max(80).optional(),
    reason: optionalText(300),
    note: optionalText(1000),
  })
  .refine((value) => value.fromBranchId !== value.toBranchId, {
    message: "Choose two different locations.",
    path: ["toBranchId"],
  });

export const listStockTransfersQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  itemId: uuidSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export const purchaseOrderItemSchema = z.object({
  itemId: uuidSchema,
  quantityOrdered: z.coerce.number().int().min(1).max(999999),
  expectedUnitCostCents: z.coerce.number().int().min(0).optional(),
  note: optionalText(500),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: uuidSchema,
  deliveryBranchId: uuidSchema.optional(),
  expectedDeliveryDate: optionalDateText,
  notes: optionalText(1000),
  items: z.array(purchaseOrderItemSchema).min(1).max(100),
});

export const updatePurchaseOrderSchema = z.object({
  supplierId: uuidSchema,
  deliveryBranchId: uuidSchema.optional(),
  expectedDeliveryDate: optionalDateText,
  notes: optionalText(1000),
  items: z.array(purchaseOrderItemSchema).min(1).max(100),
});

export const listPurchaseOrdersQuerySchema = z.object({
  status: purchaseOrderStatusSchema.optional(),
  supplierId: uuidSchema.optional(),
  deliveryBranchId: uuidSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export const markPurchaseOrderOrderedSchema = z.object({
  note: optionalText(1000),
});

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
});

export const receivePurchaseOrderItemSchema = z.object({
  purchaseOrderItemId: uuidSchema,
  quantityReceived: z.coerce.number().int().min(1).max(999999),
  actualUnitCostCents: z.coerce.number().int().min(0).optional(),
  note: optionalText(500),
});

export const receivePurchaseOrderSchema = z.object({
  receivedBranchId: uuidSchema,
  receiptNumber: z.string().trim().max(80).optional(),
  note: optionalText(1000),
  items: z.array(receivePurchaseOrderItemSchema).min(1).max(100),
});

export const purchaseOrderSendSchema = z.object({
  method: purchaseOrderSendMethodSchema,
  recipientName: z.string().trim().max(120).optional(),
  recipientEmail: z.string().trim().email().max(180).optional(),
  recipientPhone: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(180).optional(),
  message: z.string().trim().max(3000).optional(),
});

export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;
export type PurchaseOrderSendMethod = z.infer<
  typeof purchaseOrderSendMethodSchema
>;
export type CreateStockTransferInput = z.infer<
  typeof createStockTransferSchema
>;
export type ListStockTransfersQuery = z.infer<
  typeof listStockTransfersQuerySchema
>;
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;
export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;
export type UpdatePurchaseOrderInput = z.infer<
  typeof updatePurchaseOrderSchema
>;
export type ListPurchaseOrdersQuery = z.infer<
  typeof listPurchaseOrdersQuerySchema
>;
export type MarkPurchaseOrderOrderedInput = z.infer<
  typeof markPurchaseOrderOrderedSchema
>;
export type CancelPurchaseOrderInput = z.infer<
  typeof cancelPurchaseOrderSchema
>;
export type ReceivePurchaseOrderInput = z.infer<
  typeof receivePurchaseOrderSchema
>;
export type PurchaseOrderSendInput = z.infer<typeof purchaseOrderSendSchema>;
