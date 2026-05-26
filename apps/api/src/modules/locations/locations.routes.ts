import type { FastifyInstance } from "fastify";
import { createLocationSchema, updateLocationSchema } from "@rurix/schemas";
import { query, transaction, type DbRow } from "@rurix/db";
import { generateBusinessNumber } from "../../lib/business-numbering";
import { contextHasPermission, requireAuth } from "../auth/auth.context";

type DbLocation = DbRow & {
  id: string;
  business_id: string;
  name: string;
  code: string | null;
  address: string | null;
  is_main: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function mapLocation(row: DbLocation) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    isMain: row.is_main,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function locationsRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "BRANCH_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view locations.",
      });
    }

    const result = await query<DbLocation>(
      `
        select
          id,
          business_id,
          name,
          code,
          address,
          is_main,
          status,
          created_at,
          updated_at
        from branches
        where business_id = $1
        order by is_main desc, name asc
      `,
      [context.business.id],
    );

    return {
      ok: true,
      locations: result.rows.map(mapLocation),
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

    if (!contextHasPermission(context, "BRANCH_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to create locations.",
      });
    }

    const parsed = createLocationSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the location details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const location = await transaction(async (client) => {
        const locationCode =
          cleanText(parsed.data.code) ||
          (await generateBusinessNumber({
            runner: client,
            businessId: context.business.id,
            prefix: "LOC",
            counterName: "location",
          }));

        if (parsed.data.isMain) {
          await client.query(
            `
              update branches
              set
                is_main = false,
                updated_at = now()
              where business_id = $1
            `,
            [context.business.id],
          );
        }

        const result = await client.query<DbLocation>(
          `
            insert into branches (
              business_id,
              name,
              code,
              address,
              is_main
            )
            values ($1, $2, $3, $4, $5)
            returning
              id,
              business_id,
              name,
              code,
              address,
              is_main,
              status,
              created_at,
              updated_at
          `,
          [
            context.business.id,
            parsed.data.name,
            locationCode,
            cleanText(parsed.data.address),
            parsed.data.isMain ?? false,
          ],
        );

        return result.rows[0]!;
      });

      return {
        ok: true,
        location: mapLocation(location),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A location with this code already exists.",
        });
      }

      throw error;
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

    if (!contextHasPermission(context, "BRANCH_UPDATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to update locations.",
      });
    }

    const params = request.params as { id: string };
    const parsed = updateLocationSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: "Check the location details and try again.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const location = await transaction(async (client) => {
        const existingResult = await client.query<DbLocation>(
          `
            select
              id,
              business_id,
              name,
              code,
              address,
              is_main,
              status,
              created_at,
              updated_at
            from branches
            where id = $1
              and business_id = $2
            limit 1
          `,
          [params.id, context.business.id],
        );

        const existing = existingResult.rows[0];

        if (!existing) {
          throw new Error("LOCATION_NOT_FOUND");
        }

        if (existing.is_main && parsed.data.status !== "active") {
          throw new Error("MAIN_LOCATION_CANNOT_BE_PAUSED");
        }

        const locationCode =
          cleanText(parsed.data.code) ||
          existing.code ||
          (await generateBusinessNumber({
            runner: client,
            businessId: context.business.id,
            prefix: "LOC",
            counterName: "location",
          }));

        if (parsed.data.isMain) {
          await client.query(
            `
              update branches
              set
                is_main = false,
                updated_at = now()
              where business_id = $1
            `,
            [context.business.id],
          );
        }

        const result = await client.query<DbLocation>(
          `
            update branches
            set
              name = $1,
              code = $2,
              address = $3,
              status = $4,
              is_main = $5,
              updated_at = now()
            where id = $6
              and business_id = $7
            returning
              id,
              business_id,
              name,
              code,
              address,
              is_main,
              status,
              created_at,
              updated_at
          `,
          [
            parsed.data.name,
            locationCode,
            cleanText(parsed.data.address),
            parsed.data.status,
            parsed.data.isMain,
            params.id,
            context.business.id,
          ],
        );

        return result.rows[0]!;
      });

      return {
        ok: true,
        location: mapLocation(location),
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return reply.status(409).send({
          ok: false,
          message: "A location with this code already exists.",
        });
      }

      if (error instanceof Error && error.message === "LOCATION_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Location not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "MAIN_LOCATION_CANNOT_BE_PAUSED"
      ) {
        return reply.status(400).send({
          ok: false,
          message: "The main location cannot be paused.",
        });
      }

      throw error;
    }
  });
}
