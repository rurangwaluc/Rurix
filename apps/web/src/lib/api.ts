import { clearAuthToken, getAuthToken } from "./auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:5000";

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers();

  if (options.auth) {
    const token = getAuthToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const requestInit: RequestInit = {
    method: options.method || "GET",
    headers,
    credentials: "include",
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestInit);

  const data = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
    }

    throw new Error(
      data?.message || `Request failed with status ${response.status}`,
    );
  }

  return data as T;
}

export type RegisterOwnerPayload = {
  businessName: string;
  legalName?: string;
  businessType: "product" | "service" | "product_and_service";
  mainBranchName: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPhone?: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  deviceKey: string;
  deviceName: string;
  platform: string;
};

export type LoginResponse = {
  ok: true;
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: string;
  };
};

export type CurrentUserResponse = {
  ok: true;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: string;
  };
  business: {
    id: string;
    name: string;
    legal_name: string | null;
    business_type: string;
    status: string;
  };
  membership: {
    memberType: string;
    status: string;
    permissions: string[];
  };
  branches: Array<{
    id: string;
    name: string;
    code: string | null;
    is_main: boolean;
    status: string;
    address: string | null;
    roles: string[];
    permissions: string[];
  }>;
};

export type StaffRole =
  | "ADMIN"
  | "MANAGER"
  | "SELLER"
  | "CASHIER"
  | "STOREKEEPER"
  | "SERVICE_STAFF";

export type StaffLocation = {
  id: string;
  name: string;
  isMain: boolean;
  roles: StaffRole[];
};

export type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  locations: StaffLocation[];
};

export type BusinessLocationStatus = "active" | "inactive";

export type BusinessLocation = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isMain: boolean;
  status: BusinessLocationStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateLocationPayload = {
  name: string;
  code?: string;
  address?: string;
  isMain?: boolean;
};

export type UpdateLocationPayload = {
  name: string;
  code?: string;
  address?: string;
  status: BusinessLocationStatus;
  isMain: boolean;
};

export type LocationListResponse = {
  ok: true;
  locations: BusinessLocation[];
};

export type LocationResponse = {
  ok: true;
  location: BusinessLocation;
};

export type CreateStaffPayload = {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  locationAssignments: Array<{
    branchId: string;
    roles: StaffRole[];
  }>;
};

export type UpdateStaffDetailsPayload = {
  fullName: string;
  email: string;
  phone?: string;
};

export type ResetStaffPasswordPayload = {
  password: string;
};

export type AssignStaffLocationRolesPayload = {
  branchId: string;
  roles: StaffRole[];
};

export type RemoveStaffLocationRolesPayload = {
  branchId: string;
  roles?: StaffRole[];
};

export type StaffListResponse = {
  ok: true;
  staff: StaffMember[];
};

export type StaffDetailsResponse = {
  ok: true;
  staff: StaffMember;
};

export type CatalogItemKind = "PRODUCT" | "SERVICE";
export type CatalogItemStatus = "active" | "inactive";

export type ItemCategory = {
  id: string;
  name: string;
  description: string | null;
  status: CatalogItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type CatalogItem = {
  id: string;
  kind: CatalogItemKind;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sku: string | null;
  barcode: string | null;
  sellingPriceCents: number;
  costPriceCents: number | null;
  trackStock: boolean;
  serviceDurationMinutes: number | null;
  serviceCostEstimateCents: number | null;
  status: CatalogItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type BranchStock = {
  id: string;
  branchId: string;
  branchName: string;
  itemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  categoryName: string | null;
  sellingPriceCents: number;
  quantityOnHand: number;
  quantityAvailable: number;
  quantityDamaged: number;
  lowStockAlertQuantity: number;
  isLowStock: boolean;
  updatedAt: string;
};

export type StockMovementType =
  | "INITIAL_STOCK"
  | "STOCK_RECEIVED"
  | "COUNT_CORRECTION"
  | "DAMAGED_REPORTED"
  | "DAMAGED_RESTORED"
  | "MISSING_REPORTED"
  | "STOLEN_REPORTED";

export type StockMovement = {
  id: string;
  branchId: string;
  branchName: string;
  itemId: string;
  itemName: string;
  movementType: StockMovementType;
  quantityChange: number;
  quantityAvailableBefore: number;
  quantityAvailableAfter: number;
  quantityDamagedBefore: number;
  quantityDamagedAfter: number;
  quantityOnHandBefore: number;
  quantityOnHandAfter: number;
  reason: string | null;
  note: string | null;
  reference: string | null;
  actorName: string | null;
  createdAt: string;
};

export type CreateCategoryPayload = {
  name: string;
  description?: string;
};

export type UpdateCategoryPayload = {
  name: string;
  description?: string;
  status: CatalogItemStatus;
};

export type CreateProductPayload = {
  name: string;
  description?: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  sellingPriceCents: number;
  costPriceCents?: number;
  trackStock: boolean;
  lowStockAlertQuantity?: number;
  startingStock?: Array<{
    branchId: string;
    quantity: number;
  }>;
  note?: string;
};

export type CreateServicePayload = {
  name: string;
  description?: string;
  categoryId?: string;
  serviceCode?: string;
  sellingPriceCents: number;
  costEstimateCents?: number;
  durationMinutes?: number;
  note?: string;
};

export type UpdateProductPayload = {
  name: string;
  description?: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  sellingPriceCents: number;
  costPriceCents?: number;
  trackStock: boolean;
  lowStockAlertQuantity?: number;
  status: CatalogItemStatus;
  priceChangeReason?: string;
};

export type UpdateServicePayload = {
  name: string;
  description?: string;
  categoryId?: string;
  serviceCode?: string;
  sellingPriceCents: number;
  costEstimateCents?: number;
  durationMinutes?: number;
  status: CatalogItemStatus;
  priceChangeReason?: string;
};

export type ReceiveStockPayload = {
  branchId: string;
  itemId: string;
  quantity: number;
  unitCostCents?: number;
  supplierName?: string;
  reference?: string;
  note?: string;
};

export type AdjustStockPayload =
  | {
      branchId: string;
      itemId: string;
      adjustmentType: "COUNT_CORRECTION";
      countedAvailableQuantity: number;
      note: string;
      reference?: string;
    }
  | {
      branchId: string;
      itemId: string;
      adjustmentType:
        | "DAMAGED_REPORTED"
        | "DAMAGED_RESTORED"
        | "MISSING_REPORTED"
        | "STOLEN_REPORTED";
      quantity: number;
      note: string;
      reference?: string;
    };

export type UpdateStockAlertPayload = {
  branchId: string;
  itemId: string;
  lowStockAlertQuantity: number;
};

export type CategoryListResponse = {
  ok: true;
  categories: ItemCategory[];
};

export type CategoryResponse = {
  ok: true;
  category: ItemCategory;
};

export type CatalogItemsResponse = {
  ok: true;
  items: CatalogItem[];
};

export type CatalogItemResponse = {
  ok: true;
  item: CatalogItem;
};

export type StockListResponse = {
  ok: true;
  stock: BranchStock[];
};

export type StockMovementsResponse = {
  ok: true;
  movements: StockMovement[];
};

export type StockActionResponse = {
  ok: true;
  stock: {
    id: string;
    branchId: string;
    itemId: string;
    quantityOnHand: number;
    quantityAvailable: number;
    quantityDamaged: number;
    lowStockAlertQuantity: number;
  };
};

export function registerOwner(payload: RegisterOwnerPayload) {
  return apiRequest<{
    ok: true;
    business: unknown;
    mainBranch: unknown;
    user: unknown;
  }>("/auth/register-owner", {
    method: "POST",
    body: payload,
  });
}

export function login(payload: LoginPayload) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function getCurrentUser() {
  return apiRequest<CurrentUserResponse>("/auth/me", {
    auth: true,
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/auth/logout", {
    method: "POST",
    auth: true,
  });
}

export function listLocations() {
  return apiRequest<LocationListResponse>("/locations", {
    auth: true,
  });
}

export function createLocation(payload: CreateLocationPayload) {
  return apiRequest<LocationResponse>("/locations", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateLocation(
  locationId: string,
  payload: UpdateLocationPayload,
) {
  return apiRequest<LocationResponse>(`/locations/${locationId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function listStaff() {
  return apiRequest<StaffListResponse>("/staff", {
    auth: true,
  });
}

export function getStaff(staffId: string) {
  return apiRequest<StaffDetailsResponse>(`/staff/${staffId}`, {
    auth: true,
  });
}

export function createStaff(payload: CreateStaffPayload) {
  return apiRequest<{
    ok: true;
    staff: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      status: string;
      createdAt: string;
    };
  }>("/staff", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateStaffDetails(
  staffId: string,
  payload: UpdateStaffDetailsPayload,
) {
  return apiRequest<StaffDetailsResponse>(`/staff/${staffId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function resetStaffPassword(
  staffId: string,
  payload: ResetStaffPasswordPayload,
) {
  return apiRequest<{ ok: true }>(`/staff/${staffId}/password`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function assignStaffLocationRoles(
  staffId: string,
  payload: AssignStaffLocationRolesPayload,
) {
  return apiRequest<{ ok: true }>(`/staff/${staffId}/location-roles`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function removeStaffLocationRoles(
  staffId: string,
  payload: RemoveStaffLocationRolesPayload,
) {
  return apiRequest<{ ok: true }>(`/staff/${staffId}/location-roles`, {
    method: "DELETE",
    auth: true,
    body: payload,
  });
}

export function updateStaffStatus(staffId: string, status: string) {
  return apiRequest<{
    ok: true;
    staff: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      status: string;
      createdAt: string;
    };
  }>(`/staff/${staffId}/status`, {
    method: "PATCH",
    auth: true,
    body: {
      status,
    },
  });
}

export function listCategories() {
  return apiRequest<CategoryListResponse>("/catalog/categories", {
    auth: true,
  });
}

export function createCategory(payload: CreateCategoryPayload) {
  return apiRequest<CategoryResponse>("/catalog/categories", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateCategory(
  categoryId: string,
  payload: UpdateCategoryPayload,
) {
  return apiRequest<CategoryResponse>(`/catalog/categories/${categoryId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function listCatalogItems(
  params: {
    kind?: CatalogItemKind;
    status?: CatalogItemStatus;
    search?: string;
  } = {},
) {
  return apiRequest<CatalogItemsResponse>(
    `/catalog/items${buildQuery(params)}`,
    {
      auth: true,
    },
  );
}

export function createProduct(payload: CreateProductPayload) {
  return apiRequest<CatalogItemResponse>("/catalog/products", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function createService(payload: CreateServicePayload) {
  return apiRequest<CatalogItemResponse>("/catalog/services", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateProduct(
  productId: string,
  payload: UpdateProductPayload,
) {
  return apiRequest<CatalogItemResponse>(`/catalog/products/${productId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function updateService(
  serviceId: string,
  payload: UpdateServicePayload,
) {
  return apiRequest<CatalogItemResponse>(`/catalog/services/${serviceId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function listStock(
  params: {
    branchId?: string;
    search?: string;
    onlyLowStock?: boolean;
  } = {},
) {
  return apiRequest<StockListResponse>(`/stock${buildQuery(params)}`, {
    auth: true,
  });
}

export function listStockMovements(
  params: {
    branchId?: string;
    itemId?: string;
    movementType?: StockMovementType;
  } = {},
) {
  return apiRequest<StockMovementsResponse>(
    `/stock/movements${buildQuery(params)}`,
    {
      auth: true,
    },
  );
}

export function receiveStock(payload: ReceiveStockPayload) {
  return apiRequest<StockActionResponse>("/stock/receive", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function adjustStock(payload: AdjustStockPayload) {
  return apiRequest<StockActionResponse>("/stock/adjust", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateStockAlert(payload: UpdateStockAlertPayload) {
  return apiRequest<StockActionResponse>("/stock/alert", {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}
