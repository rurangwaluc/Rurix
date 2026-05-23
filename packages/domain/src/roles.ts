export const businessMemberTypes = [
  "PRIMARY_OWNER",
  "OWNER",
  "PARTNER",
  "STAFF",
] as const;

export type BusinessMemberType = (typeof businessMemberTypes)[number];

export const branchRoles = [
  "ADMIN",
  "MANAGER",
  "SELLER",
  "CASHIER",
  "STOREKEEPER",
  "SERVICE_STAFF",
] as const;

export type BranchRole = (typeof branchRoles)[number];

export const businessTypes = [
  "product",
  "service",
  "product_and_service",
] as const;

export type BusinessType = (typeof businessTypes)[number];

export const accountStatuses = ["active", "inactive", "suspended"] as const;

export type AccountStatus = (typeof accountStatuses)[number];
