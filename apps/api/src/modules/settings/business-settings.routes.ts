import type { FastifyInstance } from "fastify";
import { query, type DbRow } from "@rurix/db";
import { requireAuth } from "../auth/auth.context";

type TaxMode = "included_in_prices" | "added_on_top" | "no_tax";

type DbBusinessDocumentSettings = DbRow & {
  business_id: string;
  tax_label: string;
  tax_rate_basis_points: number;
  tax_mode: TaxMode;
  show_tax_on_receipts: boolean;
  show_tax_on_invoices: boolean;
  business_tin: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type UpdateDocumentSettingsBody = {
  taxLabel?: unknown;
  taxRatePercent?: unknown;
  taxMode?: unknown;
  showTaxOnReceipts?: unknown;
  showTaxOnInvoices?: unknown;
  businessTin?: unknown;
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();

  return text ? text : null;
}

function parseTaxMode(value: unknown): TaxMode | null {
  if (
    value === "included_in_prices" ||
    value === "added_on_top" ||
    value === "no_tax"
  ) {
    return value;
  }

  return null;
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function parseTaxRateBasisPoints(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (numericValue < 0 || numericValue > 100) {
    return null;
  }

  return Math.round(numericValue * 100);
}

function isOwnerMember(memberType: string) {
  return memberType === "PRIMARY_OWNER" || memberType === "OWNER";
}

function mapDocumentSettings(row: DbBusinessDocumentSettings) {
  return {
    businessId: row.business_id,
    taxLabel: row.tax_label,
    taxRatePercent: row.tax_rate_basis_points / 100,
    taxRateBasisPoints: row.tax_rate_basis_points,
    taxMode: row.tax_mode,
    showTaxOnReceipts: row.show_tax_on_receipts,
    showTaxOnInvoices: row.show_tax_on_invoices,
    businessTin: row.business_tin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOrCreateDocumentSettings(input: {
  businessId: string;
  userId: string;
}) {
  await query(
    `
      insert into business_document_settings (
        business_id,
        tax_label,
        tax_rate_basis_points,
        tax_mode,
        show_tax_on_receipts,
        show_tax_on_invoices,
        created_by_user_id,
        updated_by_user_id
      )
      values ($1, 'VAT', 1800, 'included_in_prices', true, true, $2, $2)
      on conflict (business_id) do nothing
    `,
    [input.businessId, input.userId],
  );

  const result = await query<DbBusinessDocumentSettings>(
    `
      select *
      from business_document_settings
      where business_id = $1
      limit 1
    `,
    [input.businessId],
  );

  return result.rows[0] || null;
}

export async function businessSettingsRoutes(app: FastifyInstance) {
  app.get("/document", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    const settings = await getOrCreateDocumentSettings({
      businessId: context.business.id,
      userId: context.user.id,
    });

    if (!settings) {
      return reply.status(500).send({
        ok: false,
        message: "Could not load document settings.",
      });
    }

    return {
      ok: true,
      settings: mapDocumentSettings(settings),
    };
  });

  app.patch("/document", async (request, reply) => {
    const context = await requireAuth(app, request);

    if (!context) {
      return reply.status(401).send({
        ok: false,
        message: "Please sign in again.",
      });
    }

    if (!isOwnerMember(context.membership.memberType)) {
      return reply.status(403).send({
        ok: false,
        message: "Only the owner can update document and tax settings.",
      });
    }

    const body = (request.body || {}) as UpdateDocumentSettingsBody;

    const taxLabel = cleanText(body.taxLabel);
    const taxMode = parseTaxMode(body.taxMode);
    const taxRateBasisPoints = parseTaxRateBasisPoints(body.taxRatePercent);
    const showTaxOnReceipts = parseBoolean(body.showTaxOnReceipts);
    const showTaxOnInvoices = parseBoolean(body.showTaxOnInvoices);
    const businessTin = cleanText(body.businessTin);

    if (!taxLabel || taxLabel.length > 40) {
      return reply.status(400).send({
        ok: false,
        message: "Add a tax label with 40 characters or fewer.",
      });
    }

    if (!taxMode) {
      return reply.status(400).send({
        ok: false,
        message: "Choose a valid tax mode.",
      });
    }

    if (taxRateBasisPoints === null) {
      return reply.status(400).send({
        ok: false,
        message: "Tax rate must be between 0 and 100.",
      });
    }

    if (showTaxOnReceipts === null) {
      return reply.status(400).send({
        ok: false,
        message: "Choose whether tax should appear on receipts.",
      });
    }

    if (showTaxOnInvoices === null) {
      return reply.status(400).send({
        ok: false,
        message: "Choose whether tax should appear on invoices.",
      });
    }

    if (businessTin && businessTin.length > 40) {
      return reply.status(400).send({
        ok: false,
        message: "Business TIN must be 40 characters or fewer.",
      });
    }

    const result = await query<DbBusinessDocumentSettings>(
      `
        insert into business_document_settings (
          business_id,
          tax_label,
          tax_rate_basis_points,
          tax_mode,
          show_tax_on_receipts,
          show_tax_on_invoices,
          business_tin,
          created_by_user_id,
          updated_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        on conflict (business_id)
        do update set
          tax_label = excluded.tax_label,
          tax_rate_basis_points = excluded.tax_rate_basis_points,
          tax_mode = excluded.tax_mode,
          show_tax_on_receipts = excluded.show_tax_on_receipts,
          show_tax_on_invoices = excluded.show_tax_on_invoices,
          business_tin = excluded.business_tin,
          updated_by_user_id = excluded.updated_by_user_id
        returning *
      `,
      [
        context.business.id,
        taxLabel,
        taxRateBasisPoints,
        taxMode,
        showTaxOnReceipts,
        showTaxOnInvoices,
        businessTin,
        context.user.id,
      ],
    );

    const updatedSettings = result.rows[0];

    if (!updatedSettings) {
      return reply.status(500).send({
        ok: false,
        message: "Could not save document settings.",
      });
    }

    return {
      ok: true,
      settings: mapDocumentSettings(updatedSettings),
    };
  });
}
