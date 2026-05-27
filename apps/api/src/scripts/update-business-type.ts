import "dotenv/config";
import { transaction, type DbRow } from "@rurix/db";

type BusinessType = "product" | "service" | "product_and_service";

type DbBusiness = DbRow & {
  id: string;
  name: string;
  business_type: BusinessType;
};

type CountRow = DbRow & {
  count: string;
};

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }

  return value;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value || null;
}

function parseBusinessType(value: string): BusinessType {
  if (
    value === "product" ||
    value === "service" ||
    value === "product_and_service"
  ) {
    return value;
  }

  throw new Error(
    "TARGET_BUSINESS_TYPE must be one of: product, service, product_and_service",
  );
}

function toCount(row: CountRow | undefined) {
  return Number(row?.count || 0);
}

async function main() {
  const businessId = readOptionalEnv("TARGET_BUSINESS_ID");
  const businessName = readOptionalEnv("TARGET_BUSINESS_NAME");
  const targetBusinessType = parseBusinessType(
    readRequiredEnv("TARGET_BUSINESS_TYPE"),
  );

  if (!businessId && !businessName) {
    throw new Error(
      "Provide TARGET_BUSINESS_ID or TARGET_BUSINESS_NAME so the script knows which business to update.",
    );
  }

  const result = await transaction(async (client) => {
    const businessResult = businessId
      ? await client.query<DbBusiness>(
          `
            select id, name, business_type
            from business_profile
            where id = $1
            limit 1
          `,
          [businessId],
        )
      : await client.query<DbBusiness>(
          `
            select id, name, business_type
            from business_profile
            where lower(name) = lower($1)
            limit 1
          `,
          [businessName],
        );

    const business = businessResult.rows[0];

    if (!business) {
      throw new Error("Business was not found.");
    }

    if (business.business_type === targetBusinessType) {
      return {
        changed: false,
        business,
        targetBusinessType,
        productCount: 0,
        serviceCount: 0,
        stockRecordCount: 0,
      };
    }

    const productResult = await client.query<CountRow>(
      `
        select count(*)::text as count
        from catalog_items
        where business_id = $1
          and item_kind = 'PRODUCT'
      `,
      [business.id],
    );

    const serviceResult = await client.query<CountRow>(
      `
        select count(*)::text as count
        from catalog_items
        where business_id = $1
          and item_kind = 'SERVICE'
      `,
      [business.id],
    );

    const stockResult = await client.query<CountRow>(
      `
        select count(*)::text as count
        from branch_item_stock
        where business_id = $1
      `,
      [business.id],
    );

    const productCount = toCount(productResult.rows[0]);
    const serviceCount = toCount(serviceResult.rows[0]);
    const stockRecordCount = toCount(stockResult.rows[0]);

    assertSafeBusinessTypeChange({
      currentBusinessType: business.business_type,
      targetBusinessType,
      productCount,
      serviceCount,
      stockRecordCount,
    });

    const updateResult = await client.query<DbBusiness>(
      `
        update business_profile
        set business_type = $1,
            updated_at = now()
        where id = $2
        returning id, name, business_type
      `,
      [targetBusinessType, business.id],
    );

    const updatedBusiness = updateResult.rows[0];

    if (!updatedBusiness) {
      throw new Error("Business update did not return a row.");
    }

    await client.query(
      `
        insert into activity_events (
          business_id,
          entity_type,
          entity_id,
          action,
          metadata
        )
        values ($1, 'business_profile', $1, 'BUSINESS_TYPE_UPDATED_BY_DEVELOPER', $2::jsonb)
      `,
      [
        business.id,
        JSON.stringify({
          previousBusinessType: business.business_type,
          newBusinessType: targetBusinessType,
          productCount,
          serviceCount,
          stockRecordCount,
          source: "developer_script",
        }),
      ],
    );

    return {
      changed: true,
      business: updatedBusiness,
      previousBusinessType: business.business_type,
      targetBusinessType,
      productCount,
      serviceCount,
      stockRecordCount,
    };
  });

  console.log("");

  if (!result.changed) {
    console.log("✅ No change needed");
    console.log("");
    console.log(`Business: ${result.business.name}`);
    console.log(`Business ID: ${result.business.id}`);
    console.log(`Business type is already: ${result.targetBusinessType}`);
    console.log("");
    return;
  }

  console.log("✅ Business type updated safely");
  console.log("");
  console.log(`Business: ${result.business.name}`);
  console.log(`Business ID: ${result.business.id}`);
  console.log(`Previous type: ${result.previousBusinessType}`);
  console.log(`New type: ${result.targetBusinessType}`);
  console.log("");
  console.log(`Products found: ${result.productCount}`);
  console.log(`Services found: ${result.serviceCount}`);
  console.log(`Stock records found: ${result.stockRecordCount}`);
  console.log("");
  console.log("Log out and log back in so the app reloads the new setup.");
  console.log("");
}

function assertSafeBusinessTypeChange(input: {
  currentBusinessType: BusinessType;
  targetBusinessType: BusinessType;
  productCount: number;
  serviceCount: number;
  stockRecordCount: number;
}) {
  const {
    currentBusinessType,
    targetBusinessType,
    productCount,
    serviceCount,
    stockRecordCount,
  } = input;

  if (currentBusinessType === targetBusinessType) {
    return;
  }

  if (
    currentBusinessType === "product" &&
    targetBusinessType === "product_and_service"
  ) {
    return;
  }

  if (
    currentBusinessType === "service" &&
    targetBusinessType === "product_and_service"
  ) {
    return;
  }

  if (
    currentBusinessType === "product_and_service" &&
    targetBusinessType === "product"
  ) {
    if (serviceCount > 0) {
      throw new Error(
        `Unsafe change blocked. This business has ${serviceCount} service record(s). Remove or archive services before changing to product-only.`,
      );
    }

    return;
  }

  if (
    currentBusinessType === "product_and_service" &&
    targetBusinessType === "service"
  ) {
    if (productCount > 0 || stockRecordCount > 0) {
      throw new Error(
        `Unsafe change blocked. This business has ${productCount} product record(s) and ${stockRecordCount} stock record(s). Remove products and stock records before changing to service-only.`,
      );
    }

    return;
  }

  if (currentBusinessType === "product" && targetBusinessType === "service") {
    if (productCount > 0 || stockRecordCount > 0) {
      throw new Error(
        `Unsafe change blocked. This business has ${productCount} product record(s) and ${stockRecordCount} stock record(s). Remove products and stock records before changing to service-only.`,
      );
    }

    return;
  }

  if (currentBusinessType === "service" && targetBusinessType === "product") {
    if (serviceCount > 0) {
      throw new Error(
        `Unsafe change blocked. This business has ${serviceCount} service record(s). Remove or archive services before changing to product-only.`,
      );
    }

    return;
  }

  throw new Error(
    `Unsafe change blocked from ${currentBusinessType} to ${targetBusinessType}.`,
  );
}

main().catch((error) => {
  console.error("");
  console.error("❌ Business type update failed");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  process.exit(1);
});
