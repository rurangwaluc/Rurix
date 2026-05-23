import { env } from "@rurix/config";
import pg from "pg";

const { Pool } = pg;

export type DbRow = pg.QueryResultRow;

const poolConfig: pg.PoolConfig = {
  connectionString: env.DATABASE_URL,
};

if (env.DATABASE_SSL === "true") {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

export const pool = new Pool(poolConfig);

export async function query<T extends DbRow = DbRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
