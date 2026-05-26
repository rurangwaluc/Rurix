import { z } from "zod";

export const locationStatusSchema = z.enum(["active", "inactive"]);

export const createLocationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  isMain: z.boolean().optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  status: locationStatusSchema,
  isMain: z.boolean(),
});

export type LocationStatus = z.infer<typeof locationStatusSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
