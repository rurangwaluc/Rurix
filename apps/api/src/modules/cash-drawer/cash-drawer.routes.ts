import type { FastifyInstance, FastifyReply } from "fastify";
import { query, transaction, type DbRow } from "@rurix/db";
import {
  contextCanAccessBranch,
  contextHasPermission,
  requireAuth,
} from "../auth/auth.context";

type CashDrawerStatus = "open" | "closed";

type CashDrawerMovementType =
  | "opening_cash"
  | "cash_sale"
  | "cash_in"
  | "cash_out"
  | "closing_adjustment";

type DbBranch = DbRow & {
  id: string;
  name: string;
};

type DbCashDrawerSession = DbRow & {
  id: string;
  business_id: string;
  branch_id: string;
  branch_name: string;
  status: CashDrawerStatus;
  opening_cash_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number | null;
  difference_cents: number | null;
  notes: string | null;
  close_notes: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  opened_at: Date;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type DbCashDrawerMovement = DbRow & {
  id: string;
  cash_drawer_session_id: string;
  sale_id: string | null;
  sale_payment_id: string | null;
  sale_number: string | null;
  receipt_number: string | null;
  movement_type: CashDrawerMovementType;
  amount_cents: number;
  balance_before_cents: number;
  balance_after_cents: number;
  reason: string | null;
  reference: string | null;
  actor_name: string | null;
  created_at: Date;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function toNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toNonNegativeCents(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  const rounded = Math.round(numberValue);

  return rounded >= 0 ? rounded : null;
}

function mapSession(row: DbCashDrawerSession) {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    status: row.status,
    openingCashCents: toNumber(row.opening_cash_cents),
    expectedCashCents: toNumber(row.expected_cash_cents),
    countedCashCents:
      row.counted_cash_cents === null ? null : toNumber(row.counted_cash_cents),
    differenceCents:
      row.difference_cents === null ? null : toNumber(row.difference_cents),
    notes: row.notes,
    closeNotes: row.close_notes,
    openedByName: row.opened_by_name,
    closedByName: row.closed_by_name,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMovement(row: DbCashDrawerMovement) {
  return {
    id: row.id,
    cashDrawerSessionId: row.cash_drawer_session_id,
    saleId: row.sale_id,
    salePaymentId: row.sale_payment_id,
    saleNumber: row.sale_number,
    receiptNumber: row.receipt_number,
    movementType: row.movement_type,
    amountCents: toNumber(row.amount_cents),
    balanceBeforeCents: toNumber(row.balance_before_cents),
    balanceAfterCents: toNumber(row.balance_after_cents),
    reason: row.reason,
    reference: row.reference,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

function cashDrawerErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Selling location not found.",
    });
  }

  if (error instanceof Error && error.message === "CASH_DRAWER_ALREADY_OPEN") {
    return reply.status(400).send({
      ok: false,
      message: "This selling location already has an open cash drawer.",
    });
  }

  if (error instanceof Error && error.message === "CASH_DRAWER_NOT_OPEN") {
    return reply.status(400).send({
      ok: false,
      message: "There is no open cash drawer for this selling location.",
    });
  }

  throw error;
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

async function loadCurrentSession(input: {
  businessId: string;
  branchId: string;
}) {
  const result = await query<DbCashDrawerSession>(
    `
      select
        cds.id,
        cds.business_id,
        cds.branch_id,
        b.name as branch_name,
        cds.status,
        cds.opening_cash_cents,
        cds.expected_cash_cents,
        cds.counted_cash_cents,
        cds.difference_cents,
        cds.notes,
        cds.close_notes,
        opened_by.full_name as opened_by_name,
        closed_by.full_name as closed_by_name,
        cds.opened_at,
        cds.closed_at,
        cds.created_at,
        cds.updated_at
      from cash_drawer_sessions cds
      inner join branches b on b.id = cds.branch_id
      left join users opened_by on opened_by.id = cds.opened_by_user_id
      left join users closed_by on closed_by.id = cds.closed_by_user_id
      where cds.business_id = $1
        and cds.branch_id = $2
        and cds.status = 'open'
      limit 1
    `,
    [input.businessId, input.branchId],
  );

  return result.rows[0] || null;
}

async function loadSessionDetail(input: {
  businessId: string;
  sessionId: string;
}) {
  const sessionResult = await query<DbCashDrawerSession>(
    `
      select
        cds.id,
        cds.business_id,
        cds.branch_id,
        b.name as branch_name,
        cds.status,
        cds.opening_cash_cents,
        cds.expected_cash_cents,
        cds.counted_cash_cents,
        cds.difference_cents,
        cds.notes,
        cds.close_notes,
        opened_by.full_name as opened_by_name,
        closed_by.full_name as closed_by_name,
        cds.opened_at,
        cds.closed_at,
        cds.created_at,
        cds.updated_at
      from cash_drawer_sessions cds
      inner join branches b on b.id = cds.branch_id
      left join users opened_by on opened_by.id = cds.opened_by_user_id
      left join users closed_by on closed_by.id = cds.closed_by_user_id
      where cds.business_id = $1
        and cds.id = $2
      limit 1
    `,
    [input.businessId, input.sessionId],
  );

  const session = sessionResult.rows[0];

  if (!session) {
    throw new Error("CASH_DRAWER_NOT_FOUND");
  }

  const movementsResult = await query<DbCashDrawerMovement>(
    `
      select
        cdm.id,
        cdm.cash_drawer_session_id,
        cdm.sale_id,
        cdm.sale_payment_id,
        s.sale_number,
        s.receipt_number,
        cdm.movement_type,
        cdm.amount_cents,
        cdm.balance_before_cents,
        cdm.balance_after_cents,
        cdm.reason,
        cdm.reference,
        u.full_name as actor_name,
        cdm.created_at
      from cash_drawer_movements cdm
      left join sales s on s.id = cdm.sale_id
      left join users u on u.id = cdm.actor_user_id
      where cdm.business_id = $1
        and cdm.cash_drawer_session_id = $2
      order by cdm.created_at desc
    `,
    [input.businessId, input.sessionId],
  );

  return {
    session: mapSession(session),
    movements: movementsResult.rows.map(mapMovement),
  };
}

export async function cashDrawerRoutes(app: FastifyInstance) {
  app.get("/current", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "SALE_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to manage cash drawer.",
      });
    }

    const requestQuery = request.query as { branchId?: string };
    const branchId = cleanText(requestQuery.branchId);

    if (!branchId) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a selling location.",
      });
    }

    if (!contextCanAccessBranch(context, branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this selling location.",
      });
    }

    try {
      await ensureBranch({
        businessId: context.business.id,
        branchId,
      });

      const session = await loadCurrentSession({
        businessId: context.business.id,
        branchId,
      });

      return {
        ok: true,
        session: session ? mapSession(session) : null,
      };
    } catch (error) {
      return cashDrawerErrorReply(reply, error);
    }
  });

  app.post("/open", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "SALE_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to open cash drawer.",
      });
    }

    const body = request.body as {
      branchId?: unknown;
      openingCashCents?: unknown;
      notes?: unknown;
    };

    const branchId = cleanText(body.branchId);
    const openingCashCents = toNonNegativeCents(body.openingCashCents);

    if (!branchId) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a selling location.",
      });
    }

    if (openingCashCents === null) {
      return reply.status(400).send({
        ok: false,
        message: "Enter the opening cash amount.",
      });
    }

    if (!contextCanAccessBranch(context, branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this selling location.",
      });
    }

    try {
      const sessionId = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        await ensureBranch({
          businessId: context.business.id,
          branchId,
          client: runner,
        });

        const existingResult = await client.query<{ id: string } & DbRow>(
          `
            select id
            from cash_drawer_sessions
            where business_id = $1
              and branch_id = $2
              and status = 'open'
            limit 1
          `,
          [context.business.id, branchId],
        );

        if (existingResult.rows[0]) {
          throw new Error("CASH_DRAWER_ALREADY_OPEN");
        }

        const sessionResult = await client.query<{ id: string } & DbRow>(
          `
            insert into cash_drawer_sessions (
              business_id,
              branch_id,
              status,
              opening_cash_cents,
              expected_cash_cents,
              notes,
              opened_by_user_id
            )
            values ($1, $2, 'open', $3, $3, $4, $5)
            returning id
          `,
          [
            context.business.id,
            branchId,
            openingCashCents,
            cleanText(body.notes),
            context.user.id,
          ],
        );

        const session = sessionResult.rows[0];

        if (!session) {
          throw new Error("CASH_DRAWER_NOT_CREATED");
        }

        await client.query(
          `
            insert into cash_drawer_movements (
              business_id,
              branch_id,
              cash_drawer_session_id,
              movement_type,
              amount_cents,
              balance_before_cents,
              balance_after_cents,
              reason,
              reference,
              actor_user_id
            )
            values ($1, $2, $3, 'opening_cash', $4, 0, $4, $5, null, $6)
          `,
          [
            context.business.id,
            branchId,
            session.id,
            openingCashCents,
            "Opening cash drawer",
            context.user.id,
          ],
        );

        return session.id;
      });

      const detail = await loadSessionDetail({
        businessId: context.business.id,
        sessionId,
      });

      return reply.status(201).send({
        ok: true,
        ...detail,
      });
    } catch (error) {
      return cashDrawerErrorReply(reply, error);
    }
  });

  app.post("/close", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!contextHasPermission(context, "SALE_CREATE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to close cash drawer.",
      });
    }

    const body = request.body as {
      branchId?: unknown;
      countedCashCents?: unknown;
      notes?: unknown;
    };

    const branchId = cleanText(body.branchId);
    const countedCashCents = toNonNegativeCents(body.countedCashCents);

    if (!branchId) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a selling location.",
      });
    }

    if (countedCashCents === null) {
      return reply.status(400).send({
        ok: false,
        message: "Enter the counted cash amount.",
      });
    }

    if (!contextCanAccessBranch(context, branchId)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this selling location.",
      });
    }

    try {
      const sessionId = await transaction(async (client) => {
        const sessionResult = await client.query<
          { id: string; expected_cash_cents: number } & DbRow
        >(
          `
            select id, expected_cash_cents
            from cash_drawer_sessions
            where business_id = $1
              and branch_id = $2
              and status = 'open'
            for update
          `,
          [context.business.id, branchId],
        );

        const session = sessionResult.rows[0];

        if (!session) {
          throw new Error("CASH_DRAWER_NOT_OPEN");
        }

        const expectedCashCents = toNumber(session.expected_cash_cents);
        const differenceCents = countedCashCents - expectedCashCents;

        await client.query(
          `
            update cash_drawer_sessions
            set
              status = 'closed',
              counted_cash_cents = $1,
              difference_cents = $2,
              close_notes = $3,
              closed_by_user_id = $4,
              closed_at = now(),
              updated_at = now()
            where id = $5
              and business_id = $6
          `,
          [
            countedCashCents,
            differenceCents,
            cleanText(body.notes),
            context.user.id,
            session.id,
            context.business.id,
          ],
        );

        if (differenceCents !== 0) {
          await client.query(
            `
              insert into cash_drawer_movements (
                business_id,
                branch_id,
                cash_drawer_session_id,
                movement_type,
                amount_cents,
                balance_before_cents,
                balance_after_cents,
                reason,
                reference,
                actor_user_id
              )
              values ($1, $2, $3, 'closing_adjustment', $4, $5, $6, $7, null, $8)
            `,
            [
              context.business.id,
              branchId,
              session.id,
              differenceCents,
              expectedCashCents,
              countedCashCents,
              "Cash drawer closing difference",
              context.user.id,
            ],
          );
        }

        return session.id;
      });

      const detail = await loadSessionDetail({
        businessId: context.business.id,
        sessionId,
      });

      return {
        ok: true,
        ...detail,
      };
    } catch (error) {
      return cashDrawerErrorReply(reply, error);
    }
  });

  app.get("/sessions", async (request, reply) => {
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
        message: "You do not have access to view cash drawer sessions.",
      });
    }

    const requestQuery = request.query as {
      branchId?: string;
      status?: CashDrawerStatus;
    };

    const values: unknown[] = [context.business.id];
    const where: string[] = ["cds.business_id = $1"];

    if (requestQuery.branchId) {
      if (!contextCanAccessBranch(context, requestQuery.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this selling location.",
        });
      }

      values.push(requestQuery.branchId);
      where.push(`cds.branch_id = $${values.length}`);
    }

    if (requestQuery.status === "open" || requestQuery.status === "closed") {
      values.push(requestQuery.status);
      where.push(`cds.status = $${values.length}`);
    }

    const result = await query<DbCashDrawerSession>(
      `
        select
          cds.id,
          cds.business_id,
          cds.branch_id,
          b.name as branch_name,
          cds.status,
          cds.opening_cash_cents,
          cds.expected_cash_cents,
          cds.counted_cash_cents,
          cds.difference_cents,
          cds.notes,
          cds.close_notes,
          opened_by.full_name as opened_by_name,
          closed_by.full_name as closed_by_name,
          cds.opened_at,
          cds.closed_at,
          cds.created_at,
          cds.updated_at
        from cash_drawer_sessions cds
        inner join branches b on b.id = cds.branch_id
        left join users opened_by on opened_by.id = cds.opened_by_user_id
        left join users closed_by on closed_by.id = cds.closed_by_user_id
        where ${where.join(" and ")}
        order by cds.opened_at desc
        limit 100
      `,
      values,
    );

    return {
      ok: true,
      sessions: result.rows.map(mapSession),
    };
  });

  app.get("/sessions/:id", async (request, reply) => {
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
        message: "You do not have access to view cash drawer sessions.",
      });
    }

    const params = request.params as { id: string };

    try {
      const detail = await loadSessionDetail({
        businessId: context.business.id,
        sessionId: params.id,
      });

      if (!contextCanAccessBranch(context, detail.session.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this selling location.",
        });
      }

      return {
        ok: true,
        ...detail,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "CASH_DRAWER_NOT_FOUND") {
        return reply.status(404).send({
          ok: false,
          message: "Cash drawer session not found.",
        });
      }

      return cashDrawerErrorReply(reply, error);
    }
  });
}
