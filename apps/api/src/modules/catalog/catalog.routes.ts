import type { FastifyInstance } from "fastify";
import {
  createItemCategorySchema,
  createProductSchema,
  createServiceSchema,
  listCatalogItemsQuerySchema,
  updateItemCategorySchema,
  updateProductSchema,
  updateServiceSchema,
} from "@rurix/schemas";
import { query, transaction, type DbRow } from "@rurix/db";
import { generateBusinessNumber } from "../../lib/business-numbering";
import {
  contextCanAccessBranch,
  contextHasPermission,
  requireAuth,
} from "../auth/auth.context";

type BusinessType = "product" | "service" | "product_and_service";

type DbCategory = DbRow & {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type DbCatalogItem = DbRow & {
  id: string;
  business_id: string;
  category_id: string | null;
  item_kind: "PRODUCT" | "SERVICE";
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  selling_price_cents: number;
  cost_price_cents: number | null;
  track_stock: boolean;
  service_duration_minutes: number | null;
  service_cost_estimate_cents: number | null;
  status: string;
  created_at: Date;
  updated_at: Date;
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

function businessSellsProducts(businessType: BusinessType) {
  return businessType === "product" || businessType === "product_and_service";
}

function businessSellsServices(businessType: BusinessType) {
  return businessType === "service" || businessType === "product_and_service";
}

function mapCategory(row: DbCategory) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCatalogItem(
  row: DbCatalogItem & { category_name?: string | null },
) {
  return {
    id: row.id,
    kind: row.item_kind,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    sku: row.sku,
    barcode: row.barcode,
    sellingPriceCents: toNumber(row.selling_price_cents),
    costPriceCents:
      row.cost_price_cents === null ? null : toNumber(row.cost_price_cents),
    trackStock: row.track_stock,
    serviceDurationMinutes: row.service_duration_minutes,
    serviceCostEstimateCents:
      row.service_cost_estimate_cents === null
        ? null
        : toNumber(row.service_cost_estimate_cents),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureCategoryBelongsToBusiness(
  businessId: string,
  categoryId: string | undefined,
) {
  if (!categoryId) {
    return;
  }

  const result = await query<{ id: string }>(
    `
      select id
      from item_categories
      where id = $1
        and business_id = $2
      limit 1
    `,
    [categoryId, businessId],
  );

  if (!result.rows[0]) {
    throw new Error("CATEGORY_NOT_FOUND");
  }
}

async function ensureBranchBelongsToBusiness(
  businessId: string,
  branchId: string,
) {
  const result = await query<{ id: string }>(
    `
      select id
      from branches
      where id = $1
        and business_id = $2
        and status = 'active'
      limit 1
    `,
    [branchId, businessId],
  );

  return Boolean(result.rows[0]);
}

function isUniqueConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/categories", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view catalog categories.",
      });
    }

    const result = await query<DbCategory>(
      `
        select id, business_id, name, description, status, created_at, updated_at
        from item_categories
        where business_id = $1
        order by name asc
      `,
      [context.business.id],
    );

    return {
      ok: true,
      categories: result.rows.map(mapCategory),
    };
  });

  app.post("/categories", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create categories.",
      });
    }

    const parsed = createItemCategorySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the category details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const result = await query<DbCategory>(
        `
          insert into item_categories (
            business_id,
            name,
            description,
            created_by_user_id
          )
          values ($1, $2, $3, $4)
          returning id, business_id, name, description, status, created_at, updated_at
        `,
        [
          context.business.id,
          parsed.data.name,
          cleanText(parsed.data.description),
          context.user.id,
        ],
      );

      return {
        ok: true,
        category: mapCategory(result.rows[0]!),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A category with this name already exists.",
        });
      }

      throw error;
    }
  });

  app.patch("/categories/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update categories.",
      });
    }

    const params = request.params as { id: string };
    const parsed = updateItemCategorySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the category details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const result = await query<DbCategory>(
        `
          update item_categories
          set
            name = $1,
            description = $2,
            status = $3,
            updated_at = now()
          where id = $4
            and business_id = $5
          returning id, business_id, name, description, status, created_at, updated_at
        `,
        [
          parsed.data.name,
          cleanText(parsed.data.description),
          parsed.data.status,
          params.id,
          context.business.id,
        ],
      );

      const category = result.rows[0];

      if (!category) {
        return reply.status(404).send({
          ok: false,
          message: "Category not found.",
        });
      }

      return {
        ok: true,
        category: mapCategory(category),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A category with this name already exists.",
        });
      }

      throw error;
    }
  });

  app.get("/items", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view catalog items.",
      });
    }

    const parsed = listCatalogItemsQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the filters and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const businessType = getBusinessType(context.business.business_type);
    const values: unknown[] = [context.business.id];
    const where: string[] = ["ci.business_id = $1"];

    if (businessType === "product") {
      where.push("ci.item_kind = 'PRODUCT'");
    }

    if (businessType === "service") {
      where.push("ci.item_kind = 'SERVICE'");
    }

    if (parsed.data.kind) {
      if (
        parsed.data.kind === "PRODUCT" &&
        !businessSellsProducts(businessType)
      ) {
        return {
          ok: true,
          items: [],
        };
      }

      if (
        parsed.data.kind === "SERVICE" &&
        !businessSellsServices(businessType)
      ) {
        return {
          ok: true,
          items: [],
        };
      }

      values.push(parsed.data.kind);
      where.push(`ci.item_kind = $${values.length}`);
    }

    if (parsed.data.status) {
      values.push(parsed.data.status);
      where.push(`ci.status = $${values.length}`);
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

    const result = await query<
      DbCatalogItem & { category_name: string | null }
    >(
      `
        select
          ci.id,
          ci.business_id,
          ci.category_id,
          ci.item_kind,
          ci.name,
          ci.description,
          ci.sku,
          ci.barcode,
          ci.selling_price_cents,
          ci.cost_price_cents,
          ci.track_stock,
          ci.service_duration_minutes,
          ci.service_cost_estimate_cents,
          ci.status,
          ci.created_at,
          ci.updated_at,
          ic.name as category_name
        from catalog_items ci
        left join item_categories ic on ic.id = ci.category_id
        where ${where.join(" and ")}
        order by ci.created_at desc
      `,
      values,
    );

    return {
      ok: true,
      items: result.rows.map(mapCatalogItem),
    };
  });

  app.post("/products", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const businessType = getBusinessType(context.business.business_type);

    if (!businessSellsProducts(businessType)) {
      return reply.status(400).send({
        ok: false,
        message: "This business is set up for services only.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create products.",
      });
    }

    const parsed = createProductSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the product details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    if (
      !parsed.data.trackStock &&
      parsed.data.startingStock?.some((item) => item.quantity > 0)
    ) {
      return reply.status(400).send({
        ok: false,
        message: "Turn on stock tracking before adding starting stock.",
      });
    }

    if (
      parsed.data.startingStock?.some((item) => item.quantity > 0) &&
      !contextHasPermission(context, "STOCK_RECEIVE")
    ) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to add starting stock.",
      });
    }

    await ensureCategoryBelongsToBusiness(
      context.business.id,
      parsed.data.categoryId,
    );

    const startingStock = parsed.data.startingStock || [];

    for (const stockLine of startingStock) {
      if (!contextCanAccessBranch(context, stockLine.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to one of the selected locations.",
        });
      }

      const branchExists = await ensureBranchBelongsToBusiness(
        context.business.id,
        stockLine.branchId,
      );

      if (!branchExists) {
        return reply.status(404).send({
          ok: false,
          message: "One selected location was not found.",
        });
      }
    }

    try {
      const item = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        const productCode =
          cleanText(parsed.data.sku) ||
          (await generateBusinessNumber({
            runner,
            businessId: context.business.id,
            prefix: "PRD",
            counterName: "product",
          }));

        const itemResult = await client.query<DbCatalogItem>(
          `
            insert into catalog_items (
              business_id,
              category_id,
              item_kind,
              name,
              description,
              sku,
              barcode,
              selling_price_cents,
              cost_price_cents,
              track_stock,
              created_by_user_id,
              updated_by_user_id
            )
            values ($1, $2, 'PRODUCT', $3, $4, $5, $6, $7, $8, $9, $10, $10)
            returning
              id,
              business_id,
              category_id,
              item_kind,
              name,
              description,
              sku,
              barcode,
              selling_price_cents,
              cost_price_cents,
              track_stock,
              service_duration_minutes,
              service_cost_estimate_cents,
              status,
              created_at,
              updated_at
          `,
          [
            context.business.id,
            parsed.data.categoryId || null,
            parsed.data.name,
            cleanText(parsed.data.description),
            productCode,
            cleanText(parsed.data.barcode),
            parsed.data.sellingPriceCents,
            parsed.data.costPriceCents ?? null,
            parsed.data.trackStock,
            context.user.id,
          ],
        );

        const createdItem = itemResult.rows[0]!;

        await client.query(
          `
            insert into catalog_price_events (
              business_id,
              item_id,
              old_selling_price_cents,
              new_selling_price_cents,
              old_cost_price_cents,
              new_cost_price_cents,
              reason,
              actor_user_id
            )
            values ($1, $2, null, $3, null, $4, $5, $6)
          `,
          [
            context.business.id,
            createdItem.id,
            parsed.data.sellingPriceCents,
            parsed.data.costPriceCents ?? null,
            cleanText(parsed.data.note) || "Product created",
            context.user.id,
          ],
        );

        if (parsed.data.trackStock) {
          for (const stockLine of startingStock) {
            await client.query(
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
                values ($1, $2, $3, $4, $4, 0, $5)
                on conflict (business_id, branch_id, item_id)
                do nothing
              `,
              [
                context.business.id,
                stockLine.branchId,
                createdItem.id,
                stockLine.quantity,
                parsed.data.lowStockAlertQuantity ?? 0,
              ],
            );

            if (stockLine.quantity > 0) {
              const startingStockReference = await generateBusinessNumber({
                runner,
                businessId: context.business.id,
                prefix: "STK",
                counterName: "starting-stock",
              });

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
                  values ($1, $2, $3, 'INITIAL_STOCK', $4, 0, $4, 0, 0, 0, $4, $5, $6, $7, $8)
                `,
                [
                  context.business.id,
                  stockLine.branchId,
                  createdItem.id,
                  stockLine.quantity,
                  "Starting stock",
                  cleanText(parsed.data.note),
                  startingStockReference,
                  context.user.id,
                ],
              );
            }
          }
        }

        return createdItem;
      });

      return {
        ok: true,
        item: mapCatalogItem(item),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A product with this code or barcode already exists.",
        });
      }

      if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Category not found.",
        });
      }

      throw error;
    }
  });

  app.post("/services", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const businessType = getBusinessType(context.business.business_type);

    if (!businessSellsServices(businessType)) {
      return reply.status(400).send({
        ok: false,
        message: "This business is set up for products only.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create services.",
      });
    }

    const parsed = createServiceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the service details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    await ensureCategoryBelongsToBusiness(
      context.business.id,
      parsed.data.categoryId,
    );

    try {
      const item = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        const serviceCode =
          cleanText(parsed.data.serviceCode) ||
          (await generateBusinessNumber({
            runner,
            businessId: context.business.id,
            prefix: "SRV",
            counterName: "service",
          }));

        const itemResult = await client.query<DbCatalogItem>(
          `
            insert into catalog_items (
              business_id,
              category_id,
              item_kind,
              name,
              description,
              sku,
              selling_price_cents,
              service_cost_estimate_cents,
              service_duration_minutes,
              track_stock,
              created_by_user_id,
              updated_by_user_id
            )
            values ($1, $2, 'SERVICE', $3, $4, $5, $6, $7, $8, false, $9, $9)
            returning
              id,
              business_id,
              category_id,
              item_kind,
              name,
              description,
              sku,
              barcode,
              selling_price_cents,
              cost_price_cents,
              track_stock,
              service_duration_minutes,
              service_cost_estimate_cents,
              status,
              created_at,
              updated_at
          `,
          [
            context.business.id,
            parsed.data.categoryId || null,
            parsed.data.name,
            cleanText(parsed.data.description),
            serviceCode,
            parsed.data.sellingPriceCents,
            parsed.data.costEstimateCents ?? null,
            parsed.data.durationMinutes ?? null,
            context.user.id,
          ],
        );

        const createdItem = itemResult.rows[0]!;

        await client.query(
          `
            insert into catalog_price_events (
              business_id,
              item_id,
              old_selling_price_cents,
              new_selling_price_cents,
              old_cost_price_cents,
              new_cost_price_cents,
              reason,
              actor_user_id
            )
            values ($1, $2, null, $3, null, $4, $5, $6)
          `,
          [
            context.business.id,
            createdItem.id,
            parsed.data.sellingPriceCents,
            parsed.data.costEstimateCents ?? null,
            cleanText(parsed.data.note) || "Service created",
            context.user.id,
          ],
        );

        return createdItem;
      });

      return {
        ok: true,
        item: mapCatalogItem(item),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A service with this code already exists.",
        });
      }

      if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Category not found.",
        });
      }

      throw error;
    }
  });

  app.patch("/products/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const businessType = getBusinessType(context.business.business_type);

    if (!businessSellsProducts(businessType)) {
      return reply.status(400).send({
        ok: false,
        message: "This business is set up for services only.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update products.",
      });
    }

    const params = request.params as { id: string };
    const parsed = updateProductSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the product details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    await ensureCategoryBelongsToBusiness(
      context.business.id,
      parsed.data.categoryId,
    );

    try {
      const item = await transaction(async (client) => {
        const existingResult = await client.query<DbCatalogItem>(
          `
            select *
            from catalog_items
            where id = $1
              and business_id = $2
              and item_kind = 'PRODUCT'
            limit 1
          `,
          [params.id, context.business.id],
        );

        const existing = existingResult.rows[0];

        if (!existing) {
          throw new Error("PRODUCT_NOT_FOUND");
        }

        const runner = {
          query: client.query.bind(client),
        };

        const productCode =
          cleanText(parsed.data.sku) ||
          existing.sku ||
          (await generateBusinessNumber({
            runner,
            businessId: context.business.id,
            prefix: "PRD",
            counterName: "product",
          }));

        const priceChanged =
          toNumber(existing.selling_price_cents) !==
            parsed.data.sellingPriceCents ||
          (existing.cost_price_cents === null
            ? null
            : toNumber(existing.cost_price_cents)) !==
            (parsed.data.costPriceCents ?? null);

        if (
          priceChanged &&
          !contextHasPermission(context, "CATALOG_PRICE_UPDATE")
        ) {
          throw new Error("PRICE_PERMISSION_DENIED");
        }

        if (!parsed.data.trackStock && existing.track_stock) {
          const stockResult = await client.query<{ total_stock: string }>(
            `
              select coalesce(sum(quantity_on_hand), 0)::text as total_stock
              from branch_item_stock
              where business_id = $1
                and item_id = $2
            `,
            [context.business.id, params.id],
          );

          if (Number(stockResult.rows[0]?.total_stock || 0) > 0) {
            throw new Error("CANNOT_DISABLE_STOCK_TRACKING");
          }
        }

        const updateResult = await client.query<DbCatalogItem>(
          `
            update catalog_items
            set
              category_id = $1,
              name = $2,
              description = $3,
              sku = $4,
              barcode = $5,
              selling_price_cents = $6,
              cost_price_cents = $7,
              track_stock = $8,
              status = $9,
              updated_by_user_id = $10,
              updated_at = now()
            where id = $11
              and business_id = $12
              and item_kind = 'PRODUCT'
            returning *
          `,
          [
            parsed.data.categoryId || null,
            parsed.data.name,
            cleanText(parsed.data.description),
            productCode,
            cleanText(parsed.data.barcode),
            parsed.data.sellingPriceCents,
            parsed.data.costPriceCents ?? null,
            parsed.data.trackStock,
            parsed.data.status,
            context.user.id,
            params.id,
            context.business.id,
          ],
        );

        if (parsed.data.lowStockAlertQuantity !== undefined) {
          await client.query(
            `
              update branch_item_stock
              set
                low_stock_alert_quantity = $1,
                updated_at = now()
              where business_id = $2
                and item_id = $3
            `,
            [parsed.data.lowStockAlertQuantity, context.business.id, params.id],
          );
        }

        const updated = updateResult.rows[0]!;

        if (priceChanged) {
          await client.query(
            `
              insert into catalog_price_events (
                business_id,
                item_id,
                old_selling_price_cents,
                new_selling_price_cents,
                old_cost_price_cents,
                new_cost_price_cents,
                reason,
                actor_user_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              context.business.id,
              updated.id,
              existing.selling_price_cents,
              parsed.data.sellingPriceCents,
              existing.cost_price_cents,
              parsed.data.costPriceCents ?? null,
              cleanText(parsed.data.priceChangeReason) || "Price updated",
              context.user.id,
            ],
          );
        }

        return updated;
      });

      return {
        ok: true,
        item: mapCatalogItem(item),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A product with this code or barcode already exists.",
        });
      }

      if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Category not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "PRICE_PERMISSION_DENIED"
      ) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to change prices.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "CANNOT_DISABLE_STOCK_TRACKING"
      ) {
        return reply.status(400).send({
          ok: false,
          message:
            "This product still has stock. Clear the stock before turning off stock tracking.",
        });
      }

      throw error;
    }
  });

  app.patch("/services/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const businessType = getBusinessType(context.business.business_type);

    if (!businessSellsServices(businessType)) {
      return reply.status(400).send({
        ok: false,
        message: "This business is set up for products only.",
      });
    }

    if (!contextHasPermission(context, "CATALOG_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update services.",
      });
    }

    const params = request.params as { id: string };
    const parsed = updateServiceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the service details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    await ensureCategoryBelongsToBusiness(
      context.business.id,
      parsed.data.categoryId,
    );

    try {
      const item = await transaction(async (client) => {
        const existingResult = await client.query<DbCatalogItem>(
          `
            select *
            from catalog_items
            where id = $1
              and business_id = $2
              and item_kind = 'SERVICE'
            limit 1
          `,
          [params.id, context.business.id],
        );

        const existing = existingResult.rows[0];

        if (!existing) {
          throw new Error("SERVICE_NOT_FOUND");
        }

        const runner = {
          query: client.query.bind(client),
        };

        const serviceCode =
          cleanText(parsed.data.serviceCode) ||
          existing.sku ||
          (await generateBusinessNumber({
            runner,
            businessId: context.business.id,
            prefix: "SRV",
            counterName: "service",
          }));

        const priceChanged =
          toNumber(existing.selling_price_cents) !==
            parsed.data.sellingPriceCents ||
          (existing.service_cost_estimate_cents === null
            ? null
            : toNumber(existing.service_cost_estimate_cents)) !==
            (parsed.data.costEstimateCents ?? null);

        if (
          priceChanged &&
          !contextHasPermission(context, "CATALOG_PRICE_UPDATE")
        ) {
          throw new Error("PRICE_PERMISSION_DENIED");
        }

        const updateResult = await client.query<DbCatalogItem>(
          `
            update catalog_items
            set
              category_id = $1,
              name = $2,
              description = $3,
              sku = $4,
              selling_price_cents = $5,
              service_cost_estimate_cents = $6,
              service_duration_minutes = $7,
              track_stock = false,
              status = $8,
              updated_by_user_id = $9,
              updated_at = now()
            where id = $10
              and business_id = $11
              and item_kind = 'SERVICE'
            returning *
          `,
          [
            parsed.data.categoryId || null,
            parsed.data.name,
            cleanText(parsed.data.description),
            serviceCode,
            parsed.data.sellingPriceCents,
            parsed.data.costEstimateCents ?? null,
            parsed.data.durationMinutes ?? null,
            parsed.data.status,
            context.user.id,
            params.id,
            context.business.id,
          ],
        );

        const updated = updateResult.rows[0]!;

        if (priceChanged) {
          await client.query(
            `
              insert into catalog_price_events (
                business_id,
                item_id,
                old_selling_price_cents,
                new_selling_price_cents,
                old_cost_price_cents,
                new_cost_price_cents,
                reason,
                actor_user_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              context.business.id,
              updated.id,
              existing.selling_price_cents,
              parsed.data.sellingPriceCents,
              existing.service_cost_estimate_cents,
              parsed.data.costEstimateCents ?? null,
              cleanText(parsed.data.priceChangeReason) || "Price updated",
              context.user.id,
            ],
          );
        }

        return updated;
      });

      return {
        ok: true,
        item: mapCatalogItem(item),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A service with this code already exists.",
        });
      }

      if (error instanceof Error && error.message === "SERVICE_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Service not found.",
        });
      }

      if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Category not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "PRICE_PERMISSION_DENIED"
      ) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to change prices.",
        });
      }

      throw error;
    }
  });
}
