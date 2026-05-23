import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { isProduction } from "@rurix/config";
import { query, transaction, type DbRow } from "@rurix/db";
import { loginSchema, registerOwnerSchema } from "@rurix/schemas";
import { normalizeEmail } from "@rurix/utils";
import { getCurrentUserContext } from "./auth.context";

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

type DbUserWithPassword = DbUser & {
  password_hash: string;
};

type DbBusinessProfile = DbRow & {
  id: string;
  name: string;
  legal_name: string | null;
  business_type: string;
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

type DbDevice = DbRow & {
  id: string;
  device_key: string;
};

type DbCreatedSession = DbRow & {
  id: string;
  expires_at: Date;
};

const sessionCookieName = "rurix_session";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned by the database.`);
  }

  return row;
}

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(sessionCookieName, {
    path: "/",
  });
}

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

export async function authRoutes(app: FastifyInstance) {
  app.post("/register-owner", async (request, reply) => {
    const input = registerOwnerSchema.parse(request.body);

    const email = normalizeEmail(input.ownerEmail);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await transaction(async (client) => {
      const existingBusiness = await client.query(
        `
          select id
          from business_profile
          limit 1
        `,
      );

      if (existingBusiness.rowCount && existingBusiness.rowCount > 0) {
        return {
          type: "already_configured" as const,
        };
      }

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

      const businessInsert = await client.query<DbBusinessProfile>(
        `
          insert into business_profile (
            name,
            legal_name,
            business_type,
            status
          )
          values ($1, $2, $3, 'active')
          returning id, name, legal_name, business_type, status
        `,
        [input.businessName, input.legalName || null, input.businessType],
      );

      const business = requireRow(
        businessInsert.rows[0],
        "Created business profile",
      );

      const branchInsert = await client.query<DbBranch>(
        `
          insert into branches (
            business_id,
            name,
            code,
            is_main,
            status
          )
          values ($1, $2, 'MAIN', true, 'active')
          returning id, name, code, is_main, status, address
        `,
        [business.id, input.mainBranchName],
      );

      const mainBranch = requireRow(
        branchInsert.rows[0],
        "Created main branch",
      );

      const userInsert = await client.query<DbUser>(
        `
          insert into users (
            full_name,
            email,
            phone,
            password_hash,
            status
          )
          values ($1, $2, $3, $4, 'active')
          returning id, full_name, email::text as email, phone, status
        `,
        [input.ownerFullName, email, input.ownerPhone || null, passwordHash],
      );

      const user = requireRow(userInsert.rows[0], "Created primary owner");

      await client.query(
        `
          insert into business_members (
            business_id,
            user_id,
            member_type,
            status
          )
          values ($1, $2, 'PRIMARY_OWNER', 'active')
        `,
        [business.id, user.id],
      );

      await client.query(
        `
          insert into branch_memberships (
            business_id,
            branch_id,
            user_id,
            status
          )
          values ($1, $2, $3, 'active')
        `,
        [business.id, mainBranch.id, user.id],
      );

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
          values ($1, $2, $3, 'business_profile', $1, 'PRIMARY_OWNER_REGISTERED', $4::jsonb)
        `,
        [
          business.id,
          mainBranch.id,
          user.id,
          JSON.stringify({
            businessName: business.name,
            mainBranchName: mainBranch.name,
          }),
        ],
      );

      return {
        type: "created" as const,
        business,
        mainBranch,
        user,
      };
    });

    if (result.type === "already_configured") {
      return reply.code(409).send({
        ok: false,
        message:
          "Rurix is already configured for this business. Use login instead.",
      });
    }

    if (result.type === "email_taken") {
      return reply.code(409).send({
        ok: false,
        message: "This email is already used.",
      });
    }

    return reply.code(201).send({
      ok: true,
      business: result.business,
      mainBranch: result.mainBranch,
      user: {
        id: result.user.id,
        fullName: result.user.full_name,
        email: result.user.email,
        phone: result.user.phone,
        status: result.user.status,
      },
    });
  });

  app.post("/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const email = normalizeEmail(input.email);

    const userResult = await query<DbUserWithPassword>(
      `
        select id, full_name, email::text as email, phone, password_hash, status
        from users
        where email = $1
        limit 1
      `,
      [email],
    );

    const user = userResult.rows[0];

    if (!user || user.status !== "active") {
      return reply.code(401).send({
        ok: false,
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      return reply.code(401).send({
        ok: false,
        message: "Invalid email or password.",
      });
    }

    const deviceKey = input.deviceKey || `server_${randomUUID()}`;

    const loginResult = await transaction(async (client) => {
      const deviceResult = await client.query<DbDevice>(
        `
          insert into devices (
            user_id,
            device_key,
            device_name,
            platform,
            last_seen_at
          )
          values ($1, $2, $3, $4, now())
          on conflict (device_key)
          do update set
            last_seen_at = now(),
            device_name = excluded.device_name,
            platform = excluded.platform
          returning id, device_key
        `,
        [user.id, deviceKey, input.deviceName || null, input.platform || null],
      );

      const device = requireRow(deviceResult.rows[0], "Login device");

      const sessionResult = await client.query<DbCreatedSession>(
        `
          insert into sessions (
            user_id,
            device_id,
            status,
            expires_at
          )
          values ($1, $2, 'active', now() + interval '7 days')
          returning id, expires_at
        `,
        [user.id, device.id],
      );

      const session = requireRow(sessionResult.rows[0], "Login session");

      await client.query(
        `
          update users
          set last_login_at = now()
          where id = $1
        `,
        [user.id],
      );

      await client.query(
        `
          insert into activity_events (
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values ($1, 'session', $2, 'USER_LOGGED_IN', $3::jsonb)
        `,
        [
          user.id,
          session.id,
          JSON.stringify({
            deviceId: device.id,
            deviceKey: device.device_key,
          }),
        ],
      );

      return {
        device,
        session,
      };
    });

    const token = await reply.jwtSign(
      {
        userId: user.id,
        sessionId: loginResult.session.id,
        deviceId: loginResult.device.id,
      },
      {
        expiresIn: "7d",
      },
    );

    setSessionCookie(reply, token);

    return reply.send({
      ok: true,
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
      },
      session: {
        id: loginResult.session.id,
        expiresAt: loginResult.session.expires_at,
      },
      device: {
        id: loginResult.device.id,
        key: loginResult.device.device_key,
      },
    });
  });

  app.post("/logout", async (request, reply) => {
    const payload = await readAuthPayload(app, request);

    if (payload) {
      await query(
        `
          update sessions
          set status = 'revoked',
              revoked_at = now()
          where id = $1
            and user_id = $2
        `,
        [payload.sessionId, payload.userId],
      );
    }

    clearSessionCookie(reply);

    return reply.send({
      ok: true,
    });
  });

  app.get("/me", async (request, reply) => {
    const context = await getCurrentUserContext(app, request);

    if (!context) {
      return reply.code(401).send({
        ok: false,
        message: "Not authenticated.",
      });
    }

    return reply.send({
      ok: true,
      user: {
        id: context.user.id,
        fullName: context.user.full_name,
        email: context.user.email,
        phone: context.user.phone,
        status: context.user.status,
      },
      business: context.business,
      membership: {
        memberType: context.membership.member_type,
        status: context.membership.status,
        permissions: context.businessPermissions,
      },
      branches: context.branches,
    });
  });
}
