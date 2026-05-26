import type { AppNavItem, AppSection } from "./app-types";
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  LayoutDashboard,
  MapPinHouse,
  ReceiptText,
  Settings,
  ShoppingBag,
  Undo2,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { CurrentUserResponse, StaffRole } from "../../lib/api";

const ownerMemberTypes = new Set(["PRIMARY_OWNER", "OWNER"]);

export type AppAccess = {
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  branchRoles: StaffRole[];
  allowedSections: AppNavItem[];
  defaultSection: AppSection;
  scopeLabel: string;
  canViewStaff: boolean;
  canManageStaff: boolean;
  canViewLocations: boolean;
  canManageLocations: boolean;
  canViewSettings: boolean;
  canViewStock: boolean;
  canManageCatalog: boolean;
  canMoveStock: boolean;
  dashboardMode:
    | "owner"
    | "admin"
    | "manager"
    | "seller_cashier"
    | "seller"
    | "cashier"
    | "storekeeper"
    | "service"
    | "limited";
};

const sectionItems: Record<AppSection, AppNavItem> = {
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  sales: {
    key: "sales",
    label: "Sales",
    icon: ShoppingBag,
  },
  stock: {
    key: "stock",
    label: "Stock",
    icon: Boxes,
  },
  payments: {
    key: "payments",
    label: "Payments",
    icon: CircleDollarSign,
  },
  cash: {
    key: "cash",
    label: "Cash",
    icon: WalletCards,
  },
  expenses: {
    key: "expenses",
    label: "Expenses",
    icon: ReceiptText,
  },
  refunds: {
    key: "refunds",
    label: "Refunds",
    icon: Undo2,
  },
  staff: {
    key: "staff",
    label: "Staff",
    icon: UsersRound,
  },
  locations: {
    key: "locations",
    label: "Locations",
    icon: MapPinHouse,
  },
  reports: {
    key: "reports",
    label: "Reports",
    icon: BarChart3,
  },
  settings: {
    key: "settings",
    label: "Settings",
    icon: Settings,
  },
};

export function buildAppAccess(context: CurrentUserResponse): AppAccess {
  const isOwner = ownerMemberTypes.has(context.membership.memberType);
  const branchRoles = getBranchRoles(context);

  const isAdmin = branchRoles.includes("ADMIN");
  const isManager = branchRoles.includes("MANAGER");
  const isSeller = branchRoles.includes("SELLER");
  const isCashier = branchRoles.includes("CASHIER");
  const isStorekeeper = branchRoles.includes("STOREKEEPER");
  const isServiceStaff = branchRoles.includes("SERVICE_STAFF");

  if (isOwner) {
    return {
      isOwner: true,
      isAdmin: false,
      isManager: false,
      branchRoles,
      allowedSections: getSections([
        "dashboard",
        "sales",
        "stock",
        "payments",
        "cash",
        "expenses",
        "refunds",
        "staff",
        "locations",
        "reports",
        "settings",
      ]),
      defaultSection: "dashboard",
      scopeLabel: "Whole business",
      canViewStaff: true,
      canManageStaff: true,
      canViewLocations: true,
      canManageLocations: true,
      canViewSettings: true,
      canViewStock: true,
      canManageCatalog: true,
      canMoveStock: true,
      dashboardMode: "owner",
    };
  }

  if (isAdmin) {
    return {
      isOwner: false,
      isAdmin: true,
      isManager,
      branchRoles,
      allowedSections: getSections([
        "dashboard",
        "sales",
        "stock",
        "payments",
        "cash",
        "expenses",
        "refunds",
        "staff",
        "locations",
        "reports",
      ]),
      defaultSection: "dashboard",
      scopeLabel: getBranchScopeLabel(context),
      canViewStaff: true,
      canManageStaff: true,
      canViewLocations: true,
      canManageLocations: true,
      canViewSettings: false,
      canViewStock: true,
      canManageCatalog: true,
      canMoveStock: true,
      dashboardMode: "admin",
    };
  }

  if (isManager) {
    return {
      isOwner: false,
      isAdmin: false,
      isManager: true,
      branchRoles,
      allowedSections: getSections([
        "dashboard",
        "sales",
        "stock",
        "payments",
        "cash",
        "expenses",
        "refunds",
        "locations",
        "reports",
      ]),
      defaultSection: "dashboard",
      scopeLabel: getBranchScopeLabel(context),
      canViewStaff: false,
      canManageStaff: false,
      canViewLocations: true,
      canManageLocations: false,
      canViewSettings: false,
      canViewStock: true,
      canManageCatalog: false,
      canMoveStock: false,
      dashboardMode: "manager",
    };
  }

  const sectionKeys = new Set<AppSection>(["dashboard"]);

  if (isSeller) {
    sectionKeys.add("sales");
    sectionKeys.add("refunds");
  }

  if (isCashier) {
    sectionKeys.add("payments");
    sectionKeys.add("cash");
    sectionKeys.add("expenses");
    sectionKeys.add("refunds");
  }

  if (isStorekeeper) {
    sectionKeys.add("stock");
  }

  const defaultSection = chooseDefaultSection({
    isSeller,
    isCashier,
    isStorekeeper,
    isServiceStaff,
  });

  return {
    isOwner: false,
    isAdmin: false,
    isManager: false,
    branchRoles,
    allowedSections: getSections([...sectionKeys]),
    defaultSection,
    scopeLabel: getBranchScopeLabel(context),
    canViewStaff: false,
    canManageStaff: false,
    canViewLocations: false,
    canManageLocations: false,
    canViewSettings: false,
    canViewStock: isStorekeeper,
    canManageCatalog: false,
    canMoveStock: isStorekeeper,
    dashboardMode: getStaffDashboardMode({
      isSeller,
      isCashier,
      isStorekeeper,
      isServiceStaff,
    }),
  };
}

export function canOpenSection(access: AppAccess, section: AppSection) {
  return access.allowedSections.some((item) => item.key === section);
}

function getSections(keys: AppSection[]) {
  return keys.map((key) => sectionItems[key]);
}

function getBranchRoles(context: CurrentUserResponse) {
  const roles = new Set<StaffRole>();

  for (const branch of context.branches) {
    for (const role of branch.roles) {
      roles.add(role as StaffRole);
    }
  }

  return [...roles];
}

function getBranchScopeLabel(context: CurrentUserResponse) {
  const branchCount = context.branches.length;

  if (branchCount === 0) {
    return "No assigned location";
  }

  if (branchCount === 1) {
    return context.branches[0]?.name || "Assigned location";
  }

  return `${branchCount} assigned locations`;
}

function chooseDefaultSection({
  isSeller,
  isCashier,
  isStorekeeper,
  isServiceStaff,
}: {
  isSeller: boolean;
  isCashier: boolean;
  isStorekeeper: boolean;
  isServiceStaff: boolean;
}): AppSection {
  if (isSeller && isCashier) return "dashboard";
  if (isCashier) return "payments";
  if (isSeller) return "sales";
  if (isStorekeeper) return "stock";
  if (isServiceStaff) return "dashboard";

  return "dashboard";
}

function getStaffDashboardMode({
  isSeller,
  isCashier,
  isStorekeeper,
  isServiceStaff,
}: {
  isSeller: boolean;
  isCashier: boolean;
  isStorekeeper: boolean;
  isServiceStaff: boolean;
}): AppAccess["dashboardMode"] {
  if (isSeller && isCashier) return "seller_cashier";
  if (isSeller) return "seller";
  if (isCashier) return "cashier";
  if (isStorekeeper) return "storekeeper";
  if (isServiceStaff) return "service";

  return "limited";
}
