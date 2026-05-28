import { env, isProduction } from "@rurix/config";

import Fastify from "fastify";
import { authRoutes } from "./modules/auth/auth.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { locationsRoutes } from "./modules/locations/locations.routes";
import { purchaseOrdersRoutes } from "./modules/purchase-orders/purchase-orders.routes";
import { staffRoutes } from "./modules/staff/staff.routes";
import { stockRoutes } from "./modules/stock/stock.routes";
import { stockTransfersRoutes } from "./modules/stock-transfers/stock-transfers.routes";
import { suppliersRoutes } from "./modules/suppliers/suppliers.routes";

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

  await app.register(catalogRoutes, {
    prefix: "/catalog",
  });

  await app.register(stockRoutes, {
    prefix: "/stock",
  });

  await app.register(stockTransfersRoutes, {
    prefix: "/stock-transfers",
  });

  await app.register(suppliersRoutes, {
    prefix: "/suppliers",
  });

  await app.register(purchaseOrdersRoutes, {
    prefix: "/purchase-orders",
  });

  await app.register(locationsRoutes, {
    prefix: "/locations",
  });

  app.addHook("onClose", async () => {
    if (isProduction) {
      app.log.info("Rurix API shutting down");
    }
  });

  return app;
}
