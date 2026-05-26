import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { query, transaction, type DbRow } from "@rurix/db";
import type { BranchRole } from "@rurix/domain";
import {
  assignStaffLocationRolesSchema,
  createStaffSchema,
  removeStaffLocationRolesSchema,
  resetStaffPasswordSchema,
  updateStaffDetailsSchema,
  updateStaffStatusSchema,
} from "@rurix/schemas";
import { normalizeEmail } from "@rurix/utils";
import {
  contextCanAccessBranch,
  contextHasPermission,
  contextIsOwner,
  getContextBranchIds,
  requireAuth,
} from "../auth/auth.context";

type AuthContext = NonNullable<Awaited<ReturnType<typeof requireAuth>>>;

type DbStaffUser = DbRow & {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: Date;
};

type DbStaffListRow = DbRow & {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: Date;
  branch_id: string | null;
  branch_name: string | null;
  is_main: boolean | null;
  role: BranchRole | null;
};

type DbBranch = DbRow & {
  id: string;
  name: string;
  status: string;
};

type StaffLocation = {
  id: string;
  name: string;
  isMain: boolean;
  roles: BranchRole[];
};

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned by the database.`);
  }

  return row;
}

function groupStaffRows(rows: DbStaffListRow[]) {
  const staffMap = new Map<
    string,
    {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      status: string;
      createdAt: Date;
      locations: StaffLocation[];
    }
  >();

  for (const row of rows) {
    let staff = staffMap.get(row.id);

    if (!staff) {
      staff = {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        createdAt: row.created_at,
        locations: [],
      };

      staffMap.set(row.id, staff);
    }

    if (!row.branch_id || !row.branch_name) {
      continue;
    }

    let location = staff.locations.find((item) => item.id === row.branch_id);

    if (!location) {
      location = {
        id: row.branch_id,
        name: row.branch_name,
        isMain: Boolean(row.is_main),
        roles: [],
      };

      staff.locations.push(location);
    }

    if (row.role && !location.roles.includes(row.role)) {
      location.roles.push(row.role);
    }
  }

  return [...staffMap.values()];
}

async function ensureBranchesExist(businessId: string, branchIds: string[]) {
  const result = await query<DbBranch>(
    `
      select id, name, status
      from branches
      where business_id = $1
        and id = any($2::uuid[])
        and status = 'active'
    `,
    [businessId, branchIds],
  );

  const foundIds = new Set(result.rows.map((branch) => branch.id));

  for (const branchId of branchIds) {
    if (!foundIds.has(branchId)) {
      return false;
    }
  }

  return true;
}

function getVisibleBranchIds(context: AuthContext) {
  if (contextIsOwner(context)) {
    return null;
  }

  return getContextBranchIds(context);
}

async function contextCanManageStaffMember(
  context: AuthContext,
  staffId: string,
) {
  if (contextIsOwner(context)) {
    return true;
  }

  const branchIds = getContextBranchIds(context);

  if (!branchIds.length) {
    return false;
  }

  const result = await query(
    `
      select 1
      from business_members bm
      inner join branch_memberships brm
        on brm.business_id = bm.business_id
        and brm.user_id = bm.user_id
        and brm.status = 'active'
      where bm.business_id = $1
        and bm.user_id = $2
        and bm.member_type = 'STAFF'
        and brm.branch_id = any($3::uuid[])
      limit 1
    `,
    [context.business.id, staffId, branchIds],
  );

  return Boolean(result.rowCount && result.rowCount > 0);
}

async function getStaffById(
  businessId: string,
  staffId: string,
  visibleBranchIds: string[] | null,
) {
  if (visibleBranchIds && visibleBranchIds.length === 0) {
    return null;
  }

  const params = visibleBranchIds
    ? [businessId, staffId, visibleBranchIds]
    : [businessId, staffId];

  const result = await query<DbStaffListRow>(
    `
      select
        u.id,
        u.full_name,
        u.email::text as email,
        u.phone,
        u.status,
        u.created_at,
        b.id as branch_id,
        b.name as branch_name,
        b.is_main,
        bmr.role
      from business_members bm
      inner join users u on u.id = bm.user_id
      left join branch_memberships brm
        on brm.user_id = u.id
        and brm.business_id = bm.business_id
        and brm.status = 'active'
        ${visibleBranchIds ? "and brm.branch_id = any($3::uuid[])" : ""}
      left join branches b
        on b.id = brm.branch_id
        and b.business_id = bm.business_id
        and b.status = 'active'
      left join branch_member_roles bmr
        on bmr.user_id = u.id
        and bmr.business_id = bm.business_id
        and bmr.branch_id = b.id
      where bm.business_id = $1
        and bm.member_type = 'STAFF'
        and u.id = $2
        ${
          visibleBranchIds
            ? `
              and exists (
                select 1
                from branch_memberships scope_bm
                where scope_bm.business_id = bm.business_id
                  and scope_bm.user_id = u.id
                  and scope_bm.status = 'active'
                  and scope_bm.branch_id = any($3::uuid[])
              )
            `
            : ""
        }
      order by b.is_main desc, b.name asc, bmr.role asc
    `,
    params,
  );

  return groupStaffRows(result.rows)[0] || null;
}

export async function staffRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (!contextHasPermission(context, "STAFF_VIEW")) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to view staff.",
      });
    }

    const visibleBranchIds = getVisibleBranchIds(context);

    if (visibleBranchIds && visibleBranchIds.length === 0) {
      return reply.send({
        ok: true,
        staff: [],
      });
    }

    const params = visibleBranchIds
      ? [context.business.id, visibleBranchIds]
      : [context.business.id];

    const result = await query<DbStaffListRow>(
      `
        select
          u.id,
          u.full_name,
          u.email::text as email,
          u.phone,
          u.status,
          u.created_at,
          b.id as branch_id,
          b.name as branch_name,
          b.is_main,
          bmr.role
        from business_members bm
        inner join users u on u.id = bm.user_id
        left join branch_memberships brm
          on brm.user_id = u.id
          and brm.business_id = bm.business_id
          and brm.status = 'active'
          ${visibleBranchIds ? "and brm.branch_id = any($2::uuid[])" : ""}
        left join branches b
          on b.id = brm.branch_id
          and b.business_id = bm.business_id
          and b.status = 'active'
        left join branch_member_roles bmr
          on bmr.user_id = u.id
          and bmr.business_id = bm.business_id
          and bmr.branch_id = b.id
        where bm.business_id = $1
          and bm.member_type = 'STAFF'
          ${
            visibleBranchIds
              ? `
                and exists (
                  select 1
                  from branch_memberships scope_bm
                  where scope_bm.business_id = bm.business_id
                    and scope_bm.user_id = u.id
                    and scope_bm.status = 'active'
                    and scope_bm.branch_id = any($2::uuid[])
                )
              `
              : ""
          }
        order by u.created_at desc, b.is_main desc, b.name asc, bmr.role asc
      `,
      params,
    );

    return reply.send({
      ok: true,
      staff: groupStaffRows(result.rows),
    });
  });

  app.get("/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (!contextHasPermission(context, "STAFF_VIEW")) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to view staff.",
      });
    }

    const params = request.params as { id: string };
    const staff = await getStaffById(
      context.business.id,
      params.id,
      getVisibleBranchIds(context),
    );

    if (!staff) {
      return reply.code(404).send({
        ok: false,
        message: "Staff member was not found.",
      });
    }

    return reply.send({
      ok: true,
      staff,
    });
  });

  app.post("/", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (
      !contextHasPermission(context, "STAFF_CREATE") ||
      !contextHasPermission(context, "STAFF_ASSIGN_BRANCH") ||
      !contextHasPermission(context, "STAFF_ASSIGN_ROLE")
    ) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to create staff.",
      });
    }

    const input = createStaffSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const branchIds = input.locationAssignments.map((item) => item.branchId);
    const uniqueBranchIds = [...new Set(branchIds)];

    const branchesExist = await ensureBranchesExist(
      context.business.id,
      uniqueBranchIds,
    );

    if (!branchesExist) {
      return reply.code(400).send({
        ok: false,
        message: "One or more locations could not be found.",
      });
    }

    for (const branchId of uniqueBranchIds) {
      if (!contextCanAccessBranch(context, branchId)) {
        return reply.code(403).send({
          ok: false,
          message: "You cannot assign staff to a location you cannot access.",
        });
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await transaction(async (client) => {
      const existingUser = await client.query(
        `
          select id
          from users
          where email = $1
          limit 1
        `,
        [email],
      );

      if (existingUser.rowCount && existingUser.rowCount > 0) {
        return {
          type: "email_taken" as const,
        };
      }

      const userResult = await client.query<DbStaffUser>(
        `
          insert into users (
            full_name,
            email,
            phone,
            password_hash,
            status
          )
          values ($1, $2, $3, $4, 'active')
          returning id, full_name, email::text as email, phone, status, created_at
        `,
        [input.fullName, email, input.phone || null, passwordHash],
      );

      const staff = requireRow(userResult.rows[0], "Created staff member");

      await client.query(
        `
          insert into business_members (
            business_id,
            user_id,
            member_type,
            status
          )
          values ($1, $2, 'STAFF', 'active')
        `,
        [context.business.id, staff.id],
      );

      for (const assignment of input.locationAssignments) {
        await client.query(
          `
            insert into branch_memberships (
              business_id,
              branch_id,
              user_id,
              status
            )
            values ($1, $2, $3, 'active')
            on conflict (business_id, branch_id, user_id)
            do update set status = 'active'
          `,
          [context.business.id, assignment.branchId, staff.id],
        );

        for (const role of assignment.roles) {
          await client.query(
            `
              insert into branch_member_roles (
                business_id,
                branch_id,
                user_id,
                role
              )
              values ($1, $2, $3, $4)
              on conflict (business_id, branch_id, user_id, role)
              do nothing
            `,
            [context.business.id, assignment.branchId, staff.id, role],
          );
        }
      }

      await client.query(
        `
          insert into activity_events (
            business_id,
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values ($1, $2, 'staff', $3, 'STAFF_CREATED', $4::jsonb)
        `,
        [
          context.business.id,
          context.user.id,
          staff.id,
          JSON.stringify({
            fullName: staff.full_name,
            email: staff.email,
            locations: input.locationAssignments,
          }),
        ],
      );

      return {
        type: "created" as const,
        staff,
      };
    });

    if (result.type === "email_taken") {
      return reply.code(409).send({
        ok: false,
        message: "This email is already used.",
      });
    }

    return reply.code(201).send({
      ok: true,
      staff: {
        id: result.staff.id,
        fullName: result.staff.full_name,
        email: result.staff.email,
        phone: result.staff.phone,
        status: result.staff.status,
        createdAt: result.staff.created_at,
      },
    });
  });

  app.patch("/:id", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (!contextHasPermission(context, "STAFF_UPDATE")) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to update staff details.",
      });
    }

    const params = request.params as { id: string };

    if (!(await contextCanManageStaffMember(context, params.id))) {
      return reply.code(403).send({
        ok: false,
        message: "You cannot update staff outside your assigned location.",
      });
    }

    const input = updateStaffDetailsSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const phone = input.phone?.trim() || null;

    const result = await transaction(async (client) => {
      const staffMember = await client.query(
        `
          select user_id
          from business_members
          where business_id = $1
            and user_id = $2
            and member_type = 'STAFF'
          limit 1
        `,
        [context.business.id, params.id],
      );

      if (!staffMember.rowCount) {
        return {
          type: "not_found" as const,
        };
      }

      const emailOwner = await client.query(
        `
          select id
          from users
          where email = $1
            and id <> $2
          limit 1
        `,
        [email, params.id],
      );

      if (emailOwner.rowCount && emailOwner.rowCount > 0) {
        return {
          type: "email_taken" as const,
        };
      }

      const updateResult = await client.query<DbStaffUser>(
        `
          update users
          set full_name = $1,
              email = $2,
              phone = $3
          where id = $4
          returning id, full_name, email::text as email, phone, status, created_at
        `,
        [input.fullName, email, phone, params.id],
      );

      const staff = requireRow(updateResult.rows[0], "Updated staff member");

      await client.query(
        `
          insert into activity_events (
            business_id,
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values ($1, $2, 'staff', $3, 'STAFF_DETAILS_UPDATED', $4::jsonb)
        `,
        [
          context.business.id,
          context.user.id,
          staff.id,
          JSON.stringify({
            fullName: staff.full_name,
            email: staff.email,
            phone: staff.phone,
          }),
        ],
      );

      return {
        type: "updated" as const,
        staff,
      };
    });

    if (result.type === "not_found") {
      return reply.code(404).send({
        ok: false,
        message: "Staff member was not found.",
      });
    }

    if (result.type === "email_taken") {
      return reply.code(409).send({
        ok: false,
        message: "This email is already used.",
      });
    }

    const staff = await getStaffById(
      context.business.id,
      result.staff.id,
      getVisibleBranchIds(context),
    );

    return reply.send({
      ok: true,
      staff,
    });
  });

  app.patch("/:id/password", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (!contextHasPermission(context, "STAFF_RESET_PASSWORD")) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to reset staff password.",
      });
    }

    const params = request.params as { id: string };

    if (!(await contextCanManageStaffMember(context, params.id))) {
      return reply.code(403).send({
        ok: false,
        message:
          "You cannot reset staff access outside your assigned location.",
      });
    }

    const input = resetStaffPasswordSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await transaction(async (client) => {
      const staffMember = await client.query(
        `
          select user_id
          from business_members
          where business_id = $1
            and user_id = $2
            and member_type = 'STAFF'
          limit 1
        `,
        [context.business.id, params.id],
      );

      if (!staffMember.rowCount) {
        return {
          type: "not_found" as const,
        };
      }

      await client.query(
        `
          update users
          set password_hash = $1
          where id = $2
        `,
        [passwordHash, params.id],
      );

      await client.query(
        `
          update sessions
          set status = 'revoked',
              revoked_at = now()
          where user_id = $1
            and status = 'active'
        `,
        [params.id],
      );

      await client.query(
        `
          insert into activity_events (
            business_id,
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values ($1, $2, 'staff', $3, 'STAFF_PASSWORD_RESET', '{}'::jsonb)
        `,
        [context.business.id, context.user.id, params.id],
      );

      return {
        type: "reset" as const,
      };
    });

    if (result.type === "not_found") {
      return reply.code(404).send({
        ok: false,
        message: "Staff member was not found.",
      });
    }

    return reply.send({
      ok: true,
    });
  });

  app.patch("/:id/status", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (!contextHasPermission(context, "STAFF_DISABLE")) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to change staff status.",
      });
    }

    const params = request.params as { id: string };

    if (!(await contextCanManageStaffMember(context, params.id))) {
      return reply.code(403).send({
        ok: false,
        message:
          "You cannot change staff status outside your assigned location.",
      });
    }

    const input = updateStaffStatusSchema.parse(request.body);

    const result = await query<DbStaffUser>(
      `
        update users u
        set status = $1
        from business_members bm
        where bm.user_id = u.id
          and bm.business_id = $2
          and bm.member_type = 'STAFF'
          and u.id = $3
        returning u.id, u.full_name, u.email::text as email, u.phone, u.status, u.created_at
      `,
      [input.status, context.business.id, params.id],
    );

    const staff = result.rows[0];

    if (!staff) {
      return reply.code(404).send({
        ok: false,
        message: "Staff member was not found.",
      });
    }

    await query(
      `
        insert into activity_events (
          business_id,
          actor_user_id,
          entity_type,
          entity_id,
          action,
          metadata
        )
        values ($1, $2, 'staff', $3, 'STAFF_STATUS_CHANGED', $4::jsonb)
      `,
      [
        context.business.id,
        context.user.id,
        staff.id,
        JSON.stringify({
          status: staff.status,
        }),
      ],
    );

    return reply.send({
      ok: true,
      staff: {
        id: staff.id,
        fullName: staff.full_name,
        email: staff.email,
        phone: staff.phone,
        status: staff.status,
        createdAt: staff.created_at,
      },
    });
  });

  app.post("/:id/location-roles", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (
      !contextHasPermission(context, "STAFF_ASSIGN_BRANCH") ||
      !contextHasPermission(context, "STAFF_ASSIGN_ROLE")
    ) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to assign staff responsibilities.",
      });
    }

    const params = request.params as { id: string };
    const input = assignStaffLocationRolesSchema.parse(request.body);

    if (!(await contextCanManageStaffMember(context, params.id))) {
      return reply.code(403).send({
        ok: false,
        message:
          "You cannot assign responsibilities to staff outside your assigned location.",
      });
    }

    if (!contextCanAccessBranch(context, input.branchId)) {
      return reply.code(403).send({
        ok: false,
        message: "You cannot assign staff to a location you cannot access.",
      });
    }

    const branchesExist = await ensureBranchesExist(context.business.id, [
      input.branchId,
    ]);

    if (!branchesExist) {
      return reply.code(400).send({
        ok: false,
        message: "Location could not be found.",
      });
    }

    const result = await transaction(async (client) => {
      const staffMember = await client.query(
        `
          select user_id
          from business_members
          where business_id = $1
            and user_id = $2
            and member_type = 'STAFF'
          limit 1
        `,
        [context.business.id, params.id],
      );

      if (!staffMember.rowCount) {
        return {
          type: "not_found" as const,
        };
      }

      await client.query(
        `
          insert into branch_memberships (
            business_id,
            branch_id,
            user_id,
            status
          )
          values ($1, $2, $3, 'active')
          on conflict (business_id, branch_id, user_id)
          do update set status = 'active'
        `,
        [context.business.id, input.branchId, params.id],
      );

      for (const role of input.roles) {
        await client.query(
          `
            insert into branch_member_roles (
              business_id,
              branch_id,
              user_id,
              role
            )
            values ($1, $2, $3, $4)
            on conflict (business_id, branch_id, user_id, role)
            do nothing
          `,
          [context.business.id, input.branchId, params.id, role],
        );
      }

      await client.query(
        `
          insert into activity_events (
            business_id,
            branch_id,
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values ($1, $2, $3, 'staff', $4, 'STAFF_LOCATION_ROLES_ASSIGNED', $5::jsonb)
        `,
        [
          context.business.id,
          input.branchId,
          context.user.id,
          params.id,
          JSON.stringify({
            roles: input.roles,
          }),
        ],
      );

      return {
        type: "assigned" as const,
      };
    });

    if (result.type === "not_found") {
      return reply.code(404).send({
        ok: false,
        message: "Staff member was not found.",
      });
    }

    return reply.send({
      ok: true,
    });
  });

  app.delete("/:id/location-roles", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    if (
      !contextHasPermission(context, "STAFF_REMOVE_FROM_BRANCH") ||
      !contextHasPermission(context, "STAFF_REMOVE_ROLE")
    ) {
      return reply.code(403).send({
        ok: false,
        message: "You do not have access to remove staff responsibilities.",
      });
    }

    const params = request.params as { id: string };
    const input = removeStaffLocationRolesSchema.parse(request.body);

    if (!(await contextCanManageStaffMember(context, params.id))) {
      return reply.code(403).send({
        ok: false,
        message:
          "You cannot remove responsibilities from staff outside your assigned location.",
      });
    }

    if (!contextCanAccessBranch(context, input.branchId)) {
      return reply.code(403).send({
        ok: false,
        message:
          "You cannot change staff access for a location you cannot access.",
      });
    }

    const result = await transaction(async (client) => {
      const staffMember = await client.query(
        `
          select user_id
          from business_members
          where business_id = $1
            and user_id = $2
            and member_type = 'STAFF'
          limit 1
        `,
        [context.business.id, params.id],
      );

      if (!staffMember.rowCount) {
        return {
          type: "not_found" as const,
        };
      }

      if (input.roles && input.roles.length > 0) {
        await client.query(
          `
            delete from branch_member_roles
            where business_id = $1
              and branch_id = $2
              and user_id = $3
              and role = any($4::text[])
          `,
          [context.business.id, input.branchId, params.id, input.roles],
        );

        const remainingRoles = await client.query(
          `
            select 1
            from branch_member_roles
            where business_id = $1
              and branch_id = $2
              and user_id = $3
            limit 1
          `,
          [context.business.id, input.branchId, params.id],
        );

        if (!remainingRoles.rowCount) {
          await client.query(
            `
              update branch_memberships
              set status = 'inactive'
              where business_id = $1
                and branch_id = $2
                and user_id = $3
            `,
            [context.business.id, input.branchId, params.id],
          );
        }
      } else {
        await client.query(
          `
            delete from branch_member_roles
            where business_id = $1
              and branch_id = $2
              and user_id = $3
          `,
          [context.business.id, input.branchId, params.id],
        );

        await client.query(
          `
            update branch_memberships
            set status = 'inactive'
            where business_id = $1
              and branch_id = $2
              and user_id = $3
          `,
          [context.business.id, input.branchId, params.id],
        );
      }

      await client.query(
        `
          insert into activity_events (
            business_id,
            branch_id,
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values ($1, $2, $3, 'staff', $4, 'STAFF_LOCATION_ROLES_REMOVED', $5::jsonb)
        `,
        [
          context.business.id,
          input.branchId,
          context.user.id,
          params.id,
          JSON.stringify({
            roles: input.roles || "all",
          }),
        ],
      );

      return {
        type: "removed" as const,
      };
    });

    if (result.type === "not_found") {
      return reply.code(404).send({
        ok: false,
        message: "Staff member was not found.",
      });
    }

    return reply.send({
      ok: true,
    });
  });
}
