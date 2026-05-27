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

export type BusinessType = "product" | "service" | "product_and_service";

export type AppAccess = {
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  businessType: BusinessType;
  sellsProducts: boolean;
  sellsServices: boolean;
  usesStock: boolean;
  catalogLabel: string;
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

function getBusinessType(value: string): BusinessType {
  if (value === "service") return "service";
  if (value === "product_and_service") return "product_and_service";

  return "product";
}

function getBusinessCapabilities(context: CurrentUserResponse) {
  const businessType = getBusinessType(context.business.business_type);

  const sellsProducts =
    businessType === "product" || businessType === "product_and_service";

  const sellsServices =
    businessType === "service" || businessType === "product_and_service";

  const usesStock = sellsProducts;

  const catalogLabel =
    businessType === "service"
      ? "Services"
      : businessType === "product_and_service"
        ? "Products & Services"
        : "Products & Stock";

  return {
    businessType,
    sellsProducts,
    sellsServices,
    usesStock,
    catalogLabel,
  };
}

function buildSectionItems(
  catalogLabel: string,
): Record<AppSection, AppNavItem> {
  return {
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
      label: catalogLabel,
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
}

export function buildAppAccess(context: CurrentUserResponse): AppAccess {
  const capabilities = getBusinessCapabilities(context);
  const sectionItems = buildSectionItems(capabilities.catalogLabel);

  const isOwner = ownerMemberTypes.has(context.membership.memberType);
  const branchRoles = getBranchRoles(context);

  const isAdmin = branchRoles.includes("ADMIN");
  const isManager = branchRoles.includes("MANAGER");
  const isSeller = branchRoles.includes("SELLER");
  const isCashier = branchRoles.includes("CASHIER");
  const isStorekeeper = branchRoles.includes("STOREKEEPER");
  const isServiceStaff = branchRoles.includes("SERVICE_STAFF");

  function getSections(keys: AppSection[]) {
    return keys.map((key) => sectionItems[key]);
  }

  const baseAccess = {
    businessType: capabilities.businessType,
    sellsProducts: capabilities.sellsProducts,
    sellsServices: capabilities.sellsServices,
    usesStock: capabilities.usesStock,
    catalogLabel: capabilities.catalogLabel,
  };

  if (isOwner) {
    return {
      ...baseAccess,
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
      canViewStock: capabilities.usesStock,
      canManageCatalog: true,
      canMoveStock: capabilities.usesStock,
      dashboardMode: "owner",
    };
  }

  if (isAdmin) {
    return {
      ...baseAccess,
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
      canViewStock: capabilities.usesStock,
      canManageCatalog: true,
      canMoveStock: capabilities.usesStock,
      dashboardMode: "admin",
    };
  }

  if (isManager) {
    return {
      ...baseAccess,
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
      canViewStock: capabilities.usesStock,
      canManageCatalog: false,
      canMoveStock: false,
      dashboardMode: "manager",
    };
  }

  const sectionKeys = new Set<AppSection>(["dashboard"]);

  if (isSeller) {
    sectionKeys.add("sales");
    sectionKeys.add("refunds");
    sectionKeys.add("stock");
  }

  if (isCashier) {
    sectionKeys.add("payments");
    sectionKeys.add("cash");
    sectionKeys.add("expenses");
    sectionKeys.add("refunds");
    sectionKeys.add("stock");
  }

  if (isStorekeeper && capabilities.usesStock) {
    sectionKeys.add("stock");
  }

  if (isServiceStaff && capabilities.sellsServices) {
    sectionKeys.add("stock");
  }

  const defaultSection = chooseDefaultSection({
    isSeller,
    isCashier,
    isStorekeeper,
    isServiceStaff,
    usesStock: capabilities.usesStock,
    sellsServices: capabilities.sellsServices,
  });

  return {
    ...baseAccess,
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
    canViewStock: capabilities.usesStock && isStorekeeper,
    canManageCatalog: false,
    canMoveStock: capabilities.usesStock && isStorekeeper,
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
  usesStock,
  sellsServices,
}: {
  isSeller: boolean;
  isCashier: boolean;
  isStorekeeper: boolean;
  isServiceStaff: boolean;
  usesStock: boolean;
  sellsServices: boolean;
}): AppSection {
  if (isSeller && isCashier) return "dashboard";
  if (isCashier) return "payments";
  if (isSeller) return "sales";
  if (isStorekeeper && usesStock) return "stock";
  if (isServiceStaff && sellsServices) return "stock";

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
