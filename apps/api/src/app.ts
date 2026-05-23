import { env, isProduction } from "@rurix/config";

import Fastify from "fastify";
import { authRoutes } from "./modules/auth/auth.routes";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { staffRoutes } from "./modules/staff/staff.routes";

export async function createApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN || true,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "rurix_session",
      signed: false,
    },
  });

  app.get("/health", async () => {
    return {
      ok: true,
      service: "rurix-api",
    };
  });

  await app.register(authRoutes, {
    prefix: "/auth",
  });

  await app.register(staffRoutes, {
    prefix: "/staff",
  });

  app.addHook("onClose", async () => {
    if (isProduction) {
      app.log.info("Rurix API shutting down");
    }
  });

  return app;
}
