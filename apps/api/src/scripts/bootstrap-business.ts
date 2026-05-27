import "dotenv/config";
import bcrypt from "bcryptjs";
import { query, transaction, type DbRow } from "@rurix/db";
import { normalizeEmail } from "@rurix/utils";
import { generateBusinessNumber } from "../lib/business-numbering";

type BusinessType = "product" | "service" | "product_and_service";

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

type DbUser = DbRow & {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
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

function normalizePhone(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("2507") && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith("07") && digits.length === 10) {
    return `25${digits}`;
  }

  if (digits.startsWith("7") && digits.length === 9) {
    return `250${digits}`;
  }

  return digits;
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
    "BOOTSTRAP_BUSINESS_TYPE must be one of: product, service, product_and_service",
  );
}

function assertStrongEnoughPassword(password: string) {
  if (password.length < 8) {
    throw new Error("BOOTSTRAP_OWNER_PASSWORD must be at least 8 characters.");
  }
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned by the database.`);
  }

  return row;
}

async function main() {
  const businessName = readRequiredEnv("BOOTSTRAP_BUSINESS_NAME");
  const legalName = readOptionalEnv("BOOTSTRAP_LEGAL_NAME");
  const businessType = parseBusinessType(
    readRequiredEnv("BOOTSTRAP_BUSINESS_TYPE"),
  );

  const ownerFullName = readRequiredEnv("BOOTSTRAP_OWNER_NAME");
  const ownerEmail = normalizeEmail(readRequiredEnv("BOOTSTRAP_OWNER_EMAIL"));
  const ownerPhone = normalizePhone(readOptionalEnv("BOOTSTRAP_OWNER_PHONE"));
  const ownerPassword = readRequiredEnv("BOOTSTRAP_OWNER_PASSWORD");

  const mainLocationName = readRequiredEnv("BOOTSTRAP_MAIN_LOCATION_NAME");
  const mainLocationCode = readOptionalEnv("BOOTSTRAP_MAIN_LOCATION_CODE");
  const mainLocationAddress = readOptionalEnv(
    "BOOTSTRAP_MAIN_LOCATION_ADDRESS",
  );

  assertStrongEnoughPassword(ownerPassword);

  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  const result = await transaction(async (client) => {
    const existingBusiness = await client.query<{ id: string; name: string }>(
      `
        select id, name
        from business_profile
        limit 1
      `,
    );

    if (existingBusiness.rows[0]) {
      throw new Error(
        `This Rurix deployment already has a business: ${existingBusiness.rows[0].name}. Rurix is one business per deployment.`,
      );
    }

    const existingEmail = await client.query<{ id: string }>(
      `
        select id
        from users
        where email = $1
        limit 1
      `,
      [ownerEmail],
    );

    if (existingEmail.rows[0]) {
      throw new Error("This owner email is already used.");
    }

    if (ownerPhone) {
      const existingPhone = await client.query<{ id: string }>(
        `
          select id
          from users
          where phone = $1
          limit 1
        `,
        [ownerPhone],
      );

      if (existingPhone.rows[0]) {
        throw new Error("This owner phone number is already used.");
      }
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
      [businessName, legalName, businessType],
    );

    const business = requireRow(
      businessInsert.rows[0],
      "Created business profile",
    );

    const runner = {
      query: client.query.bind(client),
    };

    const locationCode =
      mainLocationCode ||
      (await generateBusinessNumber({
        runner,
        businessId: business.id,
        prefix: "LOC",
        counterName: "location",
      }));

    const branchInsert = await client.query<DbBranch>(
      `
        insert into branches (
          business_id,
          name,
          code,
          address,
          is_main,
          status
        )
        values ($1, $2, $3, $4, true, 'active')
        returning id, name, code, is_main, status, address
      `,
      [business.id, mainLocationName, locationCode, mainLocationAddress],
    );

    const mainBranch = requireRow(
      branchInsert.rows[0],
      "Created main location",
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
      [ownerFullName, ownerEmail, ownerPhone, passwordHash],
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
        values ($1, $2, $3, 'business_profile', $1, 'BUSINESS_BOOTSTRAPPED', $4::jsonb)
      `,
      [
        business.id,
        mainBranch.id,
        user.id,
        JSON.stringify({
          businessName: business.name,
          businessType: business.business_type,
          ownerEmail: user.email,
          mainLocationName: mainBranch.name,
          mainLocationCode: mainBranch.code,
          source: "developer_script",
        }),
      ],
    );

    return {
      business,
      mainBranch,
      user,
    };
  });

  console.log("");
  console.log("✅ Rurix business bootstrapped successfully");
  console.log("");
  console.log(`Business: ${result.business.name}`);
  console.log(`Business ID: ${result.business.id}`);
  console.log(`Business type: ${result.business.business_type}`);
  console.log("");
  console.log(`Owner: ${result.user.full_name}`);
  console.log(`Owner email: ${result.user.email}`);
  console.log(`Owner phone: ${result.user.phone || "Not set"}`);
  console.log("");
  console.log(`Main location: ${result.mainBranch.name}`);
  console.log(`Main location code: ${result.mainBranch.code || "Not set"}`);
  console.log("");
  console.log(
    "Owner can now sign in with the temporary password you provided.",
  );
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("❌ Bootstrap failed");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  process.exit(1);
});
