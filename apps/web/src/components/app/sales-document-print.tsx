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

  const rows = sale.items
    .map((item, index) => {
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
      ? `<div class="contact-row"><strong>MoMo Code</strong><span>${esc(
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
          }

          .top-band {
            height: ${isReceipt ? "5px" : "6px"};
            border-radius: 999px;
            background: #0f172a;
            margin-bottom: ${isReceipt ? "8px" : "18px"};
          }

          .header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${isReceipt ? "190px" : "210px"};
            gap: ${isReceipt ? "9px" : "18px"};
            align-items: start;
            padding-bottom: ${isReceipt ? "8px" : "18px"};
            border-bottom: 1px solid #dbe2ea;
          }

          .brand-wrap {
            display: flex;
            align-items: flex-start;
            gap: ${isReceipt ? "9px" : "16px"};
            min-width: 0;
          }

          .logo-shell {
            width: ${isReceipt ? "54px" : "96px"};
            height: ${isReceipt ? "54px" : "96px"};
            min-width: ${isReceipt ? "54px" : "96px"};
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "14px" : "22px"};
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
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
            font-size: ${isReceipt ? "7px" : "10px"};
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #475569;
            line-height: 1.25;
          }

          .brand-copy {
            min-width: 0;
          }

          .doc-kicker {
            font-size: ${isReceipt ? "8px" : "10px"};
            font-weight: 900;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #64748b;
          }

          .branch-name {
            margin: ${isReceipt ? "4px 0 0" : "8px 0 0"};
            font-size: ${isReceipt ? "16px" : "22px"};
            line-height: 1.05;
            font-weight: 900;
            letter-spacing: -0.03em;
            color: #0f172a;
            word-break: break-word;
          }

          .company-name {
            margin-top: ${isReceipt ? "3px" : "5px"};
            font-size: ${isReceipt ? "9.5px" : "12px"};
            line-height: 1.35;
            color: #475569;
            font-weight: 700;
          }

          .contact-lines {
            margin-top: ${isReceipt ? "5px" : "14px"};
            display: grid;
            gap: ${isReceipt ? "1px" : "5px"};
            font-size: ${isReceipt ? "9px" : "12px"};
            line-height: ${isReceipt ? "1.25" : "1.45"};
            color: #334155;
          }

          .contact-row {
            display: grid;
            grid-template-columns: ${isReceipt ? "56px" : "74px"} minmax(0, 1fr);
            gap: 8px;
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
            border-radius: ${isReceipt ? "12px" : "16px"};
            background: #f8fafc;
            overflow: hidden;
            min-width: 180px;
          }

          .meta-row {
            padding: ${isReceipt ? "5px 8px" : "11px 13px"};
            border-bottom: 1px solid #e2e8f0;
            font-size: ${isReceipt ? "9px" : "12px"};
            line-height: 1.25;
            color: #0f172a;
          }

          .meta-row:last-child {
            border-bottom: 0;
          }

          .meta-row .label {
            display: block;
            color: #64748b;
            font-weight: 800;
            margin-bottom: 1px;
          }

          .meta-row .value {
            display: block;
            color: #0f172a;
            font-weight: 900;
            word-break: break-word;
          }

          .section-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: ${isReceipt ? "7px" : "14px"};
            margin-top: ${isReceipt ? "8px" : "18px"};
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
            margin-top: ${isReceipt ? "8px" : "18px"};
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
            background: #f8fafc;
            color: #0f172a;
            font-size: ${isReceipt ? "8px" : "11px"};
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: ${isReceipt ? "5px 6px" : "12px 10px"};
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
          }

          tbody td {
            padding: ${isReceipt ? "5px 6px" : "12px 10px"};
            font-size: ${isReceipt ? "9.5px" : "13px"};
            line-height: ${isReceipt ? "1.25" : "1.4"};
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
            font-size: ${isReceipt ? "8px" : "10px"};
            font-weight: 800;
            color: #64748b;
          }

          .right {
            text-align: right;
          }

          .summary-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${isReceipt ? "255px" : "360px"};
            gap: 14px;
            align-items: start;
            margin-top: ${isReceipt ? "8px" : "18px"};
          }

          .totals {
            width: 100%;
            border: 1px solid #dbe2ea;
            border-radius: ${isReceipt ? "12px" : "16px"};
            padding: ${isReceipt ? "6px 9px" : "14px 16px"};
            background: #ffffff;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: ${isReceipt ? "3px 0" : "8px 0"};
            border-bottom: 1px solid #e2e8f0;
            font-size: ${isReceipt ? "9.5px" : "14px"};
          }

          .total-row:last-child {
            border-bottom: 0;
          }

          .total-row.grand {
            font-size: ${isReceipt ? "12px" : "18px"};
            font-weight: 900;
            color: #0f172a;
          }

          .payment-section {
            margin-top: ${isReceipt ? "8px" : "18px"};
          }

          .payment-section table {
            margin-top: 0;
          }

          .note {
            margin-top: 14px;
            border: 1px solid #dbe2ea;
            border-radius: 16px;
            padding: 12px 14px;
            background: #f8fafc;
            font-size: 12px;
            line-height: 1.55;
            white-space: pre-wrap;
            color: #0f172a;
          }

          .signatures {
            margin-top: ${isReceipt ? "8px" : "22px"};
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
            min-height: ${isReceipt ? "64px" : "150px"};
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
            min-height: ${isReceipt ? "18px" : "68px"};
          }

          .signature-line {
            margin-top: ${isReceipt ? "4px" : "8px"};
            border-top: 1px solid #0f172a;
            padding-top: ${isReceipt ? "4px" : "7px"};
            font-size: ${isReceipt ? "9.5px" : "13px"};
            font-weight: 700;
            color: #0f172a;
            min-height: ${isReceipt ? "16px" : "24px"};
          }

          .signature-meta {
            margin-top: 10px;
            display: grid;
            gap: 8px;
          }

          .signature-meta-row {
            display: grid;
            grid-template-columns: 52px 1fr;
            gap: 10px;
            align-items: end;
          }

          .signature-meta-label {
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #64748b;
          }

          .signature-meta-line {
            border-bottom: 1px solid #94a3b8;
            min-height: 16px;
          }

          .stamp-card {
            border: 1px dashed #94a3b8;
            border-radius: ${isReceipt ? "12px" : "18px"};
            background: #f8fafc;
            min-height: ${isReceipt ? "64px" : "150px"};
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
            font-size: ${isReceipt ? "8.5px" : "12px"};
            font-weight: 700;
            text-align: center;
            padding: ${isReceipt ? "4px" : "10px"};
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
            }

            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page {
              margin: 0;
              width: auto;
              min-height: auto;
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
          <div class="top-band"></div>

          <div class="header avoid-break">
            <div>
              <div class="brand-wrap">
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

                  <div class="contact-lines">
                    ${contactRows}
                  </div>
                </div>
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
              <div class="line"><strong>Name:</strong> ${esc(customerName)}</div>
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
                <th style="width:42px;">#</th>
                <th>Item</th>
                <th style="width:62px;" class="right">Qty</th>
                ${
                  isDeliveryNote
                    ? ""
                    : `
                      <th style="width:108px;" class="right">Unit Price</th>
                      <th style="width:118px;" class="right">Line Total</th>
                    `
                }
              </tr>
            </thead>
            <tbody>
              ${
                rows ||
                `<tr><td colspan="${
                  isDeliveryNote ? "3" : "5"
                }" style="text-align:center;">No items.</td></tr>`
              }
            </tbody>
          </table>

          ${
            isDeliveryNote
              ? ""
              : `
                <div class="summary-row avoid-break">
                  <div></div>
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
              `
          }

          <div class="signatures">
            <div class="signature-card">
              <div class="signature-title">${
                isDeliveryNote ? "Released By" : "Prepared By"
              }</div>
              <div class="signature-space"></div>
              <div class="signature-line">${esc(
                sale.sale.createdByName || "",
              )}</div>

              ${
                isReceipt
                  ? ""
                  : `
                    <div class="signature-meta">
                      <div class="signature-meta-row">
                        <div class="signature-meta-label">Date</div>
                        <div class="signature-meta-line"></div>
                      </div>
                    </div>
                  `
              }
            </div>

            <div class="stamp-card">
              <div class="stamp-title">Company Stamp</div>
              <div class="stamp-space">Official Stamp Area</div>
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
  const taxLabel = `${settings.taxLabel || "Tax"} ${formatTaxRate(
    taxRateBasisPoints,
  )}`;

  if (!shouldShowTax || taxRateBasisPoints === 0) {
    return {
      subtotalLabel: "Total",
      subtotalCents: sale.sale.totalCents,
      taxLabel,
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
    taxCents,
    totalCents,
    paidCents: sale.sale.paidCents,
    balanceCents: sale.sale.balanceCents,
    shouldShowTax: true,
  };
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
      <div class="total-row grand">
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
    <div class="total-row grand">
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

function normalizeBankAccounts(value: unknown): BusinessIdentity["bankAccounts"] {
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