import type { BranchRole, BusinessMemberType, Permission } from "@rurix/domain";

import { permissions } from "@rurix/domain";

const allPermissions = [...permissions];

const ownerPermissions = allPermissions.filter(
  (permission) => permission !== "OWNER_REMOVE",
);

const partnerDefaultPermissions: Permission[] = [
  "BUSINESS_VIEW",
  "BRANCH_VIEW",
  "REPORT_VIEW",
  "RISK_VIEW",
  "ACTIVITY_VIEW",
];

const branchRolePermissions: Record<BranchRole, Permission[]> = {
  ADMIN: [
    "BUSINESS_VIEW",
    "BRANCH_VIEW",
    "BRANCH_UPDATE",
    "BRANCH_ASSIGN_STAFF",
    "STAFF_VIEW",
    "STAFF_CREATE",
    "STAFF_UPDATE",
    "STAFF_DISABLE",
    "STAFF_ASSIGN_BRANCH",
    "STAFF_REMOVE_FROM_BRANCH",
    "STAFF_ASSIGN_ROLE",
    "STAFF_REMOVE_ROLE",
    "STAFF_RESET_PASSWORD",
    "ORDER_VIEW",
    "PAYMENT_VIEW",
    "STOCK_VIEW",
    "SERVICE_VIEW",
    "EXPENSE_VIEW",
    "SUPPLIER_VIEW",
    "CASH_SESSION_VIEW",
    "REPORT_VIEW",
    "RISK_VIEW",
    "APPROVAL_DECIDE",
    "ACTIVITY_VIEW",
    "OFFLINE_SYNC_SUBMIT",
  ],
  MANAGER: [
    "BRANCH_VIEW",
    "STAFF_VIEW",
    "ORDER_VIEW",
    "ORDER_CANCEL_REQUEST",
    "PAYMENT_VIEW",
    "PAYMENT_REFUND_REQUEST",
    "STOCK_VIEW",
    "STOCK_ADJUSTMENT_REQUEST",
    "SERVICE_VIEW",
    "EXPENSE_VIEW",
    "EXPENSE_APPROVE",
    "CASH_SESSION_VIEW",
    "REPORT_VIEW",
    "RISK_VIEW",
    "APPROVAL_DECIDE",
    "ACTIVITY_VIEW",
    "OFFLINE_SYNC_SUBMIT",
  ],
  SELLER: [
    "BRANCH_VIEW",
    "ORDER_CREATE",
    "ORDER_SUBMIT",
    "ORDER_VIEW",
    "ORDER_CANCEL_REQUEST",
    "STOCK_VIEW",
    "SERVICE_VIEW",
    "OFFLINE_SYNC_SUBMIT",
  ],
  CASHIER: [
    "BRANCH_VIEW",
    "ORDER_VIEW",
    "PAYMENT_COLLECT",
    "PAYMENT_VIEW",
    "PAYMENT_REFUND_REQUEST",
    "CASH_SESSION_OPEN",
    "CASH_SESSION_CLOSE",
    "CASH_SESSION_VIEW",
    "OFFLINE_SYNC_SUBMIT",
  ],
  STOREKEEPER: [
    "BRANCH_VIEW",
    "ORDER_VIEW",
    "STOCK_VIEW",
    "STOCK_RESERVE",
    "STOCK_RELEASE",
    "STOCK_ADJUSTMENT_REQUEST",
    "OFFLINE_SYNC_SUBMIT",
  ],
  SERVICE_STAFF: [
    "BRANCH_VIEW",
    "ORDER_VIEW",
    "SERVICE_VIEW",
    "SERVICE_COMPLETE",
    "OFFLINE_SYNC_SUBMIT",
  ],
};

export function getPermissionsForAccess(input: {
  memberType: BusinessMemberType;
  branchRoles: BranchRole[];
}): Permission[] {
  if (input.memberType === "PRIMARY_OWNER") {
    return allPermissions;
  }

  if (input.memberType === "OWNER") {
    return ownerPermissions;
  }

  const result = new Set<Permission>();

  if (input.memberType === "PARTNER") {
    for (const permission of partnerDefaultPermissions) {
      result.add(permission);
    }
  }

  for (const role of input.branchRoles) {
    for (const permission of branchRolePermissions[role] || []) {
      result.add(permission);
    }
  }

  return [...result];
}

export function hasPermission(
  permissionsToCheck: Permission[],
  permission: Permission,
) {
  return permissionsToCheck.includes(permission);
}
