import { clearAuthToken, getAuthToken } from "./auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:5000";

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

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
