type QueryRunner = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

type CounterRow = {
  last_number: number | string;
};

function yyyymmdd() {
  const date = new Date();

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function isCounterRow(value: unknown): value is CounterRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "last_number" in value &&
    (typeof value.last_number === "number" ||
      typeof value.last_number === "string")
  );
}

export async function generateBusinessNumber(input: {
  runner: QueryRunner;
  businessId: string;
  prefix: string;
  counterName: string;
}) {
  const dateKey = yyyymmdd();
  const counterKey = `${input.counterName}:${dateKey}`;

  const result = await input.runner.query(
    `
      insert into business_number_counters (
        business_id,
        counter_key,
        last_number
      )
      values ($1, $2, 1)
      on conflict (business_id, counter_key)
      do update set
        last_number = business_number_counters.last_number + 1,
        updated_at = now()
      returning last_number
    `,
    [input.businessId, counterKey],
  );

  const row = result.rows[0];
  const lastNumber = isCounterRow(row) ? Number(row.last_number) : 1;
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber : 1;
  const padded = String(nextNumber).padStart(6, "0");

  return `${input.prefix}-${dateKey}-${padded}`;
}
