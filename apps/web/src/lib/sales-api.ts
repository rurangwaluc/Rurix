import { apiRequest } from "./api";

export type SalePaymentMethod =
  | "cash"
  | "mobile_money"
  | "bank_transfer"
  | "card";

export type CustomerStatus = "active" | "inactive";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
};

export type SaleSummary = {
  id: string;
  branchId: string;
  branchName: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  saleNumber: string;
  receiptNumber: string | null;
  status: "completed" | "cancelled" | "refunded" | "partly_refunded";
  saleType: "direct_sale" | "converted_proforma";
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  notes: string | null;
  completedAt: string;
  createdByName: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Sale = Omit<SaleSummary, "itemCount"> & {
  customerEmail: string | null;
  customerAddress: string | null;
};

export type SaleItem = {
  id: string;
  saleId: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  lineTotalCents: number;
  createdAt: string;
};

export type SalePayment = {
  id: string;
  saleId: string;
  method: SalePaymentMethod;
  amountCents: number;
  reference: string | null;
  paidAt: string;
  receivedByName: string | null;
  createdAt: string;
};

export type SaleReceipt = {
  id: string;
  saleId: string;
  receiptNumber: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  issuedAt: string;
  issuedByName: string | null;
  createdAt: string;
};

export type CreateCustomerPayload = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type UpdateCustomerPayload = Partial<CreateCustomerPayload> & {
  status?: CustomerStatus;
};

export type CreateSalePayload = {
  branchId: string;
  customerId?: string;
  customer?: CreateCustomerPayload;
  items: Array<{
    itemId: string;
    quantity: number;
    unitPriceCents?: number;
    discountCents?: number;
  }>;
  payments: Array<{
    method: SalePaymentMethod;
    amountCents: number;
    reference?: string;
  }>;
  discountCents?: number;
  taxCents?: number;
  notes?: string;
};

export type SaleDetailResponse = {
  ok: true;
  sale: Sale;
  items: SaleItem[];
  payments: SalePayment[];
  receipt: SaleReceipt | null;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const value = query.toString();

  return value ? `?${value}` : "";
}

export function listCustomers(
  params: { search?: string; status?: CustomerStatus } = {},
) {
  return apiRequest<{
    ok: true;
    customers: Customer[];
  }>(`/customers${buildQuery(params)}`, {
    auth: true,
  });
}

export function createCustomer(payload: CreateCustomerPayload) {
  return apiRequest<{
    ok: true;
    customer: Customer;
  }>("/customers", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateCustomer(
  customerId: string,
  payload: UpdateCustomerPayload,
) {
  return apiRequest<{
    ok: true;
    customer: Customer;
  }>(`/customers/${customerId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function createSale(payload: CreateSalePayload) {
  return apiRequest<SaleDetailResponse>("/sales", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function listSales(
  params: {
    search?: string;
    branchId?: string;
    customerId?: string;
    status?: SaleSummary["status"];
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  return apiRequest<{
    ok: true;
    sales: SaleSummary[];
  }>(`/sales${buildQuery(params)}`, {
    auth: true,
  });
}

export function getSale(saleId: string) {
  return apiRequest<SaleDetailResponse>(`/sales/${saleId}`, {
    auth: true,
  });
}

export function getSaleReceipt(saleId: string) {
  return apiRequest<SaleDetailResponse>(`/sales/${saleId}/receipt`, {
    auth: true,
  });
}
