import "dotenv/config";

import { createApp } from "./app";
import { env } from "@rurix/config";

const app = await createApp();

try {
  await app.listen({
    port: Number(env.PORT),
    host: env.HOST,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
