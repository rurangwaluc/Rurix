import { z } from "zod";

export const registerOwnerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  businessType: z
    .enum(["product", "service", "product_and_service"])
    .default("product_and_service"),
  mainBranchName: z.string().trim().min(2).max(120),

  ownerFullName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(160),
  ownerPhone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(120),
  deviceKey: z.string().trim().min(8).max(160).optional(),
  deviceName: z.string().trim().max(120).optional(),
  platform: z.string().trim().max(80).optional(),
});

export type RegisterOwnerInput = z.infer<typeof registerOwnerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
