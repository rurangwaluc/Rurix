import { z } from "zod";

const optionalText = (max = 300) => z.string().trim().max(max).optional();

export const supplierStatusSchema = z.enum(["active", "inactive"]);

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: optionalText(120),
  phone: optionalText(40),
  email: z.string().trim().email().max(180).optional(),
  address: optionalText(300),
  notes: optionalText(1000),
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: optionalText(120),
  phone: optionalText(40),
  email: z.string().trim().email().max(180).optional(),
  address: optionalText(300),
  notes: optionalText(1000),
  status: supplierStatusSchema,
});

export const listSuppliersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: supplierStatusSchema.optional(),
});

export type SupplierStatus = z.infer<typeof supplierStatusSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
