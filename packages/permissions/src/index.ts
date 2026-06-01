import type { BranchRole, BusinessMemberType, Permission } from "@rurix/domain";

import { permissions } from "@rurix/domain";

const allPermissions = [...permissions];

const ownerPermissions = allPermissions.filter(
  (permission) => permission !== "OWNER_REMOVE",
);

const partnerDefaultPermissions: Permission[] = [
  "BUSINESS_VIEW",
  "BRANCH_VIEW",

  "CATALOG_VIEW",

  "CUSTOMER_VIEW",

  "SALE_VIEW",
  "SALE_RECEIPT_VIEW",

  "STOCK_VIEW",
  "STOCK_MOVEMENT_VIEW",
  "STOCK_TRANSFER_VIEW",

  "SUPPLIER_VIEW",
  "PURCHASE_ORDER_VIEW",

  "ORDER_VIEW",
  "PAYMENT_VIEW",

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

    "CATALOG_VIEW",
    "CATALOG_CREATE",
    "CATALOG_UPDATE",
    "CATALOG_PRICE_UPDATE",

    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",
    "CUSTOMER_UPDATE",

    "SALE_VIEW",
    "SALE_CREATE",
    "SALE_RECEIPT_VIEW",

    "ORDER_VIEW",

    "PAYMENT_VIEW",

    "STOCK_VIEW",
    "STOCK_RECEIVE",
    "STOCK_ADJUST",
    "STOCK_DAMAGE_REPORT",
    "STOCK_LOSS_REPORT",
    "STOCK_MOVEMENT_VIEW",
    "STOCK_RESERVE",
    "STOCK_RELEASE",
    "STOCK_ADJUSTMENT_REQUEST",
    "STOCK_TRANSFER_VIEW",
    "STOCK_TRANSFER_CREATE",

    "SERVICE_VIEW",

    "EXPENSE_VIEW",

    "SUPPLIER_VIEW",
    "SUPPLIER_CREATE",
    "SUPPLIER_UPDATE",

    "PURCHASE_ORDER_VIEW",
    "PURCHASE_ORDER_CREATE",
    "PURCHASE_ORDER_UPDATE",
    "PURCHASE_ORDER_MARK_ORDERED",
    "PURCHASE_ORDER_CANCEL",
    "PURCHASE_ORDER_RECEIVE",
    "PURCHASE_ORDER_SEND",

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

    "CATALOG_VIEW",

    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",
    "CUSTOMER_UPDATE",

    "SALE_VIEW",
    "SALE_CREATE",
    "SALE_RECEIPT_VIEW",

    "ORDER_VIEW",
    "ORDER_CANCEL_REQUEST",

    "PAYMENT_VIEW",
    "PAYMENT_REFUND_REQUEST",

    "STOCK_VIEW",
    "STOCK_DAMAGE_REPORT",
    "STOCK_LOSS_REPORT",
    "STOCK_MOVEMENT_VIEW",
    "STOCK_ADJUSTMENT_REQUEST",
    "STOCK_TRANSFER_VIEW",

    "SERVICE_VIEW",

    "EXPENSE_VIEW",
    "EXPENSE_APPROVE",

    "SUPPLIER_VIEW",

    "PURCHASE_ORDER_VIEW",

    "CASH_SESSION_VIEW",

    "REPORT_VIEW",
    "RISK_VIEW",
    "APPROVAL_DECIDE",
    "ACTIVITY_VIEW",
    "OFFLINE_SYNC_SUBMIT",
  ],

  SELLER: [
    "BRANCH_VIEW",

    "CATALOG_VIEW",

    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",

    "SALE_VIEW",
    "SALE_CREATE",
    "SALE_RECEIPT_VIEW",

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

    "CATALOG_VIEW",

    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",

    "SALE_VIEW",
    "SALE_CREATE",
    "SALE_RECEIPT_VIEW",

    "ORDER_VIEW",

    "PAYMENT_COLLECT",
    "PAYMENT_VIEW",
    "PAYMENT_REFUND_REQUEST",

    "SERVICE_VIEW",

    "CASH_SESSION_OPEN",
    "CASH_SESSION_CLOSE",
    "CASH_SESSION_VIEW",

    "OFFLINE_SYNC_SUBMIT",
  ],

  STOREKEEPER: [
    "BRANCH_VIEW",

    "CATALOG_VIEW",

    "ORDER_VIEW",

    "STOCK_VIEW",
    "STOCK_RECEIVE",
    "STOCK_ADJUST",
    "STOCK_DAMAGE_REPORT",
    "STOCK_LOSS_REPORT",
    "STOCK_MOVEMENT_VIEW",
    "STOCK_RESERVE",
    "STOCK_RELEASE",
    "STOCK_ADJUSTMENT_REQUEST",
    "STOCK_TRANSFER_VIEW",
    "STOCK_TRANSFER_CREATE",

    "PURCHASE_ORDER_VIEW",
    "PURCHASE_ORDER_RECEIVE",

    "OFFLINE_SYNC_SUBMIT",
  ],

  SERVICE_STAFF: [
    "BRANCH_VIEW",

    "CATALOG_VIEW",

    "CUSTOMER_VIEW",

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
