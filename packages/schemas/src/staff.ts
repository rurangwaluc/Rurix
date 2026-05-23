import { z } from "zod";

export const staffRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "SELLER",
  "CASHIER",
  "STOREKEEPER",
  "SERVICE_STAFF",
]);

export const staffStatusSchema = z.enum(["active", "inactive", "suspended"]);

export const staffLocationAssignmentSchema = z.object({
  branchId: z.string().uuid(),
  roles: z.array(staffRoleSchema).min(1),
});

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(120),
  locationAssignments: z.array(staffLocationAssignmentSchema).min(1),
});

export const updateStaffDetailsSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional(),
});

export const resetStaffPasswordSchema = z.object({
  password: z.string().min(8).max(120),
});

export const updateStaffStatusSchema = z.object({
  status: staffStatusSchema,
});

export const assignStaffLocationRolesSchema = z.object({
  branchId: z.string().uuid(),
  roles: z.array(staffRoleSchema).min(1),
});

export const removeStaffLocationRolesSchema = z.object({
  branchId: z.string().uuid(),
  roles: z.array(staffRoleSchema).optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffDetailsInput = z.infer<typeof updateStaffDetailsSchema>;
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;
export type UpdateStaffStatusInput = z.infer<typeof updateStaffStatusSchema>;
export type AssignStaffLocationRolesInput = z.infer<
  typeof assignStaffLocationRolesSchema
>;
export type RemoveStaffLocationRolesInput = z.infer<
  typeof removeStaffLocationRolesSchema
>;
