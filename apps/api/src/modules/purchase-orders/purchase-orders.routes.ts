import type { FastifyInstance, FastifyReply } from "fastify";
import {
  cancelPurchaseOrderSchema,
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  markPurchaseOrderOrderedSchema,
  purchaseOrderSendSchema,
  receivePurchaseOrderSchema,
  updatePurchaseOrderSchema,
} from "@rurix/schemas";
import { query, transaction, type DbRow } from "@rurix/db";
import { generateBusinessNumber } from "../../lib/business-numbering";
import {
  contextCanAccessBranch,
  contextHasPermission,
  requireAuth,
} from "../auth/auth.context";
import {
  buildPurchaseOrderPlainMessage,
  generatePurchaseOrderPdf,
  getPurchaseOrderPdfFileName,
  sendPurchaseOrderEmail,
} from "./purchase-order-documents";

type BusinessType = "product" | "service" | "product_and_service";

type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partly_received"
  | "fully_received"
  | "cancelled";

type PurchaseOrderSendMethod = "pdf_download" | "email" | "whatsapp";

type PurchaseOrderSendStatus = "completed" | "failed" | "not_configured";

type DbSupplier = DbRow & {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  status: string;
};

type DbBranch = DbRow & {
  id: string;
  name: string;
};

type DbCatalogItem = DbRow & {
  id: string;
  name: string;
  sku: string | null;
  item_kind: "PRODUCT" | "SERVICE";
  track_stock: boolean;
  status: string;
};

type DbStockRecord = DbRow & {
  id: string;
  business_id: string;
  branch_id: string;
  item_id: string;
  quantity_on_hand: number;
  quantity_available: number;
  quantity_damaged: number;
  low_stock_alert_quantity: number;
};

type DbPurchaseOrderSummary = DbRow & {
  id: string;
  business_id: string;
  supplier_id: string;
  supplier_name: string;
  delivery_branch_id: string | null;
  delivery_branch_name: string | null;
  order_number: string;
  status: PurchaseOrderStatus;
  order_date: Date;
  expected_delivery_date: Date | null;
  notes: string | null;
  ordered_by_name: string | null;
  marked_ordered_by_name: string | null;
  marked_ordered_at: Date | null;
  cancelled_by_name: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  item_count: number;
  total_quantity_ordered: number;
  total_quantity_received: number;
  expected_total_cents: number;
  created_at: Date;
  updated_at: Date;
};

type DbPurchaseOrder = DbRow & {
  id: string;
  business_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_contact_person: string | null;
  supplier_phone: string | null;
  supplier_email: string | null;
  delivery_branch_id: string | null;
  delivery_branch_name: string | null;
  order_number: string;
  status: PurchaseOrderStatus;
  order_date: Date;
  expected_delivery_date: Date | null;
  notes: string | null;
  marked_ordered_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

type DbPurchaseOrderItem = DbRow & {
  id: string;
  purchase_order_id: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  quantity_ordered: number;
  quantity_received: number;
  expected_unit_cost_cents: number | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
};

type DbPurchaseOrderReceipt = DbRow & {
  id: string;
  purchase_order_id: string;
  received_branch_id: string;
  received_branch_name: string;
  receipt_number: string;
  received_at: Date;
  note: string | null;
  received_by_name: string | null;
  created_at: Date;
};

type DbPurchaseOrderReceiptItem = DbRow & {
  id: string;
  purchase_order_receipt_id: string;
  purchase_order_item_id: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  quantity_received: number;
  actual_unit_cost_cents: number | null;
  note: string | null;
  created_at: Date;
};

type DbPurchaseOrderSendEvent = DbRow & {
  id: string;
  purchase_order_id: string;
  send_method: PurchaseOrderSendMethod;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  message: string | null;
  status: PurchaseOrderSendStatus;
  failure_reason: string | null;
  sent_by_name: string | null;
  created_at: Date;
};

type DbPurchaseOrderItemForReceive = DbRow & {
  id: string;
  business_id: string;
  purchase_order_id: string;
  item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  expected_unit_cost_cents: number | null;
};

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function toNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getBusinessType(value: string): BusinessType {
  if (value === "service") return "service";
  if (value === "product_and_service") return "product_and_service";

  return "product";
}

function businessUsesInventory(businessType: BusinessType) {
  return businessType === "product" || businessType === "product_and_service";
}

function inventoryBusinessGuard(
  reply: FastifyReply,
  businessTypeValue: string,
) {
  const businessType = getBusinessType(businessTypeValue);

  if (!businessUsesInventory(businessType)) {
    return reply.status(400).send({
      ok: false,
      message: "This business does not use inventory.",
    });
  }

  return null;
}

function mapPurchaseOrderSummary(row: DbPurchaseOrderSummary) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    deliveryBranchId: row.delivery_branch_id,
    deliveryBranchName: row.delivery_branch_name,
    orderNumber: row.order_number,
    status: row.status,
    orderDate: row.order_date,
    expectedDeliveryDate: row.expected_delivery_date,
    notes: row.notes,
    orderedByName: row.ordered_by_name,
    markedOrderedByName: row.marked_ordered_by_name,
    markedOrderedAt: row.marked_ordered_at,
    cancelledByName: row.cancelled_by_name,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    itemCount: toNumber(row.item_count),
    totalQuantityOrdered: toNumber(row.total_quantity_ordered),
    totalQuantityReceived: toNumber(row.total_quantity_received),
    expectedTotalCents: toNumber(row.expected_total_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPurchaseOrder(row: DbPurchaseOrder) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierContactPerson: row.supplier_contact_person,
    supplierPhone: row.supplier_phone,
    supplierEmail: row.supplier_email,
    deliveryBranchId: row.delivery_branch_id,
    deliveryBranchName: row.delivery_branch_name,
    orderNumber: row.order_number,
    status: row.status,
    orderDate: row.order_date,
    expectedDeliveryDate: row.expected_delivery_date,
    notes: row.notes,
    markedOrderedAt: row.marked_ordered_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPurchaseOrderItem(row: DbPurchaseOrderItem) {
  const quantityOrdered = toNumber(row.quantity_ordered);
  const quantityReceived = toNumber(row.quantity_received);
  const expectedUnitCostCents =
    row.expected_unit_cost_cents === null
      ? null
      : toNumber(row.expected_unit_cost_cents);

  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemSku: row.item_sku,
    quantityOrdered,
    quantityReceived,
    quantityRemaining: Math.max(quantityOrdered - quantityReceived, 0),
    expectedUnitCostCents,
    expectedLineTotalCents:
      expectedUnitCostCents === null
        ? null
        : expectedUnitCostCents * quantityOrdered,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReceipt(row: DbPurchaseOrderReceipt) {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    receivedBranchId: row.received_branch_id,
    receivedBranchName: row.received_branch_name,
    receiptNumber: row.receipt_number,
    receivedAt: row.received_at,
    note: row.note,
    receivedByName: row.received_by_name,
    createdAt: row.created_at,
  };
}

function mapReceiptItem(row: DbPurchaseOrderReceiptItem) {
  return {
    id: row.id,
    purchaseOrderReceiptId: row.purchase_order_receipt_id,
    purchaseOrderItemId: row.purchase_order_item_id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemSku: row.item_sku,
    quantityReceived: toNumber(row.quantity_received),
    actualUnitCostCents:
      row.actual_unit_cost_cents === null
        ? null
        : toNumber(row.actual_unit_cost_cents),
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapSendEvent(row: DbPurchaseOrderSendEvent) {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    method: row.send_method,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    failureReason: row.failure_reason,
    sentByName: row.sent_by_name,
    createdAt: row.created_at,
  };
}

async function ensureSupplier(input: {
  businessId: string;
  supplierId: string;
  client?: {
    query: typeof query;
  };
}) {
  const runner = input.client || { query };

  const result = await runner.query<DbSupplier>(
    `
      select id, name, contact_person, phone, email, status
      from suppliers
      where id = $1
        and business_id = $2
      limit 1
    `,
    [input.supplierId, input.businessId],
  );

  const supplier = result.rows[0];

  if (!supplier) {
    throw new Error("SUPPLIER_NOT_FOUND");
  }

  if (supplier.status !== "active") {
    throw new Error("SUPPLIER_INACTIVE");
  }

  return supplier;
}

async function ensureBranch(input: {
  businessId: string;
  branchId: string;
  client?: {
    query: typeof query;
  };
}) {
  const runner = input.client || { query };

  const result = await runner.query<DbBranch>(
    `
      select id, name
      from branches
      where id = $1
        and business_id = $2
        and status = 'active'
      limit 1
    `,
    [input.branchId, input.businessId],
  );

  const branch = result.rows[0];

  if (!branch) {
    throw new Error("BRANCH_NOT_FOUND");
  }

  return branch;
}

async function ensureTrackableProduct(input: {
  businessId: string;
  itemId: string;
  client: {
    query: typeof query;
  };
}) {
  const result = await input.client.query<DbCatalogItem>(
    `
      select id, name, sku, item_kind, track_stock, status
      from catalog_items
      where id = $1
        and business_id = $2
      limit 1
    `,
    [input.itemId, input.businessId],
  );

  const item = result.rows[0];

  if (!item) {
    throw new Error("ITEM_NOT_FOUND");
  }

  if (item.item_kind !== "PRODUCT" || !item.track_stock) {
    throw new Error("ITEM_NOT_STOCK_TRACKED");
  }

  if (item.status !== "active") {
    throw new Error("ITEM_INACTIVE");
  }

  return item;
}

async function getOrCreateStockRecord(input: {
  businessId: string;
  branchId: string;
  itemId: string;
  client: {
    query: typeof query;
  };
}) {
  const existingResult = await input.client.query<DbStockRecord>(
    `
      select *
      from branch_item_stock
      where business_id = $1
        and branch_id = $2
        and item_id = $3
      for update
    `,
    [input.businessId, input.branchId, input.itemId],
  );

  const existing = existingResult.rows[0];

  if (existing) {
    return existing;
  }

  const insertedResult = await input.client.query<DbStockRecord>(
    `
      insert into branch_item_stock (
        business_id,
        branch_id,
        item_id,
        quantity_on_hand,
        quantity_available,
        quantity_damaged,
        low_stock_alert_quantity
      )
      values ($1, $2, $3, 0, 0, 0, 0)
      returning *
    `,
    [input.businessId, input.branchId, input.itemId],
  );

  const inserted = insertedResult.rows[0];

  if (!inserted) {
    throw new Error("STOCK_RECORD_NOT_CREATED");
  }

  return inserted;
}

function purchaseOrderErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Supplier not found.",
    });
  }

  if (error instanceof Error && error.message === "SUPPLIER_INACTIVE") {
    return reply.status(400).send({
      ok: false,
      message: "This supplier is not active.",
    });
  }

  if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Location not found.",
    });
  }

  if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Product not found.",
    });
  }

  if (error instanceof Error && error.message === "ITEM_NOT_STOCK_TRACKED") {
    return reply.status(400).send({
      ok: false,
      message: "This product does not track stock.",
    });
  }

  if (error instanceof Error && error.message === "ITEM_INACTIVE") {
    return reply.status(400).send({
      ok: false,
      message: "This product is inactive.",
    });
  }

  if (error instanceof Error && error.message === "DUPLICATE_PO_ITEM") {
    return reply.status(400).send({
      ok: false,
      message: "A product can appear only once on the same purchase order.",
    });
  }

  if (error instanceof Error && error.message === "PURCHASE_ORDER_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Purchase order not found.",
    });
  }

  if (error instanceof Error && error.message === "PURCHASE_ORDER_NOT_DRAFT") {
    return reply.status(400).send({
      ok: false,
      message: "Only draft purchase orders can be changed.",
    });
  }

  if (error instanceof Error && error.message === "PURCHASE_ORDER_EMPTY") {
    return reply.status(400).send({
      ok: false,
      message: "Add at least one product before marking this order as ordered.",
    });
  }

  if (
    error instanceof Error &&
    error.message === "PURCHASE_ORDER_CANNOT_RECEIVE"
  ) {
    return reply.status(400).send({
      ok: false,
      message: "This purchase order cannot receive stock.",
    });
  }

  if (error instanceof Error && error.message === "RECEIVE_MORE_THAN_ORDERED") {
    return reply.status(400).send({
      ok: false,
      message: "Received quantity cannot be more than the remaining quantity.",
    });
  }

  throw error;
}

async function loadPurchaseOrderDetail(input: {
  businessId: string;
  purchaseOrderId: string;
}) {
  const orderResult = await query<DbPurchaseOrder>(
    `
      select
        po.id,
        po.business_id,
        po.supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact_person,
        s.phone as supplier_phone,
        s.email as supplier_email,
        po.delivery_branch_id,
        b.name as delivery_branch_name,
        po.order_number,
        po.status,
        po.order_date,
        po.expected_delivery_date,
        po.notes,
        po.marked_ordered_at,
        po.cancel_reason,
        po.created_at,
        po.updated_at
      from purchase_orders po
      inner join suppliers s on s.id = po.supplier_id
      left join branches b on b.id = po.delivery_branch_id
      where po.id = $1
        and po.business_id = $2
      limit 1
    `,
    [input.purchaseOrderId, input.businessId],
  );

  const order = orderResult.rows[0];

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }

  const itemsResult = await query<DbPurchaseOrderItem>(
    `
      select
        poi.id,
        poi.purchase_order_id,
        poi.item_id,
        ci.name as item_name,
        ci.sku as item_sku,
        poi.quantity_ordered,
        poi.quantity_received,
        poi.expected_unit_cost_cents,
        poi.note,
        poi.created_at,
        poi.updated_at
      from purchase_order_items poi
      inner join catalog_items ci on ci.id = poi.item_id
      where poi.purchase_order_id = $1
        and poi.business_id = $2
      order by ci.name asc
    `,
    [input.purchaseOrderId, input.businessId],
  );

  const receiptsResult = await query<DbPurchaseOrderReceipt>(
    `
      select
        por.id,
        por.purchase_order_id,
        por.received_branch_id,
        b.name as received_branch_name,
        por.receipt_number,
        por.received_at,
        por.note,
        u.full_name as received_by_name,
        por.created_at
      from purchase_order_receipts por
      inner join branches b on b.id = por.received_branch_id
      left join users u on u.id = por.received_by_user_id
      where por.purchase_order_id = $1
        and por.business_id = $2
      order by por.created_at desc
    `,
    [input.purchaseOrderId, input.businessId],
  );

  const receiptItemsResult = await query<DbPurchaseOrderReceiptItem>(
    `
      select
        pori.id,
        pori.purchase_order_receipt_id,
        pori.purchase_order_item_id,
        pori.item_id,
        ci.name as item_name,
        ci.sku as item_sku,
        pori.quantity_received,
        pori.actual_unit_cost_cents,
        pori.note,
        pori.created_at
      from purchase_order_receipt_items pori
      inner join catalog_items ci on ci.id = pori.item_id
      where pori.business_id = $1
        and pori.purchase_order_receipt_id in (
          select id
          from purchase_order_receipts
          where purchase_order_id = $2
            and business_id = $1
        )
      order by pori.created_at desc
    `,
    [input.businessId, input.purchaseOrderId],
  );

  const sendEventsResult = await query<DbPurchaseOrderSendEvent>(
    `
      select
        pose.id,
        pose.purchase_order_id,
        pose.send_method,
        pose.recipient_name,
        pose.recipient_email,
        pose.recipient_phone,
        pose.subject,
        pose.message,
        pose.status,
        pose.failure_reason,
        u.full_name as sent_by_name,
        pose.created_at
      from purchase_order_send_events pose
      left join users u on u.id = pose.sent_by_user_id
      where pose.purchase_order_id = $1
        and pose.business_id = $2
      order by pose.created_at desc
    `,
    [input.purchaseOrderId, input.businessId],
  );

  return {
    order: mapPurchaseOrder(order),
    items: itemsResult.rows.map(mapPurchaseOrderItem),
    receipts: receiptsResult.rows.map(mapReceipt),
    receiptItems: receiptItemsResult.rows.map(mapReceiptItem),
    sendEvents: sendEventsResult.rows.map(mapSendEvent),
  };
}

function buildPurchaseOrderMessage(input: {
  business: ReturnType<typeof getDocumentBusiness>;
  sender: ReturnType<typeof getDocumentSender>;
  order: ReturnType<typeof mapPurchaseOrder>;
  items: ReturnType<typeof mapPurchaseOrderItem>[];
}) {
  return buildPurchaseOrderPlainMessage({
    business: input.business,
    sender: input.sender,
    order: input.order,
    items: input.items,
  });
}

function buildWhatsappUrl(input: { phone: string | null; message: string }) {
  const phone = input.phone?.replace(/[^\d]/g, "");

  if (!phone) {
    return null;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(input.message)}`;
}

function getDocumentBusiness(context: {
  business: {
    name?: string;
    legal_name?: string | null;
    legalName?: string | null;
  };
}) {
  return {
    name: context.business.name || "Business",
    legalName:
      context.business.legal_name || context.business.legalName || null,
  };
}

function getDocumentSender(context: {
  user: {
    full_name?: string | null;
    fullName?: string | null;
    email?: string | null;
  };
}) {
  return {
    name: context.user.full_name || context.user.fullName || null,
    email: context.user.email || null,
  };
}

export async function purchaseOrdersRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view purchase orders.",
      });
    }

    const parsed = listPurchaseOrdersQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the purchase order filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const values: unknown[] = [context.business.id];
    const where: string[] = ["po.business_id = $1"];

    if (parsed.data.status) {
      values.push(parsed.data.status);
      where.push(`po.status = $${values.length}`);
    }

    if (parsed.data.supplierId) {
      values.push(parsed.data.supplierId);
      where.push(`po.supplier_id = $${values.length}`);
    }

    if (parsed.data.deliveryBranchId) {
      if (!contextCanAccessBranch(context, parsed.data.deliveryBranchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this location.",
        });
      }

      values.push(parsed.data.deliveryBranchId);
      where.push(`po.delivery_branch_id = $${values.length}`);
    }

    if (parsed.data.search) {
      values.push(`%${parsed.data.search}%`);
      where.push(`
        (
          po.order_number ilike $${values.length}
          or s.name ilike $${values.length}
        )
      `);
    }

    const result = await query<DbPurchaseOrderSummary>(
      `
        select
          po.id,
          po.business_id,
          po.supplier_id,
          s.name as supplier_name,
          po.delivery_branch_id,
          b.name as delivery_branch_name,
          po.order_number,
          po.status,
          po.order_date,
          po.expected_delivery_date,
          po.notes,
          ordered_by.full_name as ordered_by_name,
          marked_ordered_by.full_name as marked_ordered_by_name,
          po.marked_ordered_at,
          cancelled_by.full_name as cancelled_by_name,
          po.cancelled_at,
          po.cancel_reason,
          count(poi.id)::int as item_count,
          coalesce(sum(poi.quantity_ordered), 0)::int as total_quantity_ordered,
          coalesce(sum(poi.quantity_received), 0)::int as total_quantity_received,
          coalesce(
            sum(
              poi.quantity_ordered * coalesce(poi.expected_unit_cost_cents, 0)
            ),
            0
          )::int as expected_total_cents,
          po.created_at,
          po.updated_at
        from purchase_orders po
        inner join suppliers s on s.id = po.supplier_id
        left join branches b on b.id = po.delivery_branch_id
        left join users ordered_by on ordered_by.id = po.ordered_by_user_id
        left join users marked_ordered_by on marked_ordered_by.id = po.marked_ordered_by_user_id
        left join users cancelled_by on cancelled_by.id = po.cancelled_by_user_id
        left join purchase_order_items poi on poi.purchase_order_id = po.id
        where ${where.join(" and ")}
        group by
          po.id,
          s.name,
          b.name,
          ordered_by.full_name,
          marked_ordered_by.full_name,
          cancelled_by.full_name
        order by po.created_at desc
        limit 200
      `,
      values,
    );

    return {
      ok: true,
      purchaseOrders: result.rows.map(mapPurchaseOrderSummary),
    };
  });

  app.get("/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view purchase orders.",
      });
    }

    const params = request.params as { id: string };

    try {
      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      return {
        ok: true,
        purchaseOrder: detail.order,
        items: detail.items,
        receipts: detail.receipts,
        receiptItems: detail.receiptItems,
        sendEvents: detail.sendEvents,
      };
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.get("/:id/pdf", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_SEND")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to download purchase orders.",
      });
    }

    const params = request.params as { id: string };

    try {
      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      const documentBusiness = getDocumentBusiness(context);
      const documentSender = getDocumentSender(context);

      const pdfBuffer = await generatePurchaseOrderPdf({
        business: documentBusiness,
        sender: documentSender,
        order: detail.order,
        items: detail.items,
      });

      const message = buildPurchaseOrderPlainMessage({
        business: documentBusiness,
        sender: documentSender,
        order: detail.order,
        items: detail.items,
      });

      await query(
        `
        insert into purchase_order_send_events (
          business_id,
          purchase_order_id,
          send_method,
          recipient_name,
          recipient_email,
          recipient_phone,
          subject,
          message,
          status,
          failure_reason,
          sent_by_user_id
        )
        values ($1, $2, 'pdf_download', $3, $4, $5, $6, $7, 'completed', null, $8)
      `,
        [
          context.business.id,
          params.id,
          detail.order.supplierContactPerson || detail.order.supplierName,
          detail.order.supplierEmail,
          detail.order.supplierPhone,
          `Purchase order ${detail.order.orderNumber}`,
          message,
          context.user.id,
        ],
      );

      return reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="${getPurchaseOrderPdfFileName(
            detail.order.orderNumber,
          )}"`,
        )
        .send(pdfBuffer);
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.post("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create purchase orders.",
      });
    }

    const parsed = createPurchaseOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the purchase order details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    if (
      parsed.data.deliveryBranchId &&
      !contextCanAccessBranch(context, parsed.data.deliveryBranchId)
    ) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this delivery location.",
      });
    }

    try {
      const purchaseOrderId = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureSupplier({
          businessId: context.business.id,
          supplierId: parsed.data.supplierId,
          client: runner,
        });

        if (parsed.data.deliveryBranchId) {
          await ensureBranch({
            businessId: context.business.id,
            branchId: parsed.data.deliveryBranchId,
            client: runner,
          });
        }

        const seenItems = new Set<string>();

        for (const item of parsed.data.items) {
          if (seenItems.has(item.itemId)) {
            throw new Error("DUPLICATE_PO_ITEM");
          }

          seenItems.add(item.itemId);

          await ensureTrackableProduct({
            businessId: context.business.id,
            itemId: item.itemId,
            client: runner,
          });
        }

        const orderNumber = await generateBusinessNumber({
          runner,
          businessId: context.business.id,
          prefix: "PO",
          counterName: "purchase-order",
        });

        const orderResult = await client.query<{ id: string } & DbRow>(
          `
            insert into purchase_orders (
              business_id,
              supplier_id,
              order_number,
              status,
              order_date,
              expected_delivery_date,
              delivery_branch_id,
              notes,
              ordered_by_user_id
            )
            values ($1, $2, $3, 'draft', current_date, $4, $5, $6, $7)
            returning id
          `,
          [
            context.business.id,
            parsed.data.supplierId,
            orderNumber,
            parsed.data.expectedDeliveryDate || null,
            parsed.data.deliveryBranchId || null,
            cleanText(parsed.data.notes),
            context.user.id,
          ],
        );

        const order = orderResult.rows[0];

        if (!order) {
          throw new Error("PURCHASE_ORDER_NOT_CREATED");
        }

        for (const item of parsed.data.items) {
          await client.query(
            `
              insert into purchase_order_items (
                business_id,
                purchase_order_id,
                item_id,
                quantity_ordered,
                quantity_received,
                expected_unit_cost_cents,
                note
              )
              values ($1, $2, $3, $4, 0, $5, $6)
            `,
            [
              context.business.id,
              order.id,
              item.itemId,
              item.quantityOrdered,
              item.expectedUnitCostCents ?? null,
              cleanText(item.note),
            ],
          );
        }

        return order.id;
      });

      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId,
      });

      return reply.status(201).send({
        ok: true,
        purchaseOrder: detail.order,
        items: detail.items,
      });
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.patch("/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update purchase orders.",
      });
    }

    const parsed = updatePurchaseOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the purchase order details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const params = request.params as { id: string };

    if (
      parsed.data.deliveryBranchId &&
      !contextCanAccessBranch(context, parsed.data.deliveryBranchId)
    ) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this delivery location.",
      });
    }

    try {
      await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        const orderResult = await client.query<
          { id: string; status: PurchaseOrderStatus } & DbRow
        >(
          `
            select id, status
            from purchase_orders
            where id = $1
              and business_id = $2
            for update
          `,
          [params.id, context.business.id],
        );

        const order = orderResult.rows[0];

        if (!order) {
          throw new Error("PURCHASE_ORDER_NOT_FOUND");
        }

        if (order.status !== "draft") {
          throw new Error("PURCHASE_ORDER_NOT_DRAFT");
        }

        await ensureSupplier({
          businessId: context.business.id,
          supplierId: parsed.data.supplierId,
          client: runner,
        });

        if (parsed.data.deliveryBranchId) {
          await ensureBranch({
            businessId: context.business.id,
            branchId: parsed.data.deliveryBranchId,
            client: runner,
          });
        }

        const seenItems = new Set<string>();

        for (const item of parsed.data.items) {
          if (seenItems.has(item.itemId)) {
            throw new Error("DUPLICATE_PO_ITEM");
          }

          seenItems.add(item.itemId);

          await ensureTrackableProduct({
            businessId: context.business.id,
            itemId: item.itemId,
            client: runner,
          });
        }

        await client.query(
          `
            update purchase_orders
            set
              supplier_id = $1,
              expected_delivery_date = $2,
              delivery_branch_id = $3,
              notes = $4,
              updated_at = now()
            where id = $5
              and business_id = $6
          `,
          [
            parsed.data.supplierId,
            parsed.data.expectedDeliveryDate || null,
            parsed.data.deliveryBranchId || null,
            cleanText(parsed.data.notes),
            params.id,
            context.business.id,
          ],
        );

        await client.query(
          `
            delete from purchase_order_items
            where purchase_order_id = $1
              and business_id = $2
          `,
          [params.id, context.business.id],
        );

        for (const item of parsed.data.items) {
          await client.query(
            `
              insert into purchase_order_items (
                business_id,
                purchase_order_id,
                item_id,
                quantity_ordered,
                quantity_received,
                expected_unit_cost_cents,
                note
              )
              values ($1, $2, $3, $4, 0, $5, $6)
            `,
            [
              context.business.id,
              params.id,
              item.itemId,
              item.quantityOrdered,
              item.expectedUnitCostCents ?? null,
              cleanText(item.note),
            ],
          );
        }
      });

      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      return {
        ok: true,
        purchaseOrder: detail.order,
        items: detail.items,
      };
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.post("/:id/mark-ordered", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_MARK_ORDERED")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to mark purchase orders as ordered.",
      });
    }

    const parsed = markPurchaseOrderOrderedSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the order details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const params = request.params as { id: string };

    try {
      await transaction(async (client) => {
        const orderResult = await client.query<
          { id: string; status: PurchaseOrderStatus } & DbRow
        >(
          `
            select id, status
            from purchase_orders
            where id = $1
              and business_id = $2
            for update
          `,
          [params.id, context.business.id],
        );

        const order = orderResult.rows[0];

        if (!order) {
          throw new Error("PURCHASE_ORDER_NOT_FOUND");
        }

        if (order.status !== "draft") {
          throw new Error("PURCHASE_ORDER_NOT_DRAFT");
        }

        const itemCountResult = await client.query<{ count: string } & DbRow>(
          `
            select count(*)::text as count
            from purchase_order_items
            where purchase_order_id = $1
              and business_id = $2
          `,
          [params.id, context.business.id],
        );

        if (Number(itemCountResult.rows[0]?.count || 0) <= 0) {
          throw new Error("PURCHASE_ORDER_EMPTY");
        }

        await client.query(
          `
            update purchase_orders
            set
              status = 'ordered',
              marked_ordered_by_user_id = $1,
              marked_ordered_at = now(),
              updated_at = now(),
              notes = coalesce($2, notes)
            where id = $3
              and business_id = $4
          `,
          [
            context.user.id,
            cleanText(parsed.data.note),
            params.id,
            context.business.id,
          ],
        );
      });

      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      return {
        ok: true,
        purchaseOrder: detail.order,
        items: detail.items,
      };
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.post("/:id/cancel", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_CANCEL")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to cancel purchase orders.",
      });
    }

    const parsed = cancelPurchaseOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the cancellation details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const params = request.params as { id: string };

    try {
      const result = await query(
        `
          update purchase_orders
          set
            status = 'cancelled',
            cancelled_by_user_id = $1,
            cancelled_at = now(),
            cancel_reason = $2,
            updated_at = now()
          where id = $3
            and business_id = $4
            and status in ('draft', 'ordered', 'partly_received')
          returning id
        `,
        [context.user.id, parsed.data.reason, params.id, context.business.id],
      );

      if (result.rows.length === 0) {
        throw new Error("PURCHASE_ORDER_NOT_FOUND");
      }

      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      return {
        ok: true,
        purchaseOrder: detail.order,
        items: detail.items,
      };
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.post("/:id/receive", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_RECEIVE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to receive purchase order stock.",
      });
    }

    const parsed = receivePurchaseOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the received stock details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const params = request.params as { id: string };

    if (!contextCanAccessBranch(context, parsed.data.receivedBranchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this receiving location.",
      });
    }

    try {
      const receiptId = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureBranch({
          businessId: context.business.id,
          branchId: parsed.data.receivedBranchId,
          client: runner,
        });

        const orderResult = await client.query<
          { id: string; status: PurchaseOrderStatus } & DbRow
        >(
          `
            select id, status
            from purchase_orders
            where id = $1
              and business_id = $2
            for update
          `,
          [params.id, context.business.id],
        );

        const order = orderResult.rows[0];

        if (!order) {
          throw new Error("PURCHASE_ORDER_NOT_FOUND");
        }

        if (order.status !== "ordered" && order.status !== "partly_received") {
          throw new Error("PURCHASE_ORDER_CANNOT_RECEIVE");
        }

        const receiptNumber =
          cleanText(parsed.data.receiptNumber) ||
          (await generateBusinessNumber({
            runner,
            businessId: context.business.id,
            prefix: "POR",
            counterName: "purchase-order-receipt",
          }));

        const receiptResult = await client.query<{ id: string } & DbRow>(
          `
            insert into purchase_order_receipts (
              business_id,
              purchase_order_id,
              received_branch_id,
              receipt_number,
              note,
              received_by_user_id
            )
            values ($1, $2, $3, $4, $5, $6)
            returning id
          `,
          [
            context.business.id,
            params.id,
            parsed.data.receivedBranchId,
            receiptNumber,
            cleanText(parsed.data.note),
            context.user.id,
          ],
        );

        const receipt = receiptResult.rows[0];

        if (!receipt) {
          throw new Error("PURCHASE_ORDER_RECEIPT_NOT_CREATED");
        }

        const seenReceiptItems = new Set<string>();

        for (const item of parsed.data.items) {
          if (seenReceiptItems.has(item.purchaseOrderItemId)) {
            throw new Error("DUPLICATE_PO_ITEM");
          }

          seenReceiptItems.add(item.purchaseOrderItemId);

          const poItemResult =
            await client.query<DbPurchaseOrderItemForReceive>(
              `
              select
                id,
                business_id,
                purchase_order_id,
                item_id,
                quantity_ordered,
                quantity_received,
                expected_unit_cost_cents
              from purchase_order_items
              where id = $1
                and business_id = $2
                and purchase_order_id = $3
              for update
            `,
              [item.purchaseOrderItemId, context.business.id, params.id],
            );

          const poItem = poItemResult.rows[0];

          if (!poItem) {
            throw new Error("ITEM_NOT_FOUND");
          }

          const alreadyReceived = toNumber(poItem.quantity_received);
          const orderedQuantity = toNumber(poItem.quantity_ordered);
          const remainingQuantity = orderedQuantity - alreadyReceived;

          if (item.quantityReceived > remainingQuantity) {
            throw new Error("RECEIVE_MORE_THAN_ORDERED");
          }

          await ensureTrackableProduct({
            businessId: context.business.id,
            itemId: poItem.item_id,
            client: runner,
          });

          const stockRecord = await getOrCreateStockRecord({
            businessId: context.business.id,
            branchId: parsed.data.receivedBranchId,
            itemId: poItem.item_id,
            client: runner,
          });

          const beforeAvailable = toNumber(stockRecord.quantity_available);
          const beforeDamaged = toNumber(stockRecord.quantity_damaged);
          const beforeOnHand = toNumber(stockRecord.quantity_on_hand);

          const afterAvailable = beforeAvailable + item.quantityReceived;
          const afterDamaged = beforeDamaged;
          const afterOnHand = beforeOnHand + item.quantityReceived;

          await client.query(
            `
              update branch_item_stock
              set
                quantity_available = $1,
                quantity_damaged = $2,
                quantity_on_hand = $3,
                updated_at = now()
              where id = $4
            `,
            [afterAvailable, afterDamaged, afterOnHand, stockRecord.id],
          );

          await client.query(
            `
              update purchase_order_items
              set
                quantity_received = quantity_received + $1,
                updated_at = now()
              where id = $2
                and business_id = $3
            `,
            [item.quantityReceived, poItem.id, context.business.id],
          );

          await client.query(
            `
              insert into purchase_order_receipt_items (
                business_id,
                purchase_order_receipt_id,
                purchase_order_item_id,
                item_id,
                quantity_received,
                actual_unit_cost_cents,
                note
              )
              values ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              context.business.id,
              receipt.id,
              poItem.id,
              poItem.item_id,
              item.quantityReceived,
              item.actualUnitCostCents ?? poItem.expected_unit_cost_cents,
              cleanText(item.note),
            ],
          );

          await client.query(
            `
              insert into stock_movements (
                business_id,
                branch_id,
                item_id,
                movement_type,
                quantity_change,
                quantity_available_before,
                quantity_available_after,
                quantity_damaged_before,
                quantity_damaged_after,
                quantity_on_hand_before,
                quantity_on_hand_after,
                reason,
                note,
                reference,
                actor_user_id,
                purchase_order_id,
                purchase_order_receipt_id
              )
              values ($1, $2, $3, 'STOCK_RECEIVED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `,
            [
              context.business.id,
              parsed.data.receivedBranchId,
              poItem.item_id,
              item.quantityReceived,
              beforeAvailable,
              afterAvailable,
              beforeDamaged,
              afterDamaged,
              beforeOnHand,
              afterOnHand,
              "Purchase order stock received",
              cleanText(item.note) || cleanText(parsed.data.note),
              receiptNumber,
              context.user.id,
              params.id,
              receipt.id,
            ],
          );
        }

        const statusResult = await client.query<
          {
            total_ordered: number;
            total_received: number;
          } & DbRow
        >(
          `
            select
              coalesce(sum(quantity_ordered), 0)::int as total_ordered,
              coalesce(sum(quantity_received), 0)::int as total_received
            from purchase_order_items
            where purchase_order_id = $1
              and business_id = $2
          `,
          [params.id, context.business.id],
        );

        const totals = statusResult.rows[0];
        const totalOrdered = toNumber(totals?.total_ordered);
        const totalReceived = toNumber(totals?.total_received);

        const nextStatus =
          totalReceived >= totalOrdered ? "fully_received" : "partly_received";

        await client.query(
          `
            update purchase_orders
            set
              status = $1,
              updated_at = now()
            where id = $2
              and business_id = $3
          `,
          [nextStatus, params.id, context.business.id],
        );

        return receipt.id;
      });

      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      return reply.status(201).send({
        ok: true,
        receiptId,
        purchaseOrder: detail.order,
        items: detail.items,
        receipts: detail.receipts,
        receiptItems: detail.receiptItems,
      });
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });

  app.post("/:id/send", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "PURCHASE_ORDER_SEND")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to share purchase orders.",
      });
    }

    const parsed = purchaseOrderSendSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the sharing details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const params = request.params as { id: string };

    try {
      const detail = await loadPurchaseOrderDetail({
        businessId: context.business.id,
        purchaseOrderId: params.id,
      });

      const documentBusiness = getDocumentBusiness(context);
      const documentSender = getDocumentSender(context);

      const defaultMessage = buildPurchaseOrderMessage({
        business: documentBusiness,
        sender: documentSender,
        order: detail.order,
        items: detail.items,
      });

      const message = cleanText(parsed.data.message) || defaultMessage;
      const recipientName =
        cleanText(parsed.data.recipientName) ||
        detail.order.supplierContactPerson ||
        detail.order.supplierName;
      const recipientEmail =
        cleanText(parsed.data.recipientEmail) || detail.order.supplierEmail;
      const recipientPhone =
        cleanText(parsed.data.recipientPhone) || detail.order.supplierPhone;
      const subject =
        cleanText(parsed.data.subject) ||
        `Purchase order ${detail.order.orderNumber}`;

      let status: PurchaseOrderSendStatus = "completed";
      let failureReason: string | null = null;

      if (parsed.data.method === "email") {
        if (!recipientEmail) {
          status = "failed";
          failureReason = "Supplier email is missing.";
        } else {
          const pdfBuffer = await generatePurchaseOrderPdf({
            business: documentBusiness,
            sender: documentSender,
            order: detail.order,
            items: detail.items,
          });

          const emailResult = await sendPurchaseOrderEmail({
            business: documentBusiness,
            sender: documentSender,
            order: detail.order,
            items: detail.items,
            to: recipientEmail,
            subject,
            message,
            pdfBuffer,
          });

          if (!emailResult.ok) {
            status =
              emailResult.reason ===
              "Email sending is not configured on this deployment."
                ? "not_configured"
                : "failed";
            failureReason = emailResult.reason;
          }
        }
      }

      const eventResult = await query<DbPurchaseOrderSendEvent>(
        `
          insert into purchase_order_send_events (
            business_id,
            purchase_order_id,
            send_method,
            recipient_name,
            recipient_email,
            recipient_phone,
            subject,
            message,
            status,
            failure_reason,
            sent_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          returning
            id,
            purchase_order_id,
            send_method,
            recipient_name,
            recipient_email,
            recipient_phone,
            subject,
            message,
            status,
            failure_reason,
            null::text as sent_by_name,
            created_at
        `,
        [
          context.business.id,
          params.id,
          parsed.data.method,
          recipientName,
          recipientEmail,
          recipientPhone,
          subject,
          message,
          status,
          failureReason,
          context.user.id,
        ],
      );

      const sendEvent = eventResult.rows[0];

      if (!sendEvent) {
        throw new Error("PURCHASE_ORDER_SEND_EVENT_NOT_CREATED");
      }

      return {
        ok: true,
        sendEvent: mapSendEvent(sendEvent),
        message,
        whatsappUrl:
          parsed.data.method === "whatsapp"
            ? buildWhatsappUrl({
                phone: recipientPhone,
                message,
              })
            : null,
      };
    } catch (error) {
      return purchaseOrderErrorReply(reply, error);
    }
  });
}
