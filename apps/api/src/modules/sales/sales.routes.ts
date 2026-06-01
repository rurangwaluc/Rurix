import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createCustomerSchema,
  createSaleSchema,
  listCustomersQuerySchema,
  listSalesQuerySchema,
  saleIdParamsSchema,
  updateCustomerSchema,
} from "@rurix/schemas";
import { query, transaction, type DbRow } from "@rurix/db";
import { generateBusinessNumber } from "../../lib/business-numbering";
import {
  contextCanAccessBranch,
  contextHasPermission,
  requireAuth,
} from "../auth/auth.context";

type BusinessType = "product" | "service" | "product_and_service";

type SaleStatus = "completed" | "cancelled" | "refunded" | "partly_refunded";

type SalePaymentMethod = "cash" | "mobile_money" | "bank_transfer" | "card";

type DbBranch = DbRow & {
  id: string;
  name: string;
  status: string;
};

type DbCustomer = DbRow & {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: Date;
  updated_at: Date;
};

type DbCatalogItemForSale = DbRow & {
  id: string;
  name: string;
  sku: string | null;
  item_kind: "PRODUCT" | "SERVICE";
  track_stock: boolean;
  status: string;
  selling_price_cents: number | null;
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

type DbSaleSummary = DbRow & {
  id: string;
  branch_id: string;
  branch_name: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  sale_number: string;
  receipt_number: string | null;
  status: SaleStatus;
  sale_type: "direct_sale" | "converted_proforma";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  notes: string | null;
  completed_at: Date;
  created_by_name: string | null;
  item_count: number;
  created_at: Date;
  updated_at: Date;
};

type DbSale = DbRow & {
  id: string;
  branch_id: string;
  branch_name: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  sale_number: string;
  receipt_number: string | null;
  status: SaleStatus;
  sale_type: "direct_sale" | "converted_proforma";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  notes: string | null;
  completed_at: Date;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
};

type DbSaleItem = DbRow & {
  id: string;
  sale_id: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  line_total_cents: number;
  created_at: Date;
};

type DbSalePayment = DbRow & {
  id: string;
  sale_id: string;
  method: SalePaymentMethod;
  amount_cents: number;
  reference: string | null;
  paid_at: Date;
  received_by_name: string | null;
  created_at: Date;
};

type DbSaleReceipt = DbRow & {
  id: string;
  sale_id: string;
  receipt_number: string;
  issued_to_name: string | null;
  issued_to_phone: string | null;
  issued_at: Date;
  issued_by_name: string | null;
  created_at: Date;
};

function cleanText(value: string | undefined | null) {
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

function salesBusinessGuard(reply: FastifyReply, businessTypeValue: string) {
  const businessType = getBusinessType(businessTypeValue);

  if (!businessUsesInventory(businessType)) {
    return reply.status(400).send({
      ok: false,
      message: "This business does not use stock-tracked product sales.",
    });
  }

  return null;
}

function mapCustomer(row: DbCustomer) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSaleSummary(row: DbSaleSummary) {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    saleNumber: row.sale_number,
    receiptNumber: row.receipt_number,
    status: row.status,
    saleType: row.sale_type,
    subtotalCents: toNumber(row.subtotal_cents),
    discountCents: toNumber(row.discount_cents),
    taxCents: toNumber(row.tax_cents),
    totalCents: toNumber(row.total_cents),
    paidCents: toNumber(row.paid_cents),
    balanceCents: toNumber(row.balance_cents),
    notes: row.notes,
    completedAt: row.completed_at,
    createdByName: row.created_by_name,
    itemCount: toNumber(row.item_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSale(row: DbSale) {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerAddress: row.customer_address,
    saleNumber: row.sale_number,
    receiptNumber: row.receipt_number,
    status: row.status,
    saleType: row.sale_type,
    subtotalCents: toNumber(row.subtotal_cents),
    discountCents: toNumber(row.discount_cents),
    taxCents: toNumber(row.tax_cents),
    totalCents: toNumber(row.total_cents),
    paidCents: toNumber(row.paid_cents),
    balanceCents: toNumber(row.balance_cents),
    notes: row.notes,
    completedAt: row.completed_at,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSaleItem(row: DbSaleItem) {
  return {
    id: row.id,
    saleId: row.sale_id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemSku: row.item_sku,
    quantity: toNumber(row.quantity),
    unitPriceCents: toNumber(row.unit_price_cents),
    discountCents: toNumber(row.discount_cents),
    lineTotalCents: toNumber(row.line_total_cents),
    createdAt: row.created_at,
  };
}

function mapSalePayment(row: DbSalePayment) {
  return {
    id: row.id,
    saleId: row.sale_id,
    method: row.method,
    amountCents: toNumber(row.amount_cents),
    reference: row.reference,
    paidAt: row.paid_at,
    receivedByName: row.received_by_name,
    createdAt: row.created_at,
  };
}

function mapSaleReceipt(row: DbSaleReceipt) {
  return {
    id: row.id,
    saleId: row.sale_id,
    receiptNumber: row.receipt_number,
    issuedToName: row.issued_to_name,
    issuedToPhone: row.issued_to_phone,
    issuedAt: row.issued_at,
    issuedByName: row.issued_by_name,
    createdAt: row.created_at,
  };
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
      select id, name, status
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

async function ensureCustomer(input: {
  businessId: string;
  customerId: string;
  client: {
    query: typeof query;
  };
}) {
  const result = await input.client.query<DbCustomer>(
    `
      select *
      from customers
      where id = $1
        and business_id = $2
      limit 1
    `,
    [input.customerId, input.businessId],
  );

  const customer = result.rows[0];

  if (!customer) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }

  if (customer.status !== "active") {
    throw new Error("CUSTOMER_INACTIVE");
  }

  return customer;
}

async function ensureSaleProduct(input: {
  businessId: string;
  itemId: string;
  client: {
    query: typeof query;
  };
}) {
  const result = await input.client.query<DbCatalogItemForSale>(
    `
      select
        id,
        name,
        sku,
        item_kind,
        track_stock,
        status,
        selling_price_cents
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

async function getStockRecordForSale(input: {
  businessId: string;
  branchId: string;
  itemId: string;
  client: {
    query: typeof query;
  };
}) {
  const result = await input.client.query<DbStockRecord>(
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

  const stockRecord = result.rows[0];

  if (!stockRecord) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  return stockRecord;
}

function salesErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Selling location not found.",
    });
  }

  if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Customer not found.",
    });
  }

  if (error instanceof Error && error.message === "CUSTOMER_INACTIVE") {
    return reply.status(400).send({
      ok: false,
      message: "This customer is not active.",
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

  if (error instanceof Error && error.message === "DUPLICATE_SALE_ITEM") {
    return reply.status(400).send({
      ok: false,
      message: "A product can appear only once on the same sale.",
    });
  }

  if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
    return reply.status(400).send({
      ok: false,
      message: "There is not enough available stock in this selling location.",
    });
  }

  if (error instanceof Error && error.message === "PAYMENT_TOTAL_MISMATCH") {
    return reply.status(400).send({
      ok: false,
      message: "Payment amount must match the sale total for now.",
    });
  }

  if (error instanceof Error && error.message === "SALE_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Sale not found.",
    });
  }

  throw error;
}

async function loadSaleDetail(input: { businessId: string; saleId: string }) {
  const saleResult = await query<DbSale>(
    `
      select
        s.id,
        s.branch_id,
        b.name as branch_name,
        s.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.address as customer_address,
        s.sale_number,
        s.receipt_number,
        s.status,
        s.sale_type,
        s.subtotal_cents,
        s.discount_cents,
        s.tax_cents,
        s.total_cents,
        s.paid_cents,
        s.balance_cents,
        s.notes,
        s.completed_at,
        u.full_name as created_by_name,
        s.created_at,
        s.updated_at
      from sales s
      inner join branches b on b.id = s.branch_id
      left join customers c on c.id = s.customer_id
      left join users u on u.id = s.created_by_user_id
      where s.id = $1
        and s.business_id = $2
      limit 1
    `,
    [input.saleId, input.businessId],
  );

  const sale = saleResult.rows[0];

  if (!sale) {
    throw new Error("SALE_NOT_FOUND");
  }

  const itemsResult = await query<DbSaleItem>(
    `
      select
        id,
        sale_id,
        item_id,
        item_name,
        item_sku,
        quantity,
        unit_price_cents,
        discount_cents,
        line_total_cents,
        created_at
      from sale_items
      where sale_id = $1
        and business_id = $2
      order by created_at asc
    `,
    [input.saleId, input.businessId],
  );

  const paymentsResult = await query<DbSalePayment>(
    `
      select
        sp.id,
        sp.sale_id,
        sp.method,
        sp.amount_cents,
        sp.reference,
        sp.paid_at,
        u.full_name as received_by_name,
        sp.created_at
      from sale_payments sp
      left join users u on u.id = sp.received_by_user_id
      where sp.sale_id = $1
        and sp.business_id = $2
      order by sp.created_at asc
    `,
    [input.saleId, input.businessId],
  );

  const receiptResult = await query<DbSaleReceipt>(
    `
      select
        sr.id,
        sr.sale_id,
        sr.receipt_number,
        sr.issued_to_name,
        sr.issued_to_phone,
        sr.issued_at,
        u.full_name as issued_by_name,
        sr.created_at
      from sale_receipts sr
      left join users u on u.id = sr.issued_by_user_id
      where sr.sale_id = $1
        and sr.business_id = $2
      limit 1
    `,
    [input.saleId, input.businessId],
  );

  return {
    sale: mapSale(sale),
    items: itemsResult.rows.map(mapSaleItem),
    payments: paymentsResult.rows.map(mapSalePayment),
    receipt: receiptResult.rows[0]
      ? mapSaleReceipt(receiptResult.rows[0])
      : null,
  };
}

export async function customerRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CUSTOMER_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view customers.",
      });
    }

    const parsed = listCustomersQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the customer filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const values: unknown[] = [context.business.id];
    const where: string[] = ["business_id = $1"];

    if (parsed.data.status) {
      values.push(parsed.data.status);
      where.push(`status = $${values.length}`);
    }

    if (parsed.data.search) {
      values.push(`%${parsed.data.search}%`);
      where.push(`
        (
          name ilike $${values.length}
          or phone ilike $${values.length}
          or email ilike $${values.length}
        )
      `);
    }

    const result = await query<DbCustomer>(
      `
        select *
        from customers
        where ${where.join(" and ")}
        order by created_at desc
        limit 200
      `,
      values,
    );

    return {
      ok: true,
      customers: result.rows.map(mapCustomer),
    };
  });

  app.post("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CUSTOMER_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create customers.",
      });
    }

    const parsed = createCustomerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the customer details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const result = await query<DbCustomer>(
      `
        insert into customers (
          business_id,
          name,
          phone,
          email,
          address,
          notes,
          created_by_user_id,
          updated_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $7)
        returning *
      `,
      [
        context.business.id,
        parsed.data.name,
        cleanText(parsed.data.phone),
        cleanText(parsed.data.email),
        cleanText(parsed.data.address),
        cleanText(parsed.data.notes),
        context.user.id,
      ],
    );

    const customer = result.rows[0];

    if (!customer) {
      return reply.status(500).send({
        ok: false,
        message: "Customer could not be created.",
      });
    }

    return reply.status(201).send({
      ok: true,
      customer: mapCustomer(customer),
    });
  });

  app.patch("/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CUSTOMER_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update customers.",
      });
    }

    const params = request.params as { id: string };
    const parsed = updateCustomerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the customer details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const result = await query<DbCustomer>(
      `
        update customers
        set
          name = coalesce($1, name),
          phone = coalesce($2, phone),
          email = coalesce($3, email),
          address = coalesce($4, address),
          notes = coalesce($5, notes),
          status = coalesce($6, status),
          updated_by_user_id = $7,
          updated_at = now()
        where id = $8
          and business_id = $9
        returning *
      `,
      [
        cleanText(parsed.data.name),
        cleanText(parsed.data.phone),
        cleanText(parsed.data.email),
        cleanText(parsed.data.address),
        cleanText(parsed.data.notes),
        parsed.data.status || null,
        context.user.id,
        params.id,
        context.business.id,
      ],
    );

    const customer = result.rows[0];

    if (!customer) {
      return reply.status(404).send({
        ok: false,
        message: "Customer not found.",
      });
    }

    return {
      ok: true,
      customer: mapCustomer(customer),
    };
  });
}

export async function salesRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = salesBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "SALE_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view sales.",
      });
    }

    const parsed = listSalesQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the sales filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const values: unknown[] = [context.business.id];
    const where: string[] = ["s.business_id = $1"];

    if (parsed.data.status) {
      values.push(parsed.data.status);
      where.push(`s.status = $${values.length}`);
    }

    if (parsed.data.branchId) {
      if (!contextCanAccessBranch(context, parsed.data.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this selling location.",
        });
      }

      values.push(parsed.data.branchId);
      where.push(`s.branch_id = $${values.length}`);
    }

    if (parsed.data.customerId) {
      values.push(parsed.data.customerId);
      where.push(`s.customer_id = $${values.length}`);
    }

    if (parsed.data.dateFrom) {
      values.push(parsed.data.dateFrom);
      where.push(`s.completed_at >= $${values.length}::timestamptz`);
    }

    if (parsed.data.dateTo) {
      values.push(parsed.data.dateTo);
      where.push(`s.completed_at <= $${values.length}::timestamptz`);
    }

    if (parsed.data.search) {
      values.push(`%${parsed.data.search}%`);
      where.push(`
        (
          s.sale_number ilike $${values.length}
          or s.receipt_number ilike $${values.length}
          or c.name ilike $${values.length}
          or c.phone ilike $${values.length}
        )
      `);
    }

    const result = await query<DbSaleSummary>(
      `
        select
          s.id,
          s.branch_id,
          b.name as branch_name,
          s.customer_id,
          c.name as customer_name,
          c.phone as customer_phone,
          s.sale_number,
          s.receipt_number,
          s.status,
          s.sale_type,
          s.subtotal_cents,
          s.discount_cents,
          s.tax_cents,
          s.total_cents,
          s.paid_cents,
          s.balance_cents,
          s.notes,
          s.completed_at,
          u.full_name as created_by_name,
          count(si.id)::int as item_count,
          s.created_at,
          s.updated_at
        from sales s
        inner join branches b on b.id = s.branch_id
        left join customers c on c.id = s.customer_id
        left join users u on u.id = s.created_by_user_id
        left join sale_items si on si.sale_id = s.id
        where ${where.join(" and ")}
        group by s.id, b.name, c.name, c.phone, u.full_name
        order by s.completed_at desc
        limit 200
      `,
      values,
    );

    return {
      ok: true,
      sales: result.rows.map(mapSaleSummary),
    };
  });

  app.get("/:id/receipt", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "SALE_RECEIPT_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view sale receipts.",
      });
    }

    const parsedParams = saleIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a valid sale.",
        issues: parsedParams.error.flatten(),
      });
    }

    try {
      const detail = await loadSaleDetail({
        businessId: context.business.id,
        saleId: parsedParams.data.id,
      });

      return {
        ok: true,
        ...detail,
      };
    } catch (error) {
      return salesErrorReply(reply, error);
    }
  });

  app.get("/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "SALE_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view sales.",
      });
    }

    const parsedParams = saleIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a valid sale.",
        issues: parsedParams.error.flatten(),
      });
    }

    try {
      const detail = await loadSaleDetail({
        businessId: context.business.id,
        saleId: parsedParams.data.id,
      });

      return {
        ok: true,
        ...detail,
      };
    } catch (error) {
      return salesErrorReply(reply, error);
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

    const blockedByBusinessType = salesBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "SALE_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create sales.",
      });
    }

    const parsed = createSaleSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the sale details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    if (!contextCanAccessBranch(context, parsed.data.branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this selling location.",
      });
    }

    try {
      const saleId = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureBranch({
          businessId: context.business.id,
          branchId: parsed.data.branchId,
          client: runner,
        });

        let customerId: string | null = null;
        let receiptCustomerName: string | null = null;
        let receiptCustomerPhone: string | null = null;

        if (parsed.data.customerId) {
          const customer = await ensureCustomer({
            businessId: context.business.id,
            customerId: parsed.data.customerId,
            client: runner,
          });

          customerId = customer.id;
          receiptCustomerName = customer.name;
          receiptCustomerPhone = customer.phone;
        } else if (parsed.data.customer) {
          const customerResult = await client.query<DbCustomer>(
            `
              insert into customers (
                business_id,
                name,
                phone,
                email,
                address,
                notes,
                created_by_user_id,
                updated_by_user_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $7)
              returning *
            `,
            [
              context.business.id,
              parsed.data.customer.name,
              cleanText(parsed.data.customer.phone),
              cleanText(parsed.data.customer.email),
              cleanText(parsed.data.customer.address),
              cleanText(parsed.data.customer.notes),
              context.user.id,
            ],
          );

          const customer = customerResult.rows[0];

          if (!customer) {
            throw new Error("CUSTOMER_NOT_CREATED");
          }

          customerId = customer.id;
          receiptCustomerName = customer.name;
          receiptCustomerPhone = customer.phone;
        }

        const seenItems = new Set<string>();
        const preparedItems: Array<{
          itemId: string;
          itemName: string;
          itemSku: string | null;
          quantity: number;
          unitPriceCents: number;
          discountCents: number;
          lineTotalCents: number;
          stockRecord: DbStockRecord;
        }> = [];

        for (const itemInput of parsed.data.items) {
          if (seenItems.has(itemInput.itemId)) {
            throw new Error("DUPLICATE_SALE_ITEM");
          }

          seenItems.add(itemInput.itemId);

          const item = await ensureSaleProduct({
            businessId: context.business.id,
            itemId: itemInput.itemId,
            client: runner,
          });

          const stockRecord = await getStockRecordForSale({
            businessId: context.business.id,
            branchId: parsed.data.branchId,
            itemId: item.id,
            client: runner,
          });

          const availableQuantity = toNumber(stockRecord.quantity_available);

          if (availableQuantity < itemInput.quantity) {
            throw new Error("INSUFFICIENT_STOCK");
          }

          const unitPriceCents =
            itemInput.unitPriceCents ?? toNumber(item.selling_price_cents);
          const discountCents = itemInput.discountCents ?? 0;
          const lineSubtotal = unitPriceCents * itemInput.quantity;
          const lineTotalCents = Math.max(lineSubtotal - discountCents, 0);

          preparedItems.push({
            itemId: item.id,
            itemName: item.name,
            itemSku: item.sku,
            quantity: itemInput.quantity,
            unitPriceCents,
            discountCents,
            lineTotalCents,
            stockRecord,
          });
        }

        const subtotalCents = preparedItems.reduce(
          (sum, item) => sum + item.lineTotalCents,
          0,
        );
        const orderDiscountCents = parsed.data.discountCents ?? 0;
        const taxCents = parsed.data.taxCents ?? 0;
        const totalCents =
          Math.max(subtotalCents - orderDiscountCents, 0) + taxCents;
        const paidCents = parsed.data.payments.reduce(
          (sum, payment) => sum + payment.amountCents,
          0,
        );

        if (paidCents !== totalCents) {
          throw new Error("PAYMENT_TOTAL_MISMATCH");
        }

        const saleNumber = await generateBusinessNumber({
          runner,
          businessId: context.business.id,
          prefix: "SALE",
          counterName: "sale",
        });

        const receiptNumber = await generateBusinessNumber({
          runner,
          businessId: context.business.id,
          prefix: "RCT",
          counterName: "sale-receipt",
        });

        const saleResult = await client.query<{ id: string } & DbRow>(
          `
            insert into sales (
              business_id,
              branch_id,
              customer_id,
              sale_number,
              receipt_number,
              status,
              sale_type,
              subtotal_cents,
              discount_cents,
              tax_cents,
              total_cents,
              paid_cents,
              balance_cents,
              notes,
              completed_at,
              created_by_user_id,
              updated_by_user_id
            )
            values ($1, $2, $3, $4, $5, 'completed', 'direct_sale', $6, $7, $8, $9, $10, 0, $11, now(), $12, $12)
            returning id
          `,
          [
            context.business.id,
            parsed.data.branchId,
            customerId,
            saleNumber,
            receiptNumber,
            subtotalCents,
            orderDiscountCents,
            taxCents,
            totalCents,
            paidCents,
            cleanText(parsed.data.notes),
            context.user.id,
          ],
        );

        const sale = saleResult.rows[0];

        if (!sale) {
          throw new Error("SALE_NOT_CREATED");
        }

        for (const item of preparedItems) {
          const saleItemResult = await client.query<{ id: string } & DbRow>(
            `
              insert into sale_items (
                business_id,
                sale_id,
                item_id,
                item_name,
                item_sku,
                quantity,
                unit_price_cents,
                discount_cents,
                line_total_cents
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              returning id
            `,
            [
              context.business.id,
              sale.id,
              item.itemId,
              item.itemName,
              item.itemSku,
              item.quantity,
              item.unitPriceCents,
              item.discountCents,
              item.lineTotalCents,
            ],
          );

          const saleItem = saleItemResult.rows[0];

          if (!saleItem) {
            throw new Error("SALE_ITEM_NOT_CREATED");
          }

          const beforeAvailable = toNumber(item.stockRecord.quantity_available);
          const beforeDamaged = toNumber(item.stockRecord.quantity_damaged);
          const beforeOnHand = toNumber(item.stockRecord.quantity_on_hand);

          const afterAvailable = beforeAvailable - item.quantity;
          const afterDamaged = beforeDamaged;
          const afterOnHand = beforeOnHand - item.quantity;

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
            [afterAvailable, afterDamaged, afterOnHand, item.stockRecord.id],
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
                sale_id,
                sale_item_id
              )
              values ($1, $2, $3, 'STOCK_SOLD', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `,
            [
              context.business.id,
              parsed.data.branchId,
              item.itemId,
              -item.quantity,
              beforeAvailable,
              afterAvailable,
              beforeDamaged,
              afterDamaged,
              beforeOnHand,
              afterOnHand,
              "Product sold",
              cleanText(parsed.data.notes),
              receiptNumber,
              context.user.id,
              sale.id,
              saleItem.id,
            ],
          );
        }

        for (const payment of parsed.data.payments) {
          await client.query(
            `
              insert into sale_payments (
                business_id,
                sale_id,
                method,
                amount_cents,
                reference,
                received_by_user_id
              )
              values ($1, $2, $3, $4, $5, $6)
            `,
            [
              context.business.id,
              sale.id,
              payment.method,
              payment.amountCents,
              cleanText(payment.reference),
              context.user.id,
            ],
          );
        }

        await client.query(
          `
            insert into sale_receipts (
              business_id,
              sale_id,
              receipt_number,
              issued_to_name,
              issued_to_phone,
              issued_by_user_id
            )
            values ($1, $2, $3, $4, $5, $6)
          `,
          [
            context.business.id,
            sale.id,
            receiptNumber,
            receiptCustomerName,
            receiptCustomerPhone,
            context.user.id,
          ],
        );

        return sale.id;
      });

      const detail = await loadSaleDetail({
        businessId: context.business.id,
        saleId,
      });

      return reply.status(201).send({
        ok: true,
        ...detail,
      });
    } catch (error) {
      return salesErrorReply(reply, error);
    }
  });
}
