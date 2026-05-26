import type { LucideIcon } from "lucide-react";
import type { StaffRole } from "../../lib/api";

export type AppSection =
  | "dashboard"
  | "sales"
  | "stock"
  | "payments"
  | "cash"
  | "expenses"
  | "refunds"
  | "staff"
  | "locations"
  | "reports"
  | "settings";

export type AppNavItem = {
  key: AppSection;
  label: string;
  icon: LucideIcon;
};

export type StaffFormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  branchId: string;
  roles: StaffRole[];
};

export type StaffEditFormState = {
  fullName: string;
  email: string;
  phone: string;
};

export type StaffPasswordFormState = {
  password: string;
};

export type StaffLocationAssignFormState = {
  branchId: string;
  roles: StaffRole[];
};

export const initialStaffForm: StaffFormState = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  branchId: "",
  roles: ["SELLER"],
};

export const initialStaffEditForm: StaffEditFormState = {
  fullName: "",
  email: "",
  phone: "",
};

export const initialStaffPasswordForm: StaffPasswordFormState = {
  password: "",
};

export const initialStaffLocationAssignForm: StaffLocationAssignFormState = {
  branchId: "",
  roles: ["SELLER"],
};
