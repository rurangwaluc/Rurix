"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";

import { type CurrentUserResponse } from "../../lib/api";
import {
  getBusinessDocumentSettings,
  type BusinessDocumentSettings,
} from "../../lib/business-settings-api";
import {
  type SaleDetailResponse,
  type SalePaymentMethod,
} from "../../lib/sales-api";

type SalesDocumentType = "receipt" | "invoice" | "proforma" | "delivery_note";

type SalesDocumentPrintProps = {
  sale: SaleDetailResponse;
  context: CurrentUserResponse;
  documentType?: SalesDocumentType;
  buttonLabel?: string;
  compact?: boolean;
};

type BusinessIdentity = {
  businessName: string;
  branchLabel: string;
  email: string;
  phone: string;
  website: string;
  logoUrl: string;
  address: string;
  tin: string;
  momoCode: string;
  bankAccounts: Array<{
    bankName: string;
    accountName: string;
    accountNumber: string;
  }>;
};

type DocumentTotals = {
  subtotalLabel: string;
  subtotalCents: number;
  taxLabel: string;
  taxRateText: string;
  taxRateBasisPoints: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  shouldShowTax: boolean;
};

const defaultDocumentSettings: BusinessDocumentSettings = {
  businessId: "",
  taxLabel: "VAT",
  taxRatePercent: 18,
  taxRateBasisPoints: 1800,
  taxMode: "included_in_prices",
  showTaxOnReceipts: true,
  showTaxOnInvoices: true,
  businessTin: null,
  createdAt: "",
  updatedAt: "",
};

export function SalesDocumentPrint({
  sale,
  context,
  documentType = "receipt",
  buttonLabel,
  compact = false,
}: SalesDocumentPrintProps) {
  const [isPreparing, setIsPreparing] = useState(false);

  const documentLabel = getDocumentLabel(documentType);
  const label = buttonLabel || `Print ${documentLabel.toLowerCase()}`;

  async function handlePrint() {
    setIsPreparing(true);

    try {
      const result = await getBusinessDocumentSettings();

      printDocument(
        `${documentLabel}-${getDocumentNumber(sale, documentType)}`,
        buildSalesDocumentHtml({
          sale,
          context,
          documentType,
          settings: result.settings,
        }),
      );
    } catch {
      printDocument(
        `${documentLabel}-${getDocumentNumber(sale, documentType)}`,
        buildSalesDocumentHtml({
          sale,
          context,
          documentType,
          settings: defaultDocumentSettings,
        }),
      );
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={isPreparing}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background font-black text-foreground shadow-soft transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
      ].join(" ")}
    >
      {isPreparing ? (
        <Loader2
          className={compact ? "h-4 w-4 animate-spin" : "h-5 w-5 animate-spin"}
        />
      ) : (
        <Printer className={compact ? "h-4 w-4" : "h-5 w-5"} />
      )}
      {isPreparing ? "Preparing..." : label}
    </button>
  );
}

function buildSalesDocumentHtml({
  sale,
  context,
  documentType,
  settings,
}: {
  sale: SaleDetailResponse;
  context: CurrentUserResponse;
  documentType: SalesDocumentType;
  settings: BusinessDocumentSettings;
}) {
  const biz = getBusinessIdentity(context, sale);
  const documentLabel = getDocumentLabel(documentType);
  const documentNumber = getDocumentNumber(sale, documentType);
  const isReceipt = documentType === "receipt";
  const isDeliveryNote = documentType === "delivery_note";
  const customerName = sale.sale.customerName || "Walk-in customer";
  const completedAt = sale.sale.completedAt
    ? formatDateTime(sale.sale.completedAt)
    : "Not shown";

  const documentTin = clean(settings.businessTin) || biz.tin;
  const totals = buildDocumentTotals({
    sale,
    documentType,
    settings,
  });

  const showLineTax = !isDeliveryNote && totals.shouldShowTax;

  const rows = sale.items
    .map((item, index) => {
      const itemTaxCents = showLineTax
        ? calculateLineTaxCents({
            lineTotalCents: item.lineTotalCents,
            taxRateBasisPoints: totals.taxRateBasisPoints,
            taxMode: settings.taxMode,
          })
        : 0;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${esc(item.itemName || "Item")}</strong>
            ${
              item.itemSku
                ? `<span class="table-subline">${esc(item.itemSku)}</span>`
                : ""
            }
          </td>
          <td class="right">${esc(item.quantity.toLocaleString())}</td>
          ${
            isDeliveryNote
              ? ""
              : `
                <td class="right">${esc(moneyLine(item.unitPriceCents))}</td>
                ${
                  showLineTax
                    ? `
                      <td class="right">${esc(totals.taxRateText)}</td>
                      <td class="right">${esc(moneyLine(itemTaxCents))}</td>
                    `
                    : ""
                }
                <td class="right">${esc(moneyLine(item.lineTotalCents))}</td>
              `
          }
        </tr>
      `;
    })
    .join("");

  const paymentRows = sale.payments
    .map((payment) => {
      return `
        <tr>
          <td>${esc(formatPaymentMethod(payment.method))}</td>
          <td class="right">${esc(moneyLine(payment.amountCents))}</td>
          <td>${esc(payment.receivedByName || "Not shown")}</td>
        </tr>
      `;
    })
    .join("");

  const contactRows = [
    biz.address
      ? `<div class="contact-row"><strong>Address</strong><span>${esc(
          biz.address,
        )}</span></div>`
      : "",
    biz.phone
      ? `<div class="contact-row"><strong>Phone</strong><span>${esc(
          biz.phone,
        )}</span></div>`
      : "",
    biz.email
      ? `<div class="contact-row"><strong>Email</strong><span>${esc(
          biz.email,
        )}</span></div>`
      : "",
    biz.website
      ? `<div class="contact-row"><strong>Website</strong><span>${esc(
          biz.website,
        )}</span></div>`
      : "",
    documentTin
      ? `<div class="contact-row"><strong>TIN</strong><span>${esc(
          documentTin,
        )}</span></div>`
      : "",
    biz.momoCode
      ? `<div class="contact-row"><strong>MoMo</strong><span>${esc(
          biz.momoCode,
        )}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const bankRows =
    !isReceipt && biz.bankAccounts.length
      ? `
        <div class="card avoid-break">
          <div class="card-title">Bank Details</div>
          <div class="stacked-list">
            ${biz.bankAccounts
              .map(
                (account) => `
                  <div class="stacked-item">
                    ${
                      account.bankName
                        ? `<div class="line"><strong>Bank name:</strong> ${esc(
                            account.bankName,
                          )}</div>`
                        : ""
                    }
                    ${
                      account.accountName
                        ? `<div class="line"><strong>Account name:</strong> ${esc(
                            account.accountName,
                          )}</div>`
                        : ""
                    }
                    ${
                      account.accountNumber
                        ? `<div class="line"><strong>Account number:</strong> ${esc(
                            account.accountNumber,
                          )}</div>`
                        : ""
                    }
                  </div>
                `,
              )
              .join("")}
          </div>
        </div>
      `
      : "";

  const totalRows = buildTotalRows(totals);
  const vatSummary = totals.shouldShowTax
    ? buildVatSummary({
        taxRateText: totals.taxRateText,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        taxLabel: settings.taxLabel || "Tax",
      })
    : "";

  const tableColumnCount = isDeliveryNote ? 3 : showLineTax ? 7 : 5;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${esc(documentLabel)} ${esc(documentNumber)}</title>
        <style>
          * { box-sizing: border-box; }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #eef2f7;
            color: #0f172a;
            font-family: Inter, Arial, Helvetica, sans-serif;
          }

          body {
            padding: 18px;
          }

          .page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: #ffffff;
            padding: ${isReceipt ? "7mm 8mm 8mm" : "14mm 14mm 16mm"};
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
            display: flex;
            flex-direction: column;
          }

          .document-main {
            flex: 1 0 auto;
            display: flex;
            flex-direction: column;
          }

          .document-lower {
            flex-shrink: 0;
          }

          .product-fill {
            flex: 1 1 auto;
            min-height: ${isReceipt ? "16mm" : "10mm"};
          }

          .top-band {
            height: ${isReceipt ? "5px" : "6px"};
            border-radius: 999px;
            background: linear-gradient(90deg, #0f172a, #475569, #0f172a);
            margin-bottom: ${isReceipt ? "7px" : "18px"};
          }

          .header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${isReceipt ? "205px" : "230px"};
            gap: ${isReceipt ? "9px" : "18px"};
            align-items: stretch;
            padding-bottom: ${isReceipt ? "8px" : "18px"};
          }

          .brand-panel {
            position: relative;
            overflow: hidden;
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "14px" : "18px"};
            background:
              radial-gradient(circle at top right, rgba(15, 23, 42, 0.08), transparent 30%),
              linear-gradient(135deg, #ffffff, #f8fafc);
            padding: ${isReceipt ? "8px 10px" : "14px"};
            min-height: ${isReceipt ? "66px" : "104px"};
            display: grid;
            grid-template-columns: ${isReceipt ? "48px" : "72px"} minmax(0, 1fr) auto;
            gap: ${isReceipt ? "9px" : "14px"};
            align-items: center;
          }

          .brand-panel::before {
            content: "";
            position: absolute;
            inset: 0 auto 0 0;
            width: 4px;
            background: #0f172a;
          }

          .logo-shell {
            width: ${isReceipt ? "48px" : "72px"};
            height: ${isReceipt ? "48px" : "72px"};
            min-width: ${isReceipt ? "48px" : "72px"};
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "18px"};
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          }

          .logo-shell img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }

          .logo-fallback {
            padding: 6px;
            text-align: center;
            font-size: ${isReceipt ? "6.5px" : "9px"};
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #0f172a;
            line-height: 1.2;
          }

          .brand-copy {
            min-width: 0;
          }

          .doc-kicker {
            font-size: ${isReceipt ? "7px" : "10px"};
            font-weight: 900;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: #64748b;
          }

          .branch-name {
            margin: ${isReceipt ? "3px 0 0" : "7px 0 0"};
            font-size: ${isReceipt ? "18px" : "27px"};
            line-height: 1.02;
            font-weight: 950;
            letter-spacing: -0.045em;
            color: #0f172a;
            word-break: break-word;
          }

          .company-name {
            margin-top: ${isReceipt ? "2px" : "5px"};
            font-size: ${isReceipt ? "9.5px" : "13px"};
            line-height: 1.25;
            color: #475569;
            font-weight: 800;
          }

          .document-chip {
            align-self: start;
            border: 1px solid #dbe2ea;
            border-radius: 999px;
            background: #0f172a;
            color: #ffffff;
            padding: ${isReceipt ? "5px 8px" : "7px 10px"};
            font-size: ${isReceipt ? "7px" : "9px"};
            font-weight: 950;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .contact-lines {
            grid-column: 2 / 4;
            margin-top: ${isReceipt ? "2px" : "8px"};
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${isReceipt ? "1px 10px" : "4px 14px"};
            font-size: ${isReceipt ? "8px" : "11px"};
            line-height: ${isReceipt ? "1.16" : "1.4"};
            color: #334155;
          }

          .contact-lines:empty {
            display: none;
          }

          .contact-row {
            display: grid;
            grid-template-columns: ${isReceipt ? "36px" : "58px"} minmax(0, 1fr);
            gap: 6px;
            min-width: 0;
          }

          .contact-row strong {
            color: #0f172a;
            font-weight: 900;
          }

          .contact-row span {
            word-break: break-word;
          }

          .meta-panel {
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "14px" : "18px"};
            background: #f8fafc;
            overflow: hidden;
            min-width: 180px;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
          }

          .meta-row {
            padding: ${isReceipt ? "5px 9px" : "11px 13px"};
            border-bottom: 1px solid #e2e8f0;
            font-size: ${isReceipt ? "8.5px" : "12px"};
            line-height: 1.2;
            color: #0f172a;
          }

          .meta-row:last-child {
            border-bottom: 0;
          }

          .meta-row .label {
            display: block;
            color: #64748b;
            font-weight: 900;
            margin-bottom: 1px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-size: ${isReceipt ? "6.5px" : "9px"};
          }

          .meta-row .value {
            display: block;
            color: #0f172a;
            font-weight: 950;
            word-break: break-word;
          }

          .section-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: ${isReceipt ? "7px" : "14px"};
            margin-top: ${isReceipt ? "6px" : "18px"};
          }

          .card {
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "16px"};
            padding: ${isReceipt ? "7px 9px" : "14px"};
            background: #ffffff;
          }

          .card-title {
            font-size: ${isReceipt ? "8px" : "10px"};
            font-weight: 900;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: ${isReceipt ? "4px" : "10px"};
          }

          .line {
            font-size: ${isReceipt ? "9.5px" : "13px"};
            line-height: ${isReceipt ? "1.32" : "1.5"};
            color: #0f172a;
          }

          .stacked-list {
            display: grid;
            gap: 8px;
          }

          .stacked-item {
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 9px;
            background: #f8fafc;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: ${isReceipt ? "7px" : "18px"};
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "16px"};
            overflow: hidden;
          }

          thead {
            display: table-header-group;
          }

          tfoot {
            display: table-footer-group;
          }

          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          thead th {
            background: #0f172a;
            color: #ffffff;
            font-size: ${isReceipt ? "7.5px" : "10px"};
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: ${isReceipt ? "5px 5px" : "11px 10px"};
            text-align: left;
            border-bottom: 1px solid #0f172a;
          }

          tbody td {
            padding: ${isReceipt ? "5px 5px" : "11px 10px"};
            font-size: ${isReceipt ? "9px" : "12px"};
            line-height: ${isReceipt ? "1.2" : "1.35"};
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
            color: #0f172a;
          }

          tbody tr:last-child td {
            border-bottom: 0;
          }

          .table-subline {
            display: block;
            margin-top: 2px;
            font-size: ${isReceipt ? "7.5px" : "10px"};
            font-weight: 800;
            color: #64748b;
          }

          .right {
            text-align: right;
          }

          .summary-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${isReceipt ? "250px" : "360px"};
            gap: ${isReceipt ? "10px" : "14px"};
            align-items: start;
            margin-top: ${isReceipt ? "7px" : "18px"};
          }

          .vat-summary {
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "16px"};
            background: #ffffff;
            padding: ${isReceipt ? "6px 8px" : "14px"};
          }

          .vat-summary-title {
            font-size: ${isReceipt ? "8px" : "10px"};
            font-weight: 900;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: ${isReceipt ? "5px" : "10px"};
          }

          .vat-summary-grid {
            display: grid;
            grid-template-columns: 0.7fr 1fr 1fr;
            gap: 8px;
            font-size: ${isReceipt ? "8.5px" : "12px"};
          }

          .vat-summary-grid strong {
            color: #0f172a;
            font-weight: 900;
          }

          .vat-summary-muted {
            color: #64748b;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: ${isReceipt ? "7px" : "9px"};
          }

          .totals {
            width: 100%;
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "16px"};
            overflow: hidden;
            background: #ffffff;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: ${isReceipt ? "4px 9px" : "8px 14px"};
            border-bottom: 1px solid #e2e8f0;
            font-size: ${isReceipt ? "9px" : "13px"};
          }

          .total-row:last-child {
            border-bottom: 0;
          }

          .total-row.grand {
            font-size: ${isReceipt ? "12px" : "18px"};
            font-weight: 900;
            color: #0f172a;
          }

          .total-row.total-bar {
            background: #0f172a;
            color: #ffffff;
            border-bottom: 0;
            padding: ${isReceipt ? "7px 9px" : "12px 14px"};
            margin-top: 2px;
          }

          .total-row.total-bar strong,
          .total-row.total-bar span {
            color: #ffffff;
          }

          .payment-section {
            margin-top: ${isReceipt ? "7px" : "18px"};
          }

          .payment-section table {
            margin-top: 0;
          }

          .signatures {
            margin-top: ${isReceipt ? "7px" : "22px"};
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${isReceipt ? "160px" : "220px"};
            gap: 14px;
            align-items: stretch;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .signature-card {
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "18px"};
            background: #ffffff;
            padding: ${isReceipt ? "8px" : "16px"};
            min-height: ${isReceipt ? "62px" : "150px"};
            display: flex;
            flex-direction: column;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .signature-title,
          .stamp-title {
            font-size: ${isReceipt ? "7.5px" : "9px"};
            font-weight: 900;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #64748b;
          }

          .signature-space {
            flex: 1;
            min-height: ${isReceipt ? "17px" : "68px"};
          }

          .signature-line {
            margin-top: ${isReceipt ? "4px" : "8px"};
            border-top: 1px solid #0f172a;
            padding-top: ${isReceipt ? "4px" : "7px"};
            font-size: ${isReceipt ? "9px" : "13px"};
            font-weight: 700;
            color: #0f172a;
            min-height: ${isReceipt ? "16px" : "24px"};
          }

          .stamp-card {
            border: 1px dashed #94a3b8;
            border-radius: ${isReceipt ? "12px" : "18px"};
            background: #f8fafc;
            min-height: ${isReceipt ? "62px" : "150px"};
            padding: ${isReceipt ? "8px" : "16px"};
            display: flex;
            flex-direction: column;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .stamp-space {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            font-size: ${isReceipt ? "8px" : "12px"};
            font-weight: 700;
            text-align: center;
            padding: ${isReceipt ? "4px" : "10px"};
          }

          .document-footer {
            margin-top: ${isReceipt ? "8px" : "18px"};
            border-top: 3px solid #0f172a;
            padding-top: ${isReceipt ? "6px" : "10px"};
            text-align: center;
            font-size: ${isReceipt ? "8px" : "11px"};
            font-weight: 900;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #334155;
            flex-shrink: 0;
          }

          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          @media print {
            html,
            body {
              background: #ffffff;
              padding: 0;
              min-height: 100%;
            }

            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page {
              margin: 0;
              width: auto;
              min-height: calc(297mm - ${isReceipt ? "12mm" : "24mm"});
              box-shadow: none;
              padding: 0;
            }

            @page {
              size: A4;
              margin: ${isReceipt ? "6mm" : "12mm"};
            }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="document-main">
            <div class="top-band"></div>

            <div class="header avoid-break">
              <div class="brand-panel">
                <div class="logo-shell">
                  ${
                    biz.logoUrl
                      ? `<img src="${esc(biz.logoUrl)}" alt="${esc(
                          biz.branchLabel,
                        )} logo" />`
                      : `<div class="logo-fallback">${esc(
                          biz.branchLabel,
                        )}</div>`
                  }
                </div>

                <div class="brand-copy">
                  <div class="doc-kicker">${esc(documentLabel)}</div>
                  <h1 class="branch-name">${esc(biz.branchLabel)}</h1>
                  <div class="company-name">${esc(biz.businessName)}</div>
                </div>

                <div class="document-chip">${esc(documentLabel)}</div>

                <div class="contact-lines">
                  ${contactRows}
                </div>
              </div>

              <div class="meta-panel">
                <div class="meta-row">
                  <span class="label">${esc(documentLabel)} No</span>
                  <span class="value">${esc(documentNumber)}</span>
                </div>
                <div class="meta-row">
                  <span class="label">Sale number</span>
                  <span class="value">${esc(sale.sale.saleNumber)}</span>
                </div>
                <div class="meta-row">
                  <span class="label">Completed</span>
                  <span class="value">${esc(completedAt)}</span>
                </div>
                <div class="meta-row">
                  <span class="label">Payment status</span>
                  <span class="value">${
                    totals.balanceCents === 0 ? "Fully paid" : "Balance due"
                  }</span>
                </div>
              </div>
            </div>

            <div class="section-grid">
              <div class="card avoid-break">
                <div class="card-title">${
                  isDeliveryNote ? "Deliver To" : "Bill To"
                }</div>
                <div class="line"><strong>Name:</strong> ${esc(
                  customerName,
                )}</div>
                <div class="line"><strong>Selling location:</strong> ${esc(
                  sale.sale.branchName,
                )}</div>
                <div class="line"><strong>Handled by:</strong> ${esc(
                  sale.sale.createdByName || "Not shown",
                )}</div>
              </div>

              ${bankRows}
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width:34px;">#</th>
                  <th>Item</th>
                  <th style="width:52px;" class="right">Qty</th>
                  ${
                    isDeliveryNote
                      ? ""
                      : `
                        <th style="width:92px;" class="right">Unit Price</th>
                        ${
                          showLineTax
                            ? `
                              <th style="width:58px;" class="right">VAT %</th>
                              <th style="width:86px;" class="right">VAT Amount</th>
                            `
                            : ""
                        }
                        <th style="width:98px;" class="right">Total</th>
                      `
                  }
                </tr>
              </thead>
              <tbody>
                ${
                  rows ||
                  `<tr><td colspan="${tableColumnCount}" style="text-align:center;">No items.</td></tr>`
                }
              </tbody>
            </table>

            <div class="product-fill"></div>

            ${
              isDeliveryNote
                ? ""
                : `
                  <div class="document-lower">
                    <div class="summary-row avoid-break">
                      <div>
                        ${vatSummary}
                      </div>

                      <div class="totals">
                        ${totalRows}
                      </div>
                    </div>

                    <section class="payment-section avoid-break">
                      <div class="card">
                        <div class="card-title">Payment</div>
                        <table>
                          <thead>
                            <tr>
                              <th>Method</th>
                              <th class="right">Amount</th>
                              <th>Received by</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${
                              paymentRows ||
                              `<tr><td colspan="3" style="text-align:center;">No payments.</td></tr>`
                            }
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <div class="signatures">
                      <div class="signature-card">
                        <div class="signature-title">Prepared By</div>
                        <div class="signature-space"></div>
                        <div class="signature-line">${esc(
                          sale.sale.createdByName || "",
                        )}</div>
                      </div>

                      <div class="stamp-card">
                        <div class="stamp-title">Company Stamp</div>
                        <div class="stamp-space">Official Stamp Area</div>
                      </div>
                    </div>
                  </div>
                `
            }

            ${
              isDeliveryNote
                ? `
                  <div class="document-lower">
                    <div class="signatures">
                      <div class="signature-card">
                        <div class="signature-title">Released By</div>
                        <div class="signature-space"></div>
                        <div class="signature-line">${esc(
                          sale.sale.createdByName || "",
                        )}</div>
                      </div>

                      <div class="stamp-card">
                        <div class="stamp-title">Company Stamp</div>
                        <div class="stamp-space">Official Stamp Area</div>
                      </div>
                    </div>
                  </div>
                `
                : ""
            }

            <div class="document-footer">
              Thank you for your business.
            </div>
          </div>
        </div>

        <script>
          window.onload = function () {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `;
}

function buildDocumentTotals({
  sale,
  documentType,
  settings,
}: {
  sale: SaleDetailResponse;
  documentType: SalesDocumentType;
  settings: BusinessDocumentSettings;
}): DocumentTotals {
  const shouldShowTax =
    settings.taxMode !== "no_tax" &&
    ((documentType === "receipt" && settings.showTaxOnReceipts) ||
      ((documentType === "invoice" || documentType === "proforma") &&
        settings.showTaxOnInvoices));

  const taxRateBasisPoints = Math.max(0, settings.taxRateBasisPoints || 0);
  const taxRateText = formatTaxRate(taxRateBasisPoints);
  const taxLabel = `${settings.taxLabel || "Tax"} ${taxRateText}`;

  if (!shouldShowTax || taxRateBasisPoints === 0) {
    return {
      subtotalLabel: "Total",
      subtotalCents: sale.sale.totalCents,
      taxLabel,
      taxRateText,
      taxRateBasisPoints,
      taxCents: 0,
      totalCents: sale.sale.totalCents,
      paidCents: sale.sale.paidCents,
      balanceCents: sale.sale.balanceCents,
      shouldShowTax: false,
    };
  }

  if (settings.taxMode === "added_on_top") {
    const subtotalCents = Math.max(
      0,
      sale.sale.subtotalCents - sale.sale.discountCents,
    );

    const taxCents = Math.round((subtotalCents * taxRateBasisPoints) / 10000);
    const totalCents = subtotalCents + taxCents;
    const balanceCents = totalCents - sale.sale.paidCents;

    return {
      subtotalLabel: "Subtotal",
      subtotalCents,
      taxLabel,
      taxRateText,
      taxRateBasisPoints,
      taxCents,
      totalCents,
      paidCents: sale.sale.paidCents,
      balanceCents,
      shouldShowTax: true,
    };
  }

  const totalCents = sale.sale.totalCents;
  const taxCents = Math.round(
    (totalCents * taxRateBasisPoints) / (10000 + taxRateBasisPoints),
  );
  const subtotalCents = totalCents - taxCents;

  return {
    subtotalLabel: `Subtotal before ${settings.taxLabel || "tax"}`,
    subtotalCents,
    taxLabel,
    taxRateText,
    taxRateBasisPoints,
    taxCents,
    totalCents,
    paidCents: sale.sale.paidCents,
    balanceCents: sale.sale.balanceCents,
    shouldShowTax: true,
  };
}

function buildVatSummary({
  taxRateText,
  subtotalCents,
  taxCents,
  taxLabel,
}: {
  taxRateText: string;
  subtotalCents: number;
  taxCents: number;
  taxLabel: string;
}) {
  return `
    <div class="vat-summary">
      <div class="vat-summary-title">${esc(taxLabel)} Summary</div>

      <div class="vat-summary-grid">
        <span class="vat-summary-muted">${esc(taxLabel)} %</span>
        <span class="vat-summary-muted">Net amount</span>
        <span class="vat-summary-muted">${esc(taxLabel)} amount</span>

        <strong>${esc(taxRateText)}</strong>
        <strong>${esc(moneyLine(subtotalCents))}</strong>
        <strong>${esc(moneyLine(taxCents))}</strong>
      </div>
    </div>
  `;
}

function buildTotalRows(totals: DocumentTotals) {
  if (!totals.shouldShowTax) {
    return `
      <div class="total-row">
        <span>Total</span>
        <strong>${esc(moneyLine(totals.totalCents))}</strong>
      </div>
      <div class="total-row">
        <span>Paid</span>
        <strong>${esc(moneyLine(totals.paidCents))}</strong>
      </div>
      <div class="total-row grand total-bar">
        <span>Balance</span>
        <strong>${esc(moneyLine(totals.balanceCents))}</strong>
      </div>
    `;
  }

  return `
    <div class="total-row">
      <span>${esc(totals.subtotalLabel)}</span>
      <strong>${esc(moneyLine(totals.subtotalCents))}</strong>
    </div>
    <div class="total-row">
      <span>${esc(totals.taxLabel)}</span>
      <strong>${esc(moneyLine(totals.taxCents))}</strong>
    </div>
    <div class="total-row grand total-bar">
      <span>Total</span>
      <strong>${esc(moneyLine(totals.totalCents))}</strong>
    </div>
    <div class="total-row">
      <span>Paid</span>
      <strong>${esc(moneyLine(totals.paidCents))}</strong>
    </div>
    <div class="total-row">
      <span>Balance</span>
      <strong>${esc(moneyLine(totals.balanceCents))}</strong>
    </div>
  `;
}

function calculateLineTaxCents({
  lineTotalCents,
  taxRateBasisPoints,
  taxMode,
}: {
  lineTotalCents: number;
  taxRateBasisPoints: number;
  taxMode: BusinessDocumentSettings["taxMode"];
}) {
  if (taxRateBasisPoints <= 0) {
    return 0;
  }

  if (taxMode === "added_on_top") {
    return Math.round((lineTotalCents * taxRateBasisPoints) / 10000);
  }

  return Math.round(
    (lineTotalCents * taxRateBasisPoints) / (10000 + taxRateBasisPoints),
  );
}

function printDocument(title: string, html: string) {
  if (typeof window === "undefined") return;

  const win = window.open("", "_blank", "width=1200,height=900");

  if (!win) return;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;
}

function getBusinessIdentity(
  context: CurrentUserResponse,
  sale: SaleDetailResponse,
): BusinessIdentity {
  const details = context as CurrentUserResponse & {
    business?: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      logoUrl?: string | null;
      address?: string | null;
      tin?: string | null;
      momoCode?: string | null;
      bankAccounts?: unknown;
    };
    businessName?: string | null;
    companyName?: string | null;
    organizationName?: string | null;
    storeName?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    businessWebsite?: string | null;
    businessLogoUrl?: string | null;
    businessAddress?: string | null;
    businessTin?: string | null;
    momoCode?: string | null;
    bankAccounts?: unknown;
    profile?: {
      name?: string | null;
      businessName?: string | null;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      logoUrl?: string | null;
      address?: string | null;
      tin?: string | null;
      momoCode?: string | null;
      bankAccounts?: unknown;
    };
  };

  const businessName =
    clean(details.business?.name) ||
    clean(details.businessName) ||
    clean(details.companyName) ||
    clean(details.organizationName) ||
    clean(details.storeName) ||
    clean(details.profile?.businessName) ||
    clean(details.profile?.name) ||
    "Your Business Name";

  const branchLabel = sale.sale.branchName || businessName;

  return {
    businessName,
    branchLabel,
    email:
      clean(details.business?.email) ||
      clean(details.businessEmail) ||
      clean(details.profile?.email),
    phone:
      clean(details.business?.phone) ||
      clean(details.businessPhone) ||
      clean(details.profile?.phone),
    website:
      clean(details.business?.website) ||
      clean(details.businessWebsite) ||
      clean(details.profile?.website),
    logoUrl:
      clean(details.business?.logoUrl) ||
      clean(details.businessLogoUrl) ||
      clean(details.profile?.logoUrl),
    address:
      clean(details.business?.address) ||
      clean(details.businessAddress) ||
      clean(details.profile?.address),
    tin:
      clean(details.business?.tin) ||
      clean(details.businessTin) ||
      clean(details.profile?.tin),
    momoCode:
      clean(details.business?.momoCode) ||
      clean(details.momoCode) ||
      clean(details.profile?.momoCode),
    bankAccounts: normalizeBankAccounts(
      details.business?.bankAccounts ||
        details.profile?.bankAccounts ||
        details.bankAccounts,
    ),
  };
}

function normalizeBankAccounts(
  value: unknown,
): BusinessIdentity["bankAccounts"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((account) => {
      if (!account) return null;

      if (typeof account === "string") {
        return {
          bankName: account.trim(),
          accountName: "",
          accountNumber: "",
        };
      }

      const record = account as {
        bankName?: unknown;
        bank?: unknown;
        name?: unknown;
        accountName?: unknown;
        holderName?: unknown;
        accountNumber?: unknown;
        number?: unknown;
      };

      return {
        bankName:
          clean(record.bankName) || clean(record.bank) || clean(record.name),
        accountName: clean(record.accountName) || clean(record.holderName),
        accountNumber: clean(record.accountNumber) || clean(record.number),
      };
    })
    .filter((account): account is BusinessIdentity["bankAccounts"][number] => {
      return Boolean(
        account &&
        (account.bankName || account.accountName || account.accountNumber),
      );
    });
}

function getDocumentLabel(type: SalesDocumentType) {
  const labels: Record<SalesDocumentType, string> = {
    receipt: "Receipt",
    invoice: "Invoice",
    proforma: "Proforma Invoice",
    delivery_note: "Delivery Note",
  };

  return labels[type];
}

function getDocumentNumber(sale: SaleDetailResponse, type: SalesDocumentType) {
  if (type === "receipt") {
    return sale.sale.receiptNumber || sale.receipt?.receiptNumber || "Receipt";
  }

  if (type === "invoice") {
    return `INV-${sale.sale.saleNumber}`;
  }

  if (type === "proforma") {
    return `PRO-${sale.sale.saleNumber}`;
  }

  return `DN-${sale.sale.saleNumber}`;
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatPaymentMethod(method: SalePaymentMethod) {
  const labels: Record<SalePaymentMethod, string> = {
    cash: "Cash",
    mobile_money: "Mobile money",
    bank_transfer: "Bank transfer",
    card: "Card",
  };

  return labels[method];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTaxRate(value: number) {
  const rate = value / 100;

  return `${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2)}%`;
}

function moneyLine(value: number) {
  return `${Math.round(value / 100).toLocaleString()} RWF`;
}
