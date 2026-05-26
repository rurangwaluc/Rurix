import type { FastifyInstance, FastifyReply } from "fastify";
import {
  adjustStockSchema,
  listStockMovementsQuerySchema,
  listStockQuerySchema,
  receiveStockSchema,
  updateStockAlertSchema,
} from "@rurix/schemas";
import { query, transaction, type DbRow } from "@rurix/db";
import { generateBusinessNumber } from "../../lib/business-numbering";
import {
  contextCanAccessBranch,
  contextHasPermission,
  getContextBranchIds,
  requireAuth,
} from "../auth/auth.context";

type DbStockRow = DbRow & {
  id: string;
  business_id: string;
  branch_id: string;
  branch_name: string;
  item_id: string;
  item_name: string;
  sku: string | null;
  barcode: string | null;
  category_name: string | null;
  selling_price_cents: number;
  quantity_on_hand: number;
  quantity_available: number;
  quantity_damaged: number;
  low_stock_alert_quantity: number;
  updated_at: Date;
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

type DbStockMovement = DbRow & {
  id: string;
  branch_id: string;
  branch_name: string;
  item_id: string;
  item_name: string;
  movement_type: string;
  quantity_change: number;
  quantity_available_before: number;
  quantity_available_after: number;
  quantity_damaged_before: number;
  quantity_damaged_after: number;
  quantity_on_hand_before: number;
  quantity_on_hand_after: number;
  reason: string | null;
  note: string | null;
  reference: string | null;
  actor_name: string | null;
  created_at: Date;
};

type DbCatalogItem = DbRow & {
  id: string;
  item_kind: "PRODUCT" | "SERVICE";
  track_stock: boolean;
  status: string;
};

type StockAdjustmentType =
  | "COUNT_CORRECTION"
  | "DAMAGED_REPORTED"
  | "DAMAGED_RESTORED"
  | "MISSING_REPORTED"
  | "STOLEN_REPORTED";

type BusinessType = "product" | "service" | "product_and_service";

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

function businessUsesStock(businessType: BusinessType) {
  return businessType === "product" || businessType === "product_and_service";
}

function mapStock(row: DbStockRow) {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    itemId: row.item_id,
    itemName: row.item_name,
    sku: row.sku,
    barcode: row.barcode,
    categoryName: row.category_name,
    sellingPriceCents: toNumber(row.selling_price_cents),
    quantityOnHand: toNumber(row.quantity_on_hand),
    quantityAvailable: toNumber(row.quantity_available),
    quantityDamaged: toNumber(row.quantity_damaged),
    lowStockAlertQuantity: toNumber(row.low_stock_alert_quantity),
    isLowStock:
      toNumber(row.low_stock_alert_quantity) > 0 &&
      toNumber(row.quantity_available) <=
        toNumber(row.low_stock_alert_quantity),
    updatedAt: row.updated_at,
  };
}

function mapMovement(row: DbStockMovement) {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    itemId: row.item_id,
    itemName: row.item_name,
    movementType: row.movement_type,
    quantityChange: toNumber(row.quantity_change),
    quantityAvailableBefore: toNumber(row.quantity_available_before),
    quantityAvailableAfter: toNumber(row.quantity_available_after),
    quantityDamagedBefore: toNumber(row.quantity_damaged_before),
    quantityDamagedAfter: toNumber(row.quantity_damaged_after),
    quantityOnHandBefore: toNumber(row.quantity_on_hand_before),
    quantityOnHandAfter: toNumber(row.quantity_on_hand_after),
    reason: row.reason,
    note: row.note,
    reference: row.reference,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

function branchFilterSql(branchIds: string[], startIndex: number) {
  const placeholders = branchIds.map((_, index) => `$${startIndex + index}`);

  return {
    sql: placeholders.length > 0 ? `(${placeholders.join(", ")})` : "(null)",
    nextIndex: startIndex + branchIds.length,
  };
}

function getStockReferenceConfig(
  movementType: StockAdjustmentType | "STOCK_RECEIVED",
) {
  if (movementType === "STOCK_RECEIVED") {
    return {
      prefix: "RCV",
      counterName: "stock-received",
    };
  }

  if (movementType === "DAMAGED_REPORTED") {
    return {
      prefix: "DMG",
      counterName: "stock-damaged",
    };
  }

  if (movementType === "DAMAGED_RESTORED") {
    return {
      prefix: "RST",
      counterName: "stock-restored",
    };
  }

  if (movementType === "MISSING_REPORTED") {
    return {
      prefix: "MIS",
      counterName: "stock-missing",
    };
  }

  if (movementType === "STOLEN_REPORTED") {
    return {
      prefix: "STL",
      counterName: "stock-stolen",
    };
  }

  return {
    prefix: "CNT",
    counterName: "stock-count",
  };
}

async function generateStockReference(input: {
  client: {
    query: typeof query;
  };
  businessId: string;
  movementType: StockAdjustmentType | "STOCK_RECEIVED";
}) {
  const config = getStockReferenceConfig(input.movementType);

  return generateBusinessNumber({
    runner: input.client,
    businessId: input.businessId,
    prefix: config.prefix,
    counterName: config.counterName,
  });
}

function stockBusinessGuard(reply: FastifyReply, businessTypeValue: string) {
  const businessType = getBusinessType(businessTypeValue);

  if (!businessUsesStock(businessType)) {
    return reply.status(400).send({
      ok: false,
      message: "This business does not use stock.",
    });
  }

  return null;
}

async function ensureTrackableProduct(
  businessId: string,
  itemId: string,
  client?: {
    query: typeof query;
  },
) {
  const runner = client || { query };

  const itemResult = await runner.query<DbCatalogItem>(
    `
      select id, item_kind, track_stock, status
      from catalog_items
      where id = $1
        and business_id = $2
      limit 1
    `,
    [itemId, businessId],
  );

  const item = itemResult.rows[0];

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

  return insertedResult.rows[0]!;
}

function ensureEnoughAvailable(stock: DbStockRecord, quantity: number) {
  if (toNumber(stock.quantity_available) < quantity) {
    throw new Error("NOT_ENOUGH_AVAILABLE_STOCK");
  }
}

function ensureEnoughDamaged(stock: DbStockRecord, quantity: number) {
  if (toNumber(stock.quantity_damaged) < quantity) {
    throw new Error("NOT_ENOUGH_DAMAGED_STOCK");
  }
}

function getAdjustmentPermission(adjustmentType: string) {
  if (adjustmentType === "DAMAGED_REPORTED") {
    return "STOCK_DAMAGE_REPORT" as const;
  }

  if (
    adjustmentType === "MISSING_REPORTED" ||
    adjustmentType === "STOLEN_REPORTED"
  ) {
    return "STOCK_LOSS_REPORT" as const;
  }

  return "STOCK_ADJUST" as const;
}

function stockErrorReply(reply: FastifyReply, error: unknown) {
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

  if (
    error instanceof Error &&
    error.message === "NOT_ENOUGH_AVAILABLE_STOCK"
  ) {
    return reply.status(400).send({
      ok: false,
      message: "There is not enough available stock for this action.",
    });
  }

  if (error instanceof Error && error.message === "NOT_ENOUGH_DAMAGED_STOCK") {
    return reply.status(400).send({
      ok: false,
      message: "There is not enough damaged stock for this action.",
    });
  }

  if (error instanceof Error && error.message === "NO_STOCK_CHANGE") {
    return reply.status(400).send({
      ok: false,
      message: "The counted quantity is the same as the current quantity.",
    });
  }

  throw error;
}

export async function stockRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = stockBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "STOCK_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view stock.",
      });
    }

    const parsed = listStockQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the stock filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const values: unknown[] = [context.business.id];
    const where: string[] = ["bis.business_id = $1"];

    if (parsed.data.branchId) {
      if (!contextCanAccessBranch(context, parsed.data.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this location.",
        });
      }

      values.push(parsed.data.branchId);
      where.push(`bis.branch_id = $${values.length}`);
    } else {
      const branchIds = getContextBranchIds(context);

      if (branchIds.length === 0) {
        return {
          ok: true,
          stock: [],
        };
      }

      const branchFilter = branchFilterSql(branchIds, values.length + 1);
      values.push(...branchIds);
      where.push(`bis.branch_id in ${branchFilter.sql}`);
    }

    if (parsed.data.search) {
      values.push(`%${parsed.data.search}%`);
      where.push(`
        (
          ci.name ilike $${values.length}
          or ci.sku ilike $${values.length}
          or ci.barcode ilike $${values.length}
        )
      `);
    }

    if (parsed.data.onlyLowStock) {
      where.push(`
        bis.low_stock_alert_quantity > 0
        and bis.quantity_available <= bis.low_stock_alert_quantity
      `);
    }

    const result = await query<DbStockRow>(
      `
        select
          bis.id,
          bis.business_id,
          bis.branch_id,
          b.name as branch_name,
          bis.item_id,
          ci.name as item_name,
          ci.sku,
          ci.barcode,
          ic.name as category_name,
          ci.selling_price_cents,
          bis.quantity_on_hand,
          bis.quantity_available,
          bis.quantity_damaged,
          bis.low_stock_alert_quantity,
          bis.updated_at
        from branch_item_stock bis
        inner join branches b on b.id = bis.branch_id
        inner join catalog_items ci on ci.id = bis.item_id
        left join item_categories ic on ic.id = ci.category_id
        where ${where.join(" and ")}
        order by b.is_main desc, b.name asc, ci.name asc
      `,
      values,
    );

    return {
      ok: true,
      stock: result.rows.map(mapStock),
    };
  });

  app.get("/movements", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = stockBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "STOCK_MOVEMENT_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view stock history.",
      });
    }

    const parsed = listStockMovementsQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the stock history filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const values: unknown[] = [context.business.id];
    const where: string[] = ["sm.business_id = $1"];

    if (parsed.data.branchId) {
      if (!contextCanAccessBranch(context, parsed.data.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this location.",
        });
      }

      values.push(parsed.data.branchId);
      where.push(`sm.branch_id = $${values.length}`);
    } else {
      const branchIds = getContextBranchIds(context);

      if (branchIds.length === 0) {
        return {
          ok: true,
          movements: [],
        };
      }

      const branchFilter = branchFilterSql(branchIds, values.length + 1);
      values.push(...branchIds);
      where.push(`sm.branch_id in ${branchFilter.sql}`);
    }

    if (parsed.data.itemId) {
      values.push(parsed.data.itemId);
      where.push(`sm.item_id = $${values.length}`);
    }

    if (parsed.data.movementType) {
      values.push(parsed.data.movementType);
      where.push(`sm.movement_type = $${values.length}`);
    }

    const result = await query<DbStockMovement>(
      `
        select
          sm.id,
          sm.branch_id,
          b.name as branch_name,
          sm.item_id,
          ci.name as item_name,
          sm.movement_type,
          sm.quantity_change,
          sm.quantity_available_before,
          sm.quantity_available_after,
          sm.quantity_damaged_before,
          sm.quantity_damaged_after,
          sm.quantity_on_hand_before,
          sm.quantity_on_hand_after,
          sm.reason,
          sm.note,
          sm.reference,
          u.full_name as actor_name,
          sm.created_at
        from stock_movements sm
        inner join branches b on b.id = sm.branch_id
        inner join catalog_items ci on ci.id = sm.item_id
        left join users u on u.id = sm.actor_user_id
        where ${where.join(" and ")}
        order by sm.created_at desc
        limit 200
      `,
      values,
    );

    return {
      ok: true,
      movements: result.rows.map(mapMovement),
    };
  });

  app.patch("/alert", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = stockBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "STOCK_ADJUST")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update stock alerts.",
      });
    }

    const parsed = updateStockAlertSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the stock alert details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    if (!contextCanAccessBranch(context, parsed.data.branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this location.",
      });
    }

    try {
      const stock = await transaction(async (client) => {
        await ensureTrackableProduct(context.business.id, parsed.data.itemId, {
          query: client.query.bind(client),
        });

        const stockRecord = await getOrCreateStockRecord({
          businessId: context.business.id,
          branchId: parsed.data.branchId,
          itemId: parsed.data.itemId,
          client: {
            query: client.query.bind(client),
          },
        });

        const updateResult = await client.query<DbStockRecord>(
          `
            update branch_item_stock
            set
              low_stock_alert_quantity = $1,
              updated_at = now()
            where id = $2
            returning *
          `,
          [parsed.data.lowStockAlertQuantity, stockRecord.id],
        );

        return updateResult.rows[0]!;
      });

      return {
        ok: true,
        stock: {
          id: stock.id,
          branchId: stock.branch_id,
          itemId: stock.item_id,
          quantityOnHand: stock.quantity_on_hand,
          quantityAvailable: stock.quantity_available,
          quantityDamaged: stock.quantity_damaged,
          lowStockAlertQuantity: stock.low_stock_alert_quantity,
        },
      };
    } catch (error) {
      return stockErrorReply(reply, error);
    }
  });

  app.post("/receive", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = stockBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "STOCK_RECEIVE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to receive stock.",
      });
    }

    const parsed = receiveStockSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the stock arrival details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    if (!contextCanAccessBranch(context, parsed.data.branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this location.",
      });
    }

    try {
      const stock = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureTrackableProduct(
          context.business.id,
          parsed.data.itemId,
          runner,
        );

        const stockRecord = await getOrCreateStockRecord({
          businessId: context.business.id,
          branchId: parsed.data.branchId,
          itemId: parsed.data.itemId,
          client: runner,
        });

        const beforeAvailable = toNumber(stockRecord.quantity_available);
        const beforeDamaged = toNumber(stockRecord.quantity_damaged);
        const beforeOnHand = toNumber(stockRecord.quantity_on_hand);

        const afterAvailable = beforeAvailable + parsed.data.quantity;
        const afterDamaged = beforeDamaged;
        const afterOnHand = beforeOnHand + parsed.data.quantity;

        const updateResult = await client.query<DbStockRecord>(
          `
            update branch_item_stock
            set
              quantity_available = $1,
              quantity_damaged = $2,
              quantity_on_hand = $3,
              updated_at = now()
            where id = $4
            returning *
          `,
          [afterAvailable, afterDamaged, afterOnHand, stockRecord.id],
        );

        const reference =
          cleanText(parsed.data.reference) ||
          (await generateStockReference({
            client: runner,
            businessId: context.business.id,
            movementType: "STOCK_RECEIVED",
          }));

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
              actor_user_id
            )
            values ($1, $2, $3, 'STOCK_RECEIVED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            context.business.id,
            parsed.data.branchId,
            parsed.data.itemId,
            parsed.data.quantity,
            beforeAvailable,
            afterAvailable,
            beforeDamaged,
            afterDamaged,
            beforeOnHand,
            afterOnHand,
            "New stock arrival",
            cleanText(parsed.data.note),
            reference,
            context.user.id,
          ],
        );

        return updateResult.rows[0]!;
      });

      return {
        ok: true,
        stock: {
          id: stock.id,
          branchId: stock.branch_id,
          itemId: stock.item_id,
          quantityOnHand: stock.quantity_on_hand,
          quantityAvailable: stock.quantity_available,
          quantityDamaged: stock.quantity_damaged,
          lowStockAlertQuantity: stock.low_stock_alert_quantity,
        },
      };
    } catch (error) {
      return stockErrorReply(reply, error);
    }
  });

  app.post("/adjust", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const blockedByBusinessType = stockBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    const parsed = adjustStockSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the stock adjustment details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const requiredPermission = getAdjustmentPermission(
      parsed.data.adjustmentType,
    );

    if (!contextHasPermission(context, requiredPermission)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to record this stock action.",
      });
    }

    if (!contextCanAccessBranch(context, parsed.data.branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this location.",
      });
    }

    try {
      const stock = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureTrackableProduct(
          context.business.id,
          parsed.data.itemId,
          runner,
        );

        const stockRecord = await getOrCreateStockRecord({
          businessId: context.business.id,
          branchId: parsed.data.branchId,
          itemId: parsed.data.itemId,
          client: runner,
        });

        const beforeAvailable = toNumber(stockRecord.quantity_available);
        const beforeDamaged = toNumber(stockRecord.quantity_damaged);
        const beforeOnHand = toNumber(stockRecord.quantity_on_hand);

        let afterAvailable = beforeAvailable;
        let afterDamaged = beforeDamaged;
        let afterOnHand = beforeOnHand;
        let quantityChange = 0;
        let reason = "Stock change";

        if (parsed.data.adjustmentType === "COUNT_CORRECTION") {
          afterAvailable = parsed.data.countedAvailableQuantity;
          afterDamaged = beforeDamaged;
          afterOnHand = afterAvailable + afterDamaged;
          quantityChange = afterAvailable - beforeAvailable;
          reason = "Count correction";

          if (quantityChange === 0) {
            throw new Error("NO_STOCK_CHANGE");
          }
        }

        if (parsed.data.adjustmentType === "DAMAGED_REPORTED") {
          ensureEnoughAvailable(stockRecord, parsed.data.quantity);

          afterAvailable = beforeAvailable - parsed.data.quantity;
          afterDamaged = beforeDamaged + parsed.data.quantity;
          afterOnHand = beforeOnHand;
          quantityChange = -parsed.data.quantity;
          reason = "Damaged stock reported";
        }

        if (parsed.data.adjustmentType === "DAMAGED_RESTORED") {
          ensureEnoughDamaged(stockRecord, parsed.data.quantity);

          afterAvailable = beforeAvailable + parsed.data.quantity;
          afterDamaged = beforeDamaged - parsed.data.quantity;
          afterOnHand = beforeOnHand;
          quantityChange = parsed.data.quantity;
          reason = "Damaged stock restored";
        }

        if (parsed.data.adjustmentType === "MISSING_REPORTED") {
          ensureEnoughAvailable(stockRecord, parsed.data.quantity);

          afterAvailable = beforeAvailable - parsed.data.quantity;
          afterDamaged = beforeDamaged;
          afterOnHand = beforeOnHand - parsed.data.quantity;
          quantityChange = -parsed.data.quantity;
          reason = "Missing stock reported";
        }

        if (parsed.data.adjustmentType === "STOLEN_REPORTED") {
          ensureEnoughAvailable(stockRecord, parsed.data.quantity);

          afterAvailable = beforeAvailable - parsed.data.quantity;
          afterDamaged = beforeDamaged;
          afterOnHand = beforeOnHand - parsed.data.quantity;
          quantityChange = -parsed.data.quantity;
          reason = "Stolen stock reported";
        }

        const updateResult = await client.query<DbStockRecord>(
          `
            update branch_item_stock
            set
              quantity_available = $1,
              quantity_damaged = $2,
              quantity_on_hand = $3,
              updated_at = now()
            where id = $4
            returning *
          `,
          [afterAvailable, afterDamaged, afterOnHand, stockRecord.id],
        );

        const reference =
          cleanText(parsed.data.reference) ||
          (await generateStockReference({
            client: runner,
            businessId: context.business.id,
            movementType: parsed.data.adjustmentType,
          }));

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
              actor_user_id
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `,
          [
            context.business.id,
            parsed.data.branchId,
            parsed.data.itemId,
            parsed.data.adjustmentType,
            quantityChange,
            beforeAvailable,
            afterAvailable,
            beforeDamaged,
            afterDamaged,
            beforeOnHand,
            afterOnHand,
            reason,
            cleanText(parsed.data.note),
            reference,
            context.user.id,
          ],
        );

        return updateResult.rows[0]!;
      });

      return {
        ok: true,
        stock: {
          id: stock.id,
          branchId: stock.branch_id,
          itemId: stock.item_id,
          quantityOnHand: stock.quantity_on_hand,
          quantityAvailable: stock.quantity_available,
          quantityDamaged: stock.quantity_damaged,
          lowStockAlertQuantity: stock.low_stock_alert_quantity,
        },
      };
    } catch (error) {
      return stockErrorReply(reply, error);
    }
  });
}
