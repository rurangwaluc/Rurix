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
  | "manual_cash_in"
  | "manual_cash_out"
  | "drawer_reopened"
  | "drawer_closed";

type DbCashDrawerSession = DbRow & {
  id: string;
  business_id: string;
  branch_id: string;
  branch_name: string;
  business_day: Date | string;
  status: CashDrawerStatus;
  opening_cash_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number | null;
  difference_cents: number | null;
  close_note: string | null;
  difference_reason: string | null;
  opened_by_user_id: string;
  opened_by_name: string | null;
  closed_by_user_id: string | null;
  closed_by_name: string | null;
  reopened_by_user_id: string | null;
  reopened_by_name: string | null;
  reopen_reason: string | null;
  opened_at: Date;
  closed_at: Date | null;
  reopened_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type DbCashDrawerMovement = DbRow & {
  id: string;
  cash_drawer_session_id: string;
  business_id: string;
  branch_id: string;
  movement_type: CashDrawerMovementType;
  amount_cents: number;
  expected_cash_before_cents: number;
  expected_cash_after_cents: number;
  reason: string | null;
  note: string | null;
  reference: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  sale_id: string | null;
  sale_payment_id: string | null;
  created_at: Date;
};

type DbBusinessMember = DbRow & {
  member_type: string;
};

function toNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toPositiveCents(value: unknown) {
  return Math.max(0, Math.round(toNumber(value)));
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function mapCashDrawerSession(row: DbCashDrawerSession) {
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    businessDay:
      row.business_day instanceof Date
        ? row.business_day.toISOString().slice(0, 10)
        : String(row.business_day).slice(0, 10),
    status: row.status,
    openingCashCents: toNumber(row.opening_cash_cents),
    expectedCashCents: toNumber(row.expected_cash_cents),
    countedCashCents:
      row.counted_cash_cents === null ? null : toNumber(row.counted_cash_cents),
    differenceCents:
      row.difference_cents === null ? null : toNumber(row.difference_cents),
    closeNote: row.close_note,
    differenceReason: row.difference_reason,
    openedByUserId: row.opened_by_user_id,
    openedByName: row.opened_by_name,
    closedByUserId: row.closed_by_user_id,
    closedByName: row.closed_by_name,
    reopenedByUserId: row.reopened_by_user_id,
    reopenedByName: row.reopened_by_name,
    reopenReason: row.reopen_reason,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    reopenedAt: row.reopened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCashDrawerMovement(row: DbCashDrawerMovement) {
  return {
    id: row.id,
    cashDrawerSessionId: row.cash_drawer_session_id,
    businessId: row.business_id,
    branchId: row.branch_id,
    movementType: row.movement_type,
    amountCents: toNumber(row.amount_cents),
    expectedCashBeforeCents: toNumber(row.expected_cash_before_cents),
    expectedCashAfterCents: toNumber(row.expected_cash_after_cents),
    reason: row.reason,
    note: row.note,
    reference: row.reference,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    saleId: row.sale_id,
    salePaymentId: row.sale_payment_id,
    createdAt: row.created_at,
  };
}

async function isOwnerForBusiness(input: {
  businessId: string;
  userId: string;
}) {
  const result = await query<DbBusinessMember>(
    `
      select member_type
      from business_members
      where business_id = $1
        and user_id = $2
      limit 1
    `,
    [input.businessId, input.userId],
  );

  const memberType = result.rows[0]?.member_type;

  return memberType === "PRIMARY_OWNER" || memberType === "OWNER";
}

async function getDrawerSessionById(input: {
  businessId: string;
  sessionId: string;
}) {
  const result = await query<DbCashDrawerSession>(
    `
      select
        cds.id,
        cds.business_id,
        cds.branch_id,
        b.name as branch_name,
        cds.business_day,
        cds.status,
        cds.opening_cash_cents,
        cds.expected_cash_cents,
        cds.counted_cash_cents,
        cds.difference_cents,
        cds.close_note,
        cds.difference_reason,
        cds.opened_by_user_id,
        opened_by.full_name as opened_by_name,
        cds.closed_by_user_id,
        closed_by.full_name as closed_by_name,
        cds.reopened_by_user_id,
        reopened_by.full_name as reopened_by_name,
        cds.reopen_reason,
        cds.opened_at,
        cds.closed_at,
        cds.reopened_at,
        cds.created_at,
        cds.updated_at
      from cash_drawer_sessions cds
      inner join branches b on b.id = cds.branch_id
      left join users opened_by on opened_by.id = cds.opened_by_user_id
      left join users closed_by on closed_by.id = cds.closed_by_user_id
      left join users reopened_by on reopened_by.id = cds.reopened_by_user_id
      where cds.id = $1
        and cds.business_id = $2
      limit 1
    `,
    [input.sessionId, input.businessId],
  );

  return result.rows[0] || null;
}

async function getTodayDrawerSession(input: {
  businessId: string;
  branchId: string;
  client?: {
    query: typeof query;
  };
}) {
  const runner = input.client || { query };

  const result = await runner.query<DbCashDrawerSession>(
    `
      select
        cds.id,
        cds.business_id,
        cds.branch_id,
        b.name as branch_name,
        cds.business_day,
        cds.status,
        cds.opening_cash_cents,
        cds.expected_cash_cents,
        cds.counted_cash_cents,
        cds.difference_cents,
        cds.close_note,
        cds.difference_reason,
        cds.opened_by_user_id,
        opened_by.full_name as opened_by_name,
        cds.closed_by_user_id,
        closed_by.full_name as closed_by_name,
        cds.reopened_by_user_id,
        reopened_by.full_name as reopened_by_name,
        cds.reopen_reason,
        cds.opened_at,
        cds.closed_at,
        cds.reopened_at,
        cds.created_at,
        cds.updated_at
      from cash_drawer_sessions cds
      inner join branches b on b.id = cds.branch_id
      left join users opened_by on opened_by.id = cds.opened_by_user_id
      left join users closed_by on closed_by.id = cds.closed_by_user_id
      left join users reopened_by on reopened_by.id = cds.reopened_by_user_id
      where cds.business_id = $1
        and cds.branch_id = $2
        and cds.business_day = current_date
      limit 1
    `,
    [input.businessId, input.branchId],
  );

  return result.rows[0] || null;
}

async function getMovements(input: { businessId: string; sessionId: string }) {
  const result = await query<DbCashDrawerMovement>(
    `
      select
        cdm.id,
        cdm.cash_drawer_session_id,
        cdm.business_id,
        cdm.branch_id,
        cdm.movement_type,
        cdm.amount_cents,
        cdm.expected_cash_before_cents,
        cdm.expected_cash_after_cents,
        cdm.reason,
        cdm.note,
        cdm.reference,
        cdm.actor_user_id,
        u.full_name as actor_name,
        cdm.sale_id,
        cdm.sale_payment_id,
        cdm.created_at
      from cash_drawer_movements cdm
      left join users u on u.id = cdm.actor_user_id
      where cdm.business_id = $1
        and cdm.cash_drawer_session_id = $2
      order by cdm.created_at desc
      limit 200
    `,
    [input.businessId, input.sessionId],
  );

  return result.rows.map(mapCashDrawerMovement);
}

function cashDrawerErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof Error && error.message === "LOCATION_NOT_FOUND") {
    return reply.status(404).send({
      ok: false,
      message: "Location not found.",
    });
  }

  if (error instanceof Error && error.message === "DRAWER_ALREADY_OPEN") {
    return reply.status(400).send({
      ok: false,
      message: "Cash drawer is already open for this location today.",
    });
  }

  if (
    error instanceof Error &&
    error.message === "DRAWER_ALREADY_CLOSED_TODAY"
  ) {
    return reply.status(400).send({
      ok: false,
      message:
        "This cash drawer was already closed today. It can be opened again tomorrow, or the owner can reopen it with a reason.",
    });
  }

  if (error instanceof Error && error.message === "OWNER_REOPEN_REQUIRED") {
    return reply.status(403).send({
      ok: false,
      message:
        "Only the owner can reopen a closed cash drawer on the same day.",
    });
  }

  if (error instanceof Error && error.message === "REOPEN_REASON_REQUIRED") {
    return reply.status(400).send({
      ok: false,
      message: "Add a reason before reopening this cash drawer.",
    });
  }

  if (error instanceof Error && error.message === "DRAWER_NOT_OPEN") {
    return reply.status(400).send({
      ok: false,
      message: "There is no open cash drawer for this location.",
    });
  }

  if (
    error instanceof Error &&
    error.message === "DIFFERENCE_REASON_REQUIRED"
  ) {
    return reply.status(400).send({
      ok: false,
      message:
        "Add a reason because the cash counted is different from the expected cash.",
    });
  }

  throw error;
}

async function ensureBranchAccess(input: {
  context: Awaited<ReturnType<typeof requireAuth>>;
  branchId: string;
  reply: FastifyReply;
}) {
  const context = input.context;

  if (!context) {
    return input.reply.status(401).send({
      ok: false,
      message: "Please sign in again.",
    });
  }

  if (!contextCanAccessBranch(context, input.branchId)) {
    return input.reply.status(403).send({
      ok: false,
      message: "You do not have access to this location.",
    });
  }

  const branchResult = await query<{ id: string } & DbRow>(
    `
      select id
      from branches
      where id = $1
        and business_id = $2
        and status = 'active'
      limit 1
    `,
    [input.branchId, context.business.id],
  );

  if (!branchResult.rows[0]) {
    throw new Error("LOCATION_NOT_FOUND");
  }

  return null;
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

    if (!contextHasPermission(context, "CASH_SESSION_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view the cash drawer.",
      });
    }

    const branchId = String(
      (request.query as { branchId?: string }).branchId || "",
    );

    if (!branchId) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a location.",
      });
    }

    try {
      const accessReply = await ensureBranchAccess({
        context,
        branchId,
        reply,
      });

      if (accessReply) {
        return accessReply;
      }

      const session = await getTodayDrawerSession({
        businessId: context.business.id,
        branchId,
      });

      return {
        ok: true,
        session: session ? mapCashDrawerSession(session) : null,
        businessDay: todayIsoDate(),
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

    if (!contextHasPermission(context, "CASH_SESSION_OPEN")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to open the cash drawer.",
      });
    }

    const body = request.body as {
      branchId?: string;
      openingCashCents?: number;
      note?: string;
      ownerOverride?: boolean;
      reopenReason?: string;
    };

    const branchId = String(body.branchId || "");
    const openingCashCents = toPositiveCents(body.openingCashCents || 0);
    const note = cleanText(body.note);
    const reopenReason = cleanText(body.reopenReason);
    const ownerOverride = Boolean(body.ownerOverride);

    if (!branchId) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a location.",
      });
    }

    try {
      const accessReply = await ensureBranchAccess({
        context,
        branchId,
        reply,
      });

      if (accessReply) {
        return accessReply;
      }

      const sessionId = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        const todaySession = await getTodayDrawerSession({
          businessId: context.business.id,
          branchId,
          client: runner,
        });

        if (todaySession?.status === "open") {
          throw new Error("DRAWER_ALREADY_OPEN");
        }

        if (todaySession?.status === "closed") {
          if (!ownerOverride) {
            throw new Error("DRAWER_ALREADY_CLOSED_TODAY");
          }

          const isOwner = await isOwnerForBusiness({
            businessId: context.business.id,
            userId: context.user.id,
          });

          if (!isOwner) {
            throw new Error("OWNER_REOPEN_REQUIRED");
          }

          if (!reopenReason) {
            throw new Error("REOPEN_REASON_REQUIRED");
          }

          const beforeExpected = toNumber(todaySession.expected_cash_cents);
          const afterExpected = beforeExpected;

          await client.query(
            `
              update cash_drawer_sessions
              set
                status = 'open',
                reopened_by_user_id = $1,
                reopened_at = now(),
                reopen_reason = $2,
                closed_by_user_id = null,
                closed_at = null,
                updated_at = now()
              where id = $3
                and business_id = $4
            `,
            [
              context.user.id,
              reopenReason,
              todaySession.id,
              context.business.id,
            ],
          );

          await client.query(
            `
              insert into cash_drawer_movements (
                cash_drawer_session_id,
                business_id,
                branch_id,
                movement_type,
                amount_cents,
                expected_cash_before_cents,
                expected_cash_after_cents,
                reason,
                note,
                reference,
                actor_user_id
              )
              values ($1, $2, $3, 'drawer_reopened', 0, $4, $5, $6, $7, $8, $9)
            `,
            [
              todaySession.id,
              context.business.id,
              branchId,
              beforeExpected,
              afterExpected,
              "Cash drawer reopened by owner",
              reopenReason,
              `REOPEN-${todaySession.id}`,
              context.user.id,
            ],
          );

          return todaySession.id;
        }

        const insertedResult = await client.query<{ id: string } & DbRow>(
          `
            insert into cash_drawer_sessions (
              business_id,
              branch_id,
              business_day,
              status,
              opening_cash_cents,
              expected_cash_cents,
              opened_by_user_id
            )
            values ($1, $2, current_date, 'open', $3, $3, $4)
            returning id
          `,
          [context.business.id, branchId, openingCashCents, context.user.id],
        );

        const inserted = insertedResult.rows[0];

        if (!inserted) {
          throw new Error("DRAWER_NOT_CREATED");
        }

        await client.query(
          `
            insert into cash_drawer_movements (
              cash_drawer_session_id,
              business_id,
              branch_id,
              movement_type,
              amount_cents,
              expected_cash_before_cents,
              expected_cash_after_cents,
              reason,
              note,
              reference,
              actor_user_id
            )
            values ($1, $2, $3, 'opening_cash', $4, 0, $4, $5, $6, $7, $8)
          `,
          [
            inserted.id,
            context.business.id,
            branchId,
            openingCashCents,
            "Opening cash",
            note,
            `OPEN-${inserted.id}`,
            context.user.id,
          ],
        );

        return inserted.id;
      });

      const session = await getDrawerSessionById({
        businessId: context.business.id,
        sessionId,
      });

      return reply.status(201).send({
        ok: true,
        session: session ? mapCashDrawerSession(session) : null,
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

    if (!contextHasPermission(context, "CASH_SESSION_CLOSE")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to close the cash drawer.",
      });
    }

    const body = request.body as {
      branchId?: string;
      countedCashCents?: number;
      note?: string;
      differenceReason?: string;
    };

    const branchId = String(body.branchId || "");
    const countedCashCents = toPositiveCents(body.countedCashCents || 0);
    const note = cleanText(body.note);
    const differenceReason = cleanText(body.differenceReason);

    if (!branchId) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a location.",
      });
    }

    try {
      const accessReply = await ensureBranchAccess({
        context,
        branchId,
        reply,
      });

      if (accessReply) {
        return accessReply;
      }

      const sessionId = await transaction(async (client) => {
        const runner = {
          query: client.query.bind(client),
        };

        const todaySession = await getTodayDrawerSession({
          businessId: context.business.id,
          branchId,
          client: runner,
        });

        if (!todaySession || todaySession.status !== "open") {
          throw new Error("DRAWER_NOT_OPEN");
        }

        const expectedCashCents = toNumber(todaySession.expected_cash_cents);
        const differenceCents = countedCashCents - expectedCashCents;

        if (differenceCents !== 0 && !differenceReason) {
          throw new Error("DIFFERENCE_REASON_REQUIRED");
        }

        await client.query(
          `
            update cash_drawer_sessions
            set
              status = 'closed',
              counted_cash_cents = $1,
              difference_cents = $2,
              close_note = $3,
              difference_reason = $4,
              closed_by_user_id = $5,
              closed_at = now(),
              updated_at = now()
            where id = $6
              and business_id = $7
          `,
          [
            countedCashCents,
            differenceCents,
            note,
            differenceReason,
            context.user.id,
            todaySession.id,
            context.business.id,
          ],
        );

        await client.query(
          `
            insert into cash_drawer_movements (
              cash_drawer_session_id,
              business_id,
              branch_id,
              movement_type,
              amount_cents,
              expected_cash_before_cents,
              expected_cash_after_cents,
              reason,
              note,
              reference,
              actor_user_id
            )
            values ($1, $2, $3, 'drawer_closed', 0, $4, $4, $5, $6, $7, $8)
          `,
          [
            todaySession.id,
            context.business.id,
            branchId,
            expectedCashCents,
            differenceCents === 0
              ? "Cash drawer closed with no difference"
              : differenceCents > 0
                ? "Cash drawer closed above expected"
                : "Cash drawer closed below expected",
            differenceReason || note,
            `CLOSE-${todaySession.id}`,
            context.user.id,
          ],
        );

        return todaySession.id;
      });

      const session = await getDrawerSessionById({
        businessId: context.business.id,
        sessionId,
      });

      return {
        ok: true,
        session: session ? mapCashDrawerSession(session) : null,
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

    if (!contextHasPermission(context, "CASH_SESSION_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view cash drawer sessions.",
      });
    }

    const queryParams = request.query as {
      branchId?: string;
      status?: CashDrawerStatus;
    };

    const values: unknown[] = [context.business.id];
    const where: string[] = ["cds.business_id = $1"];

    if (queryParams.branchId) {
      if (!contextCanAccessBranch(context, queryParams.branchId)) {
        return reply.status(403).send({
          ok: false,
          message: "You do not have access to this location.",
        });
      }

      values.push(queryParams.branchId);
      where.push(`cds.branch_id = $${values.length}`);
    }

    if (queryParams.status === "open" || queryParams.status === "closed") {
      values.push(queryParams.status);
      where.push(`cds.status = $${values.length}`);
    }

    const result = await query<DbCashDrawerSession>(
      `
        select
          cds.id,
          cds.business_id,
          cds.branch_id,
          b.name as branch_name,
          cds.business_day,
          cds.status,
          cds.opening_cash_cents,
          cds.expected_cash_cents,
          cds.counted_cash_cents,
          cds.difference_cents,
          cds.close_note,
          cds.difference_reason,
          cds.opened_by_user_id,
          opened_by.full_name as opened_by_name,
          cds.closed_by_user_id,
          closed_by.full_name as closed_by_name,
          cds.reopened_by_user_id,
          reopened_by.full_name as reopened_by_name,
          cds.reopen_reason,
          cds.opened_at,
          cds.closed_at,
          cds.reopened_at,
          cds.created_at,
          cds.updated_at
        from cash_drawer_sessions cds
        inner join branches b on b.id = cds.branch_id
        left join users opened_by on opened_by.id = cds.opened_by_user_id
        left join users closed_by on closed_by.id = cds.closed_by_user_id
        left join users reopened_by on reopened_by.id = cds.reopened_by_user_id
        where ${where.join(" and ")}
        order by cds.business_day desc, cds.opened_at desc
        limit 200
      `,
      values,
    );

    return {
      ok: true,
      sessions: result.rows.map(mapCashDrawerSession),
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

    if (!contextHasPermission(context, "CASH_SESSION_VIEW")) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to view this cash drawer session.",
      });
    }

    const params = request.params as { id: string };

    const session = await getDrawerSessionById({
      businessId: context.business.id,
      sessionId: params.id,
    });

    if (!session) {
      return reply.status(404).send({
        ok: false,
        message: "Cash drawer session not found.",
      });
    }

    if (!contextCanAccessBranch(context, session.branch_id)) {
      return reply.status(403).send({
        ok: false,
        message: "You do not have access to this location.",
      });
    }

    const movements = await getMovements({
      businessId: context.business.id,
      sessionId: params.id,
    });

    return {
      ok: true,
      session: mapCashDrawerSession(session),
      movements,
    };
  });
}
