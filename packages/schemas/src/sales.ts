import { z } from "zod";

export const salePaymentMethodSchema = z.enum([
  "cash",
  "mobile_money",
  "bank_transfer",
  "card",
]);

export const customerStatusSchema = z.enum(["active", "inactive"]);

export const saleStatusSchema = z.enum([
  "completed",
  "cancelled",
  "refunded",
  "partly_refunded",
]);

export const saleTypeSchema = z.enum(["direct_sale", "converted_proforma"]);

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").optional(),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  status: customerStatusSchema.optional(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: customerStatusSchema.optional(),
});

export const createSaleItemSchema = z.object({
  itemId: z.string().uuid("Choose a valid product."),
  quantity: z.coerce
    .number()
    .int()
    .positive("Quantity must be greater than zero."),
  unitPriceCents: z.coerce.number().int().min(0).optional(),
  discountCents: z.coerce.number().int().min(0).optional(),
});

export const createSalePaymentSchema = z.object({
  method: salePaymentMethodSchema,
  amountCents: z.coerce
    .number()
    .int()
    .positive("Payment amount must be greater than zero."),
  reference: z.string().trim().optional(),
});

export const createSaleSchema = z.object({
  branchId: z.string().uuid("Choose a valid selling location."),
  customerId: z.string().uuid("Choose a valid customer.").optional(),
  customer: createCustomerSchema.optional(),
  items: z.array(createSaleItemSchema).min(1, "Add at least one product."),
  payments: z
    .array(createSalePaymentSchema)
    .min(1, "Add at least one payment."),
  discountCents: z.coerce.number().int().min(0).optional(),
  taxCents: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const listSalesQuerySchema = z.object({
  search: z.string().trim().optional(),
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: saleStatusSchema.optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export const saleIdParamsSchema = z.object({
  id: z.string().uuid("Choose a valid sale."),
});

export type SalePaymentMethodInput = z.infer<typeof salePaymentMethodSchema>;
export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;
export type SaleStatusInput = z.infer<typeof saleStatusSchema>;
export type SaleTypeInput = z.infer<typeof saleTypeSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesQueryInput = z.infer<typeof listSalesQuerySchema>;
export type SaleIdParamsInput = z.infer<typeof saleIdParamsSchema>;
