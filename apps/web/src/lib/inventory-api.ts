import { apiRequest } from "./api";

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

export type SupplierStatus = "active" | "inactive";

export type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateSupplierPayload = {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type UpdateSupplierPayload = {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status: SupplierStatus;
};

export type StockTransfer = {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  quantity: number;
  reference: string;
  reason: string | null;
  note: string | null;
  status: "completed" | "cancelled";
  createdByName: string | null;
  createdAt: string;
};

export type CreateStockTransferPayload = {
  itemId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  reference?: string;
  reason?: string;
  note?: string;
};

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partly_received"
  | "fully_received"
  | "cancelled";

export type PurchaseOrderSendMethod = "pdf_download" | "email" | "whatsapp";

export type PurchaseOrderSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  deliveryBranchId: string | null;
  deliveryBranchName: string | null;
  orderNumber: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  orderedByName: string | null;
  markedOrderedByName: string | null;
  markedOrderedAt: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  itemCount: number;
  totalQuantityOrdered: number;
  totalQuantityReceived: number;
  expectedTotalCents: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrder = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierContactPerson: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  deliveryBranchId: string | null;
  deliveryBranchName: string | null;
  orderNumber: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  markedOrderedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderItem = {
  id: string;
  purchaseOrderId: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  expectedUnitCostCents: number | null;
  expectedLineTotalCents: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderReceipt = {
  id: string;
  purchaseOrderId: string;
  receivedBranchId: string;
  receivedBranchName: string;
  receiptNumber: string;
  receivedAt: string;
  note: string | null;
  receivedByName: string | null;
  createdAt: string;
};

export type PurchaseOrderReceiptItem = {
  id: string;
  purchaseOrderReceiptId: string;
  purchaseOrderItemId: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  quantityReceived: number;
  actualUnitCostCents: number | null;
  note: string | null;
  createdAt: string;
};

export type PurchaseOrderSendEvent = {
  id: string;
  purchaseOrderId: string;
  method: PurchaseOrderSendMethod;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  subject: string | null;
  message: string | null;
  status: "completed" | "failed" | "not_configured";
  failureReason: string | null;
  sentByName: string | null;
  createdAt: string;
};

export type PurchaseOrderItemPayload = {
  itemId: string;
  quantityOrdered: number;
  expectedUnitCostCents?: number;
  note?: string;
};

export type CreatePurchaseOrderPayload = {
  supplierId: string;
  deliveryBranchId?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  items: PurchaseOrderItemPayload[];
};

export type UpdatePurchaseOrderPayload = CreatePurchaseOrderPayload;

export type ReceivePurchaseOrderPayload = {
  receivedBranchId: string;
  receiptNumber?: string;
  note?: string;
  items: Array<{
    purchaseOrderItemId: string;
    quantityReceived: number;
    actualUnitCostCents?: number;
    note?: string;
  }>;
};

export type SendPurchaseOrderPayload = {
  method: PurchaseOrderSendMethod;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  subject?: string;
  message?: string;
};

export function listSuppliers(
  params: {
    search?: string;
    status?: SupplierStatus;
  } = {},
) {
  return apiRequest<{
    ok: true;
    suppliers: Supplier[];
  }>(`/suppliers${buildQuery(params)}`, {
    auth: true,
  });
}

export function createSupplier(payload: CreateSupplierPayload) {
  return apiRequest<{
    ok: true;
    supplier: Supplier;
  }>("/suppliers", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateSupplier(
  supplierId: string,
  payload: UpdateSupplierPayload,
) {
  return apiRequest<{
    ok: true;
    supplier: Supplier;
  }>(`/suppliers/${supplierId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function listStockTransfers(
  params: {
    branchId?: string;
    itemId?: string;
    search?: string;
  } = {},
) {
  return apiRequest<{
    ok: true;
    transfers: StockTransfer[];
  }>(`/stock-transfers${buildQuery(params)}`, {
    auth: true,
  });
}

export function createStockTransfer(payload: CreateStockTransferPayload) {
  return apiRequest<{
    ok: true;
    transfer: StockTransfer;
  }>("/stock-transfers", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function listPurchaseOrders(
  params: {
    status?: PurchaseOrderStatus;
    supplierId?: string;
    deliveryBranchId?: string;
    search?: string;
  } = {},
) {
  return apiRequest<{
    ok: true;
    purchaseOrders: PurchaseOrderSummary[];
  }>(`/purchase-orders${buildQuery(params)}`, {
    auth: true,
  });
}

export function getPurchaseOrder(purchaseOrderId: string) {
  return apiRequest<{
    ok: true;
    purchaseOrder: PurchaseOrder;
    items: PurchaseOrderItem[];
    receipts: PurchaseOrderReceipt[];
    receiptItems: PurchaseOrderReceiptItem[];
    sendEvents: PurchaseOrderSendEvent[];
  }>(`/purchase-orders/${purchaseOrderId}`, {
    auth: true,
  });
}

export function createPurchaseOrder(payload: CreatePurchaseOrderPayload) {
  return apiRequest<{
    ok: true;
    purchaseOrder: PurchaseOrder;
    items: PurchaseOrderItem[];
  }>("/purchase-orders", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updatePurchaseOrder(
  purchaseOrderId: string,
  payload: UpdatePurchaseOrderPayload,
) {
  return apiRequest<{
    ok: true;
    purchaseOrder: PurchaseOrder;
    items: PurchaseOrderItem[];
  }>(`/purchase-orders/${purchaseOrderId}`, {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}

export function markPurchaseOrderOrdered(
  purchaseOrderId: string,
  payload: {
    note?: string;
  } = {},
) {
  return apiRequest<{
    ok: true;
    purchaseOrder: PurchaseOrder;
    items: PurchaseOrderItem[];
  }>(`/purchase-orders/${purchaseOrderId}/mark-ordered`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function cancelPurchaseOrder(
  purchaseOrderId: string,
  payload: {
    reason: string;
  },
) {
  return apiRequest<{
    ok: true;
    purchaseOrder: PurchaseOrder;
    items: PurchaseOrderItem[];
  }>(`/purchase-orders/${purchaseOrderId}/cancel`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function receivePurchaseOrder(
  purchaseOrderId: string,
  payload: ReceivePurchaseOrderPayload,
) {
  return apiRequest<{
    ok: true;
    receiptId: string;
    purchaseOrder: PurchaseOrder;
    items: PurchaseOrderItem[];
    receipts: PurchaseOrderReceipt[];
    receiptItems: PurchaseOrderReceiptItem[];
  }>(`/purchase-orders/${purchaseOrderId}/receive`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function sendPurchaseOrder(
  purchaseOrderId: string,
  payload: SendPurchaseOrderPayload,
) {
  return apiRequest<{
    ok: true;
    sendEvent: PurchaseOrderSendEvent;
    message: string;
    whatsappUrl: string | null;
  }>(`/purchase-orders/${purchaseOrderId}/send`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}
