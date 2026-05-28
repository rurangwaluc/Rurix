import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createStockTransferSchema,
  listStockTransfersQuerySchema,
} from "@rurix/schemas";
import { query, transaction, type DbRow } from "@rurix/db";
import { generateBusinessNumber } from "../../lib/business-numbering";
import {
  contextCanAccessBranch,
  contextHasPermission,
  getContextBranchIds,
  requireAuth,
} from "../auth/auth.context";

type BusinessType = "product" | "service" | "product_and_service";

type DbCatalogItem = DbRow & {
  id: string;
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

type DbStockTransfer = DbRow & {
  id: string;
  business_id: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  from_branch_id: string;
  from_branch_name: string;
  to_branch_id: string;
  to_branch_name: string;
  quantity: number;
  reference: string;
  reason: string | null;
  note: string | null;
  status: "completed" | "cancelled";
  created_by_name: string | null;
  created_at: Date;
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

function branchFilterSql(branchIds: string[], startIndex: number) {
  const placeholders = branchIds.map((_, index) => `$${startIndex + index}`);

  return {
    sql: placeholders.length > 0 ? `(${placeholders.join(", ")})` : "(null)",
  };
}

function mapTransfer(row: DbStockTransfer) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemSku: row.item_sku,
    fromBranchId: row.from_branch_id,
    fromBranchName: row.from_branch_name,
    toBranchId: row.to_branch_id,
    toBranchName: row.to_branch_name,
    quantity: toNumber(row.quantity),
    reference: row.reference,
    reason: row.reason,
    note: row.note,
    status: row.status,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

async function ensureTrackableProduct(input: {
  businessId: string;
  itemId: string;
  client: {
    query: typeof query;
  };
}) {
  const itemResult = await input.client.query<DbCatalogItem>(
    `
      select id, item_kind, track_stock, status
      from catalog_items
      where id = $1
        and business_id = $2
      limit 1
    `,
    [input.itemId, input.businessId],
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

  const inserted = insertedResult.rows[0];

  if (!inserted) {
    throw new Error("STOCK_RECORD_NOT_CREATED");
  }

  return inserted;
}

function transferErrorReply(reply: FastifyReply, error: unknown) {
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
      message: "There is not enough available stock in the source location.",
    });
  }

  throw error;
}

export async function stockTransfersRoutes(app: FastifyInstance) {
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

    if (!contextHasPermission(context, "STOCK_TRANSFER_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view stock transfers.",
      });
    }

    const parsed = listStockTransfersQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the transfer filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const values: unknown[] = [context.business.id];
    const where: string[] = ["st.business_id = $1"];

    if (parsed.data.branchId) {
      if (!contextCanAccessBranch(context, parsed.data.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this location.",
        });
      }

      values.push(parsed.data.branchId);
      where.push(
        `(st.from_branch_id = $${values.length} or st.to_branch_id = $${values.length})`,
      );
    } else {
      const branchIds = getContextBranchIds(context);

      if (branchIds.length === 0) {
        return {
          ok: true,
          transfers: [],
        };
      }

      const branchFilter = branchFilterSql(branchIds, values.length + 1);
      values.push(...branchIds);
      where.push(`
        (
          st.from_branch_id in ${branchFilter.sql}
          or st.to_branch_id in ${branchFilter.sql}
        )
      `);
    }

    if (parsed.data.itemId) {
      values.push(parsed.data.itemId);
      where.push(`st.item_id = $${values.length}`);
    }

    if (parsed.data.search) {
      values.push(`%${parsed.data.search}%`);
      where.push(`
        (
          ci.name ilike $${values.length}
          or ci.sku ilike $${values.length}
          or st.reference ilike $${values.length}
        )
      `);
    }

    const result = await query<DbStockTransfer>(
      `
        select
          st.id,
          st.business_id,
          st.item_id,
          ci.name as item_name,
          ci.sku as item_sku,
          st.from_branch_id,
          from_branch.name as from_branch_name,
          st.to_branch_id,
          to_branch.name as to_branch_name,
          st.quantity,
          st.reference,
          st.reason,
          st.note,
          st.status,
          u.full_name as created_by_name,
          st.created_at
        from stock_transfers st
        inner join catalog_items ci on ci.id = st.item_id
        inner join branches from_branch on from_branch.id = st.from_branch_id
        inner join branches to_branch on to_branch.id = st.to_branch_id
        left join users u on u.id = st.created_by_user_id
        where ${where.join(" and ")}
        order by st.created_at desc
        limit 200
      `,
      values,
    );

    return {
      ok: true,
      transfers: result.rows.map(mapTransfer),
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

    const blockedByBusinessType = inventoryBusinessGuard(
      reply,
      context.business.business_type,
    );

    if (blockedByBusinessType) {
      return blockedByBusinessType;
    }

    if (!contextHasPermission(context, "STOCK_TRANSFER_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to transfer stock.",
      });
    }

    const parsed = createStockTransferSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the stock transfer details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    if (!contextCanAccessBranch(context, parsed.data.fromBranchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to the source location.",
      });
    }

    if (!contextCanAccessBranch(context, parsed.data.toBranchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to the destination location.",
      });
    }

    try {
      const transfer = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureTrackableProduct({
          businessId: context.business.id,
          itemId: parsed.data.itemId,
          client: runner,
        });

        const fromStock = await getOrCreateStockRecord({
          businessId: context.business.id,
          branchId: parsed.data.fromBranchId,
          itemId: parsed.data.itemId,
          client: runner,
        });

        const toStock = await getOrCreateStockRecord({
          businessId: context.business.id,
          branchId: parsed.data.toBranchId,
          itemId: parsed.data.itemId,
          client: runner,
        });

        const quantity = parsed.data.quantity;

        const fromBeforeAvailable = toNumber(fromStock.quantity_available);
        const fromBeforeDamaged = toNumber(fromStock.quantity_damaged);
        const fromBeforeOnHand = toNumber(fromStock.quantity_on_hand);

        if (fromBeforeAvailable < quantity) {
          throw new Error("NOT_ENOUGH_AVAILABLE_STOCK");
        }

        const toBeforeAvailable = toNumber(toStock.quantity_available);
        const toBeforeDamaged = toNumber(toStock.quantity_damaged);
        const toBeforeOnHand = toNumber(toStock.quantity_on_hand);

        const fromAfterAvailable = fromBeforeAvailable - quantity;
        const fromAfterDamaged = fromBeforeDamaged;
        const fromAfterOnHand = fromBeforeOnHand - quantity;

        const toAfterAvailable = toBeforeAvailable + quantity;
        const toAfterDamaged = toBeforeDamaged;
        const toAfterOnHand = toBeforeOnHand + quantity;

        const reference =
          cleanText(parsed.data.reference) ||
          (await generateBusinessNumber({
            runner,
            businessId: context.business.id,
            prefix: "TRF",
            counterName: "stock-transfer",
          }));

        const transferResult = await client.query<{ id: string } & DbRow>(
          `
            insert into stock_transfers (
              business_id,
              item_id,
              from_branch_id,
              to_branch_id,
              quantity,
              reference,
              reason,
              note,
              status,
              created_by_user_id
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9)
            returning id
          `,
          [
            context.business.id,
            parsed.data.itemId,
            parsed.data.fromBranchId,
            parsed.data.toBranchId,
            quantity,
            reference,
            cleanText(parsed.data.reason),
            cleanText(parsed.data.note),
            context.user.id,
          ],
        );

        const createdTransfer = transferResult.rows[0];

        if (!createdTransfer) {
          throw new Error("STOCK_TRANSFER_NOT_CREATED");
        }

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
          [fromAfterAvailable, fromAfterDamaged, fromAfterOnHand, fromStock.id],
        );

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
          [toAfterAvailable, toAfterDamaged, toAfterOnHand, toStock.id],
        );

        const reason = cleanText(parsed.data.reason) || "Stock transferred";

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
              stock_transfer_id
            )
            values ($1, $2, $3, 'STOCK_TRANSFER_OUT', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `,
          [
            context.business.id,
            parsed.data.fromBranchId,
            parsed.data.itemId,
            -quantity,
            fromBeforeAvailable,
            fromAfterAvailable,
            fromBeforeDamaged,
            fromAfterDamaged,
            fromBeforeOnHand,
            fromAfterOnHand,
            reason,
            cleanText(parsed.data.note),
            reference,
            context.user.id,
            createdTransfer.id,
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
              stock_transfer_id
            )
            values ($1, $2, $3, 'STOCK_TRANSFER_IN', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `,
          [
            context.business.id,
            parsed.data.toBranchId,
            parsed.data.itemId,
            quantity,
            toBeforeAvailable,
            toAfterAvailable,
            toBeforeDamaged,
            toAfterDamaged,
            toBeforeOnHand,
            toAfterOnHand,
            reason,
            cleanText(parsed.data.note),
            reference,
            context.user.id,
            createdTransfer.id,
          ],
        );

        const fullTransferResult = await client.query<DbStockTransfer>(
          `
            select
              st.id,
              st.business_id,
              st.item_id,
              ci.name as item_name,
              ci.sku as item_sku,
              st.from_branch_id,
              from_branch.name as from_branch_name,
              st.to_branch_id,
              to_branch.name as to_branch_name,
              st.quantity,
              st.reference,
              st.reason,
              st.note,
              st.status,
              u.full_name as created_by_name,
              st.created_at
            from stock_transfers st
            inner join catalog_items ci on ci.id = st.item_id
            inner join branches from_branch on from_branch.id = st.from_branch_id
            inner join branches to_branch on to_branch.id = st.to_branch_id
            left join users u on u.id = st.created_by_user_id
            where st.id = $1
              and st.business_id = $2
            limit 1
          `,
          [createdTransfer.id, context.business.id],
        );

        const fullTransfer = fullTransferResult.rows[0];

        if (!fullTransfer) {
          throw new Error("STOCK_TRANSFER_NOT_FOUND_AFTER_CREATE");
        }

        return fullTransfer;
      });

      return reply.status(201).send({
        ok: true,
        transfer: mapTransfer(transfer),
      });
    } catch (error) {
      return transferErrorReply(reply, error);
    }
  });
}
