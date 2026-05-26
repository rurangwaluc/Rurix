import type { FastifyInstance, FastifyRequest } from "fastify";
import { query, type DbRow } from "@rurix/db";
import type { BranchRole, BusinessMemberType, Permission } from "@rurix/domain";
import { getPermissionsForAccess, hasPermission } from "@rurix/permissions";

type AuthTokenPayload = {
  userId: string;
  sessionId: string;
  deviceId: string;
};

type DbUser = DbRow & {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
};

type DbBusinessProfile = DbRow & {
  id: string;
  name: string;
  legal_name: string | null;
  business_type: string;
  status: string;
};

type DbMembership = DbRow & {
  business_id: string;
  member_type: BusinessMemberType;
  status: string;
};

type DbBranch = DbRow & {
  id: string;
  name: string;
  code: string | null;
  is_main: boolean;
  status: string;
  address: string | null;
};

type DbBranchRoleRow = DbRow & {
  branch_id: string;
  role: BranchRole;
};

type DbSession = DbRow & {
  id: string;
  user_id: string;
  device_id: string | null;
  status: string;
  expires_at: Date;
};

const sessionCookieName = "rurix_session";
const ownerMemberTypes = new Set<BusinessMemberType>([
  "PRIMARY_OWNER",
  "OWNER",
]);

async function getTokenFromRequest(request: FastifyRequest) {
  const cookieToken = request.cookies[sessionCookieName];

  if (cookieToken) {
    return cookieToken;
  }

  const authorization = request.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return null;
}

async function readAuthPayload(app: FastifyInstance, request: FastifyRequest) {
  const token = await getTokenFromRequest(request);

  if (!token) {
    return null;
  }

  try {
    return app.jwt.verify<AuthTokenPayload>(token);
  } catch {
    return null;
  }
}

export async function getCurrentUserContext(
  app: FastifyInstance,
  request: FastifyRequest,
) {
  const payload = await readAuthPayload(app, request);

  if (!payload) {
    return null;
  }

  const sessionResult = await query<DbSession>(
    `
      select id, user_id, device_id, status, expires_at
      from sessions
      where id = $1
        and user_id = $2
        and status = 'active'
        and expires_at > now()
      limit 1
    `,
    [payload.sessionId, payload.userId],
  );

  const session = sessionResult.rows[0];

  if (!session) {
    return null;
  }

  const userResult = await query<DbUser>(
    `
      select id, full_name, email::text as email, phone, status
      from users
      where id = $1
      limit 1
    `,
    [payload.userId],
  );

  const user = userResult.rows[0];

  if (!user || user.status !== "active") {
    return null;
  }

  const membershipResult = await query<DbMembership>(
    `
      select business_id, member_type, status
      from business_members
      where user_id = $1
        and status = 'active'
      limit 1
    `,
    [user.id],
  );

  const membership = membershipResult.rows[0];

  if (!membership) {
    return null;
  }

  const businessResult = await query<DbBusinessProfile>(
    `
      select id, name, legal_name, business_type, status
      from business_profile
      where id = $1
      limit 1
    `,
    [membership.business_id],
  );

  const business = businessResult.rows[0];

  if (!business || business.status !== "active") {
    return null;
  }

  const isOwner = ownerMemberTypes.has(membership.member_type);

  const branchesResult = await query<DbBranch>(
    isOwner
      ? `
          select id, name, code, is_main, status, address
          from branches
          where business_id = $1
            and status = 'active'
          order by is_main desc, name asc
        `
      : `
          select b.id, b.name, b.code, b.is_main, b.status, b.address
          from branches b
          inner join branch_memberships bm on bm.branch_id = b.id
          where bm.user_id = $1
            and bm.business_id = $2
            and bm.status = 'active'
            and b.status = 'active'
          order by b.is_main desc, b.name asc
        `,
    isOwner ? [membership.business_id] : [user.id, membership.business_id],
  );

  const roleRowsResult = await query<DbBranchRoleRow>(
    `
      select branch_id, role
      from branch_member_roles
      where user_id = $1
        and business_id = $2
    `,
    [user.id, membership.business_id],
  );

  const rolesByBranch = new Map<string, BranchRole[]>();

  for (const row of roleRowsResult.rows) {
    const existing = rolesByBranch.get(row.branch_id) || [];
    existing.push(row.role);
    rolesByBranch.set(row.branch_id, existing);
  }

  const branches = branchesResult.rows.map((branch) => {
    const branchRoles = rolesByBranch.get(branch.id) || [];
    const permissions = getPermissionsForAccess({
      memberType: membership.member_type,
      branchRoles,
    });

    return {
      ...branch,
      roles: branchRoles,
      permissions,
    };
  });

  const businessPermissions = getPermissionsForAccess({
    memberType: membership.member_type,
    branchRoles: [],
  });

  const allPermissions = new Set<Permission>(businessPermissions);

  for (const branch of branches) {
    for (const permission of branch.permissions) {
      allPermissions.add(permission);
    }
  }

  return {
    session,
    user,
    business,
    membership,
    branches,
    businessPermissions,
    allPermissions: [...allPermissions],
  };
}

export async function requireAuth(
  app: FastifyInstance,
  request: FastifyRequest,
) {
  const context = await getCurrentUserContext(app, request);

  if (!context) {
    return null;
  }

  return context;
}

export function contextIsOwner(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>,
) {
  if (!context) {
    return false;
  }

  return ownerMemberTypes.has(context.membership.member_type);
}

export function contextHasPermission(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>,
  permission: Permission,
) {
  if (!context) {
    return false;
  }

  return hasPermission(context.allPermissions, permission);
}

export function contextCanAccessBranch(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>,
  branchId: string,
) {
  if (!context) {
    return false;
  }

  if (contextIsOwner(context)) {
    return true;
  }

  return context.branches.some((branch) => branch.id === branchId);
}

export function getContextBranchIds(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>,
) {
  if (!context) {
    return [];
  }

  return context.branches.map((branch) => branch.id);
}
