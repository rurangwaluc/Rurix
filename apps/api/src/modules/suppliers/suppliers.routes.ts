import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from "@rurix/schemas";
import { query, type DbRow } from "@rurix/db";
import { contextHasPermission, requireAuth } from "../auth/auth.context";

type BusinessType = "product" | "service" | "product_and_service";

type DbSupplier = DbRow & {
  id: string;
  business_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: Date;
  updated_at: Date;
};

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
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

function mapSupplier(row: DbSupplier) {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function supplierErrorReply(reply: FastifyReply, error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    return reply.status(409).send({
      ok: false,
      message: "A supplier with this name already exists.",
    });
  }

  throw error;
}

export async function suppliersRoutes(app: FastifyInstance) {
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

    if (!contextHasPermission(context, "SUPPLIER_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view suppliers.",
      });
    }

    const parsed = listSuppliersQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the supplier filters and try again.",
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
          or contact_person ilike $${values.length}
          or phone ilike $${values.length}
          or email ilike $${values.length}
        )
      `);
    }

    const result = await query<DbSupplier>(
      `
        select
          id,
          business_id,
          name,
          contact_person,
          phone,
          email,
          address,
          notes,
          status,
          created_at,
          updated_at
        from suppliers
        where ${where.join(" and ")}
        order by
          case when status = 'active' then 0 else 1 end,
          name asc
      `,
      values,
    );

    return {
      ok: true,
      suppliers: result.rows.map(mapSupplier),
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

    if (!contextHasPermission(context, "SUPPLIER_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view suppliers.",
      });
    }

    const params = request.params as { id: string };

    const result = await query<DbSupplier>(
      `
        select
          id,
          business_id,
          name,
          contact_person,
          phone,
          email,
          address,
          notes,
          status,
          created_at,
          updated_at
        from suppliers
        where id = $1
          and business_id = $2
        limit 1
      `,
      [params.id, context.business.id],
    );

    const supplier = result.rows[0];

    if (!supplier) {
      return reply.status(404).send({
        ok: false,
        message: "Supplier not found.",
      });
    }

    return {
      ok: true,
      supplier: mapSupplier(supplier),
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

    if (!contextHasPermission(context, "SUPPLIER_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create suppliers.",
      });
    }

    const parsed = createSupplierSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the supplier details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const result = await query<DbSupplier>(
        `
          insert into suppliers (
            business_id,
            name,
            contact_person,
            phone,
            email,
            address,
            notes,
            status,
            created_by_user_id,
            updated_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $8)
          returning
            id,
            business_id,
            name,
            contact_person,
            phone,
            email,
            address,
            notes,
            status,
            created_at,
            updated_at
        `,
        [
          context.business.id,
          parsed.data.name,
          cleanText(parsed.data.contactPerson),
          cleanText(parsed.data.phone),
          cleanText(parsed.data.email),
          cleanText(parsed.data.address),
          cleanText(parsed.data.notes),
          context.user.id,
        ],
      );

      const supplier = result.rows[0];

      if (!supplier) {
        throw new Error("Created supplier was not returned by the database.");
      }

      return reply.status(201).send({
        ok: true,
        supplier: mapSupplier(supplier),
      });
    } catch (error) {
      return supplierErrorReply(reply, error);
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

    if (!contextHasPermission(context, "SUPPLIER_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update suppliers.",
      });
    }

    const parsed = updateSupplierSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the supplier details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    const params = request.params as { id: string };

    try {
      const result = await query<DbSupplier>(
        `
          update suppliers
          set
            name = $1,
            contact_person = $2,
            phone = $3,
            email = $4,
            address = $5,
            notes = $6,
            status = $7,
            updated_by_user_id = $8,
            updated_at = now()
          where id = $9
            and business_id = $10
          returning
            id,
            business_id,
            name,
            contact_person,
            phone,
            email,
            address,
            notes,
            status,
            created_at,
            updated_at
        `,
        [
          parsed.data.name,
          cleanText(parsed.data.contactPerson),
          cleanText(parsed.data.phone),
          cleanText(parsed.data.email),
          cleanText(parsed.data.address),
          cleanText(parsed.data.notes),
          parsed.data.status,
          context.user.id,
          params.id,
          context.business.id,
        ],
      );

      const supplier = result.rows[0];

      if (!supplier) {
        return reply.status(404).send({
          ok: false,
          message: "Supplier not found.",
        });
      }

      return {
        ok: true,
        supplier: mapSupplier(supplier),
      };
    } catch (error) {
      return supplierErrorReply(reply, error);
    }
  });
}
