import PDFDocument from "pdfkit";
import { Resend } from "resend";

export type PurchaseOrderDocumentBusiness = {
  name: string;
  legalName: string | null;
};

export type PurchaseOrderDocumentSender = {
  name: string | null;
  email: string | null;
};

export type PurchaseOrderDocumentOrder = {
  supplierName: string;
  supplierContactPerson: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  deliveryBranchName: string | null;
  orderNumber: string;
  expectedDeliveryDate: Date | string | null;
  notes: string | null;
  status?: string | null;
  reference?: string | null;
};

export type PurchaseOrderDocumentItem = {
  itemName: string;
  itemSku: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  expectedUnitCostCents: number | null;
  expectedLineTotalCents: number | null;
  note: string | null;
};

const COLORS = {
  ink: "#111827",
  text: "#1f2937",
  muted: "#6b7280",
  lightText: "#9ca3af",
  line: "#d1d5db",
  lineDark: "#9ca3af",
  softLine: "#e5e7eb",
  soft: "#f9fafb",
  softCard: "#f3f4f6",
  brand: "#111827",
  white: "#ffffff",
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginLeft: 36,
  marginRight: 36,
  marginTop: 30,
  marginBottom: 30,
};

type TextOptions = {
  width?: number;
  align?: "left" | "center" | "right" | "justify";
  font?: string;
  size?: number;
  color?: string;
  ellipsis?: boolean;
  lineGap?: number;
  lineBreak?: boolean;
};

type TableColumn = {
  key: "itemNo" | "item" | "qty" | "price" | "total";
  label: string;
  x: number;
  width: number;
  align: "left" | "center" | "right";
};

export function getPurchaseOrderPdfFileName(orderNumber: string) {
  return `${orderNumber.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
}

export function buildPurchaseOrderPlainMessage(input: {
  business: PurchaseOrderDocumentBusiness;
  sender: PurchaseOrderDocumentSender;
  order: PurchaseOrderDocumentOrder;
  items: PurchaseOrderDocumentItem[];
}) {
  const lines = [
    `Hello ${input.order.supplierContactPerson || input.order.supplierName},`,
    "",
    `${input.business.name} is sending you this purchase order for review.`,
    "",
    `Purchase order: ${input.order.orderNumber}`,
  ];

  if (input.order.deliveryBranchName) {
    lines.push(`Delivery location: ${input.order.deliveryBranchName}`);
  }

  if (input.order.expectedDeliveryDate) {
    lines.push(
      `Expected delivery: ${formatDate(input.order.expectedDeliveryDate)}`,
    );
  }

  lines.push("", "Products:");

  input.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.itemName}`);
    lines.push(`   Quantity: ${item.quantityOrdered.toLocaleString()}`);

    if (item.expectedUnitCostCents !== null) {
      lines.push(`   Expected unit cost: ${money(item.expectedUnitCostCents)}`);
    }

    if (item.expectedLineTotalCents !== null) {
      lines.push(`   Line total: ${money(item.expectedLineTotalCents)}`);
    }

    if (item.note) {
      lines.push(`   Note: ${item.note}`);
    }
  });

  if (hasMeaningfulNotes(input.order.notes)) {
    lines.push("", `Special instructions: ${input.order.notes}`);
  }

  if (input.sender.name || input.sender.email) {
    lines.push("");
    lines.push(
      `Prepared by: ${input.sender.name || input.sender.email || "Rurix user"}`,
    );
  }

  lines.push("", "Please confirm availability, price, and delivery time.");

  return lines.join("\n");
}

export function buildPurchaseOrderEmailHtml(input: {
  business: PurchaseOrderDocumentBusiness;
  sender: PurchaseOrderDocumentSender;
  order: PurchaseOrderDocumentOrder;
  items: PurchaseOrderDocumentItem[];
  message: string;
}) {
  const itemRows = input.items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;">
            <strong>${escapeHtml(item.itemName)}</strong>
            ${
              item.itemSku
                ? `<div style="font-size:12px;color:#6b7280;">SKU: ${escapeHtml(item.itemSku)}</div>`
                : ""
            }
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${item.quantityOrdered.toLocaleString()}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${
              item.expectedUnitCostCents === null
                ? "To confirm"
                : money(item.expectedUnitCostCents)
            }
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${
              item.expectedLineTotalCents === null
                ? "To confirm"
                : money(item.expectedLineTotalCents)
            }
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#111827;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
        <div style="padding:24px;background:#111827;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#d1d5db;">
            Purchase order
          </div>
          <h1 style="margin:10px 0 0;font-size:26px;">${escapeHtml(input.order.orderNumber)}</h1>
          <p style="margin:8px 0 0;color:#d1d5db;">Issued by ${escapeHtml(input.business.name)}</p>
        </div>

        <div style="padding:24px;">
          <p style="white-space:pre-line;line-height:1.6;margin:0 0 20px;">
            ${escapeHtml(input.message)}
          </p>

          <div style="display:grid;gap:8px;margin-bottom:20px;">
            <div><strong>Issued by:</strong> ${escapeHtml(input.business.name)}</div>
            ${
              input.business.legalName
                ? `<div><strong>Legal name:</strong> ${escapeHtml(input.business.legalName)}</div>`
                : ""
            }
            <div><strong>Supplier:</strong> ${escapeHtml(input.order.supplierName)}</div>
            <div><strong>Delivery location:</strong> ${escapeHtml(input.order.deliveryBranchName || "To confirm")}</div>
            <div><strong>Expected delivery:</strong> ${
              input.order.expectedDeliveryDate
                ? escapeHtml(formatDate(input.order.expectedDeliveryDate))
                : "To confirm"
            }</div>
            <div><strong>Prepared by:</strong> ${escapeHtml(input.sender.name || input.sender.email || "Rurix user")}</div>
          </div>

          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:12px;text-align:left;">Product</th>
                <th style="padding:12px;text-align:right;">Qty</th>
                <th style="padding:12px;text-align:right;">Unit cost</th>
                <th style="padding:12px;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <p style="margin-top:20px;font-size:12px;color:#6b7280;">
            Attached PDF includes purchase order details, order lines, summary, approval, and supplier confirmation.
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function generatePurchaseOrderPdf(input: {
  business: PurchaseOrderDocumentBusiness;
  sender: PurchaseOrderDocumentSender;
  order: PurchaseOrderDocumentOrder;
  items: PurchaseOrderDocumentItem[];
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      compress: true,
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: `Purchase Order ${input.order.orderNumber}`,
        Author: input.business.name,
        Subject: "Purchase Order",
        Creator: "Rurix",
        Producer: "Rurix",
      },
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bottomLimit = PAGE.height - PAGE.marginBottom;
    const endingHeight = measureEndingSectionHeight(doc, input);

    let bodyStart = drawHeader(doc, input, false);
    let nextY = drawSupplierAndOrderInfo(doc, input, bodyStart);

    drawText(doc, "ORDER LINES", PAGE.marginLeft, nextY, {
      width: PAGE.width - PAGE.marginLeft - PAGE.marginRight,
      align: "left",
      font: "Helvetica-Bold",
      size: 11,
      color: COLORS.ink,
    });

    let layout = drawTableHeader(doc, nextY + 18);
    let currentY = layout.contentY;
    let rowIndex = 0;

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];

      if (!item) {
        continue;
      }

      const rowHeight = measureItemBlock(doc, item, 266).height;
      const isLastItem = index === input.items.length - 1;
      const reserve = isLastItem ? endingHeight + 16 : 0;

      if (currentY + rowHeight + reserve > bottomLimit) {
        doc.addPage({ margin: 0 });

        bodyStart = drawHeader(doc, input, true);

        drawText(doc, "ORDER LINES", PAGE.marginLeft, bodyStart, {
          width: PAGE.width - PAGE.marginLeft - PAGE.marginRight,
          align: "left",
          font: "Helvetica-Bold",
          size: 11,
          color: COLORS.ink,
        });

        layout = drawTableHeader(doc, bodyStart + 18);
        currentY = layout.contentY;
      }

      const used = drawItemRow(doc, {
        rowIndex,
        item,
        layout,
        y: currentY,
      });

      currentY += used + 4;
      rowIndex += 1;
    }

    if (!input.items.length) {
      if (currentY + endingHeight > bottomLimit) {
        doc.addPage({ margin: 0 });
        bodyStart = drawHeader(doc, input, true);
        currentY = bodyStart + 8;
      }

      drawRoundedRect(
        doc,
        PAGE.marginLeft,
        currentY,
        PAGE.width - PAGE.marginLeft - PAGE.marginRight,
        44,
        10,
        COLORS.soft,
        COLORS.softLine,
      );

      drawText(
        doc,
        "No items on this purchase order.",
        PAGE.marginLeft,
        currentY + 14,
        {
          width: PAGE.width - PAGE.marginLeft - PAGE.marginRight,
          align: "center",
          font: "Helvetica-Oblique",
          size: 10,
          color: COLORS.muted,
        },
      );

      currentY += 56;
    }

    if (currentY + endingHeight > bottomLimit) {
      doc.addPage({ margin: 0 });
      bodyStart = drawHeader(doc, input, true);
      currentY = bodyStart + 6;
    }

    currentY = drawTotalsCard(doc, input, currentY + 8) + 14;
    currentY = drawOptionalNotes(doc, input, currentY);
    drawApprovalAndSignature(doc, input, currentY);

    drawFooters(doc, input.order.orderNumber);

    doc.end();
  });
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  input: {
    business: PurchaseOrderDocumentBusiness;
    order: PurchaseOrderDocumentOrder;
  },
  continuation: boolean,
) {
  const left = PAGE.marginLeft;
  const right = PAGE.width - PAGE.marginRight;
  const top = PAGE.marginTop;
  const headerHeight = continuation ? 66 : 88;

  drawRoundedRect(doc, left, top, right - left, headerHeight, 14, COLORS.brand);

  const textX = left + 18;
  const textW = 250;

  drawText(doc, input.business.name || "Business", textX, top + 16, {
    width: textW,
    font: "Helvetica-Bold",
    size: continuation ? 15 : 18,
    color: COLORS.white,
    ellipsis: true,
    lineBreak: false,
  });

  drawText(
    doc,
    input.business.legalName || "Business purchase document",
    textX,
    top + 40,
    {
      width: textW,
      font: "Helvetica",
      size: 9,
      color: "#e5e7eb",
      ellipsis: true,
      lineBreak: false,
    },
  );

  if (!continuation) {
    drawText(doc, "PURCHASE ORDER", textX, top + 66, {
      width: 240,
      font: "Helvetica-Bold",
      size: 11,
      color: "#d1d5db",
      lineBreak: false,
    });
  } else {
    drawText(doc, "PURCHASE ORDER", textX, top + 48, {
      width: 220,
      font: "Helvetica-Bold",
      size: 12,
      color: COLORS.white,
      lineBreak: false,
    });
  }

  const metaWidth = 208;
  const metaX = right - metaWidth - 14;
  const metaY = top + 10;
  const metaHeight = continuation ? 46 : 66;

  drawRoundedRect(doc, metaX, metaY, metaWidth, metaHeight, 10, COLORS.white);

  drawText(doc, "ORDER DATE", metaX + 12, metaY + 9, {
    width: 70,
    font: "Helvetica-Bold",
    size: 7.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawText(doc, formatDate(new Date()), metaX + 92, metaY + 8, {
    width: metaWidth - 104,
    align: "right",
    font: "Helvetica-Bold",
    size: 10,
    color: COLORS.ink,
    lineBreak: false,
  });

  drawLine(doc, metaX + 12, metaY + 26, metaX + metaWidth - 12, metaY + 26);

  drawText(doc, "ORDER NO.", metaX + 12, metaY + 35, {
    width: 74,
    font: "Helvetica-Bold",
    size: 7.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawText(doc, safeText(input.order.orderNumber), metaX + 88, metaY + 34, {
    width: metaWidth - 100,
    align: "right",
    font: "Helvetica-Bold",
    size: input.order.orderNumber.length > 24 ? 8.7 : 9.6,
    color: COLORS.ink,
    ellipsis: true,
    lineBreak: false,
  });

  if (!continuation) {
    drawLine(doc, metaX + 12, metaY + 50, metaX + metaWidth - 12, metaY + 50);

    drawText(doc, "STATUS", metaX + 12, metaY + 56, {
      width: 60,
      font: "Helvetica-Bold",
      size: 7.5,
      color: COLORS.muted,
      lineBreak: false,
    });

    drawText(
      doc,
      formatPurchaseOrderStatus(input.order.status),
      metaX + 92,
      metaY + 55,
      {
        width: metaWidth - 104,
        align: "right",
        font: "Helvetica-Bold",
        size: 9.5,
        color: COLORS.ink,
        ellipsis: true,
        lineBreak: false,
      },
    );
  }

  return top + (continuation ? 80 : 106);
}

function drawSupplierAndOrderInfo(
  doc: PDFKit.PDFDocument,
  input: {
    business: PurchaseOrderDocumentBusiness;
    sender: PurchaseOrderDocumentSender;
    order: PurchaseOrderDocumentOrder;
  },
  y: number,
) {
  const left = PAGE.marginLeft;
  const right = PAGE.width - PAGE.marginRight;
  const gap = 16;
  const cardWidth = (right - left - gap) / 2;
  const cardHeight = 140;

  drawRoundedRect(
    doc,
    left,
    y,
    cardWidth,
    cardHeight,
    12,
    COLORS.soft,
    COLORS.softLine,
  );
  drawRoundedRect(
    doc,
    left + cardWidth + gap,
    y,
    cardWidth,
    cardHeight,
    12,
    COLORS.soft,
    COLORS.softLine,
  );

  sectionTitle(doc, "Supplier", left + 14, y + 12, cardWidth - 28);

  drawText(doc, input.order.supplierName, left + 14, y + 30, {
    width: cardWidth - 28,
    font: "Helvetica-Bold",
    size: 11,
    color: COLORS.ink,
    ellipsis: true,
  });

  infoRow(
    doc,
    "Contact",
    input.order.supplierContactPerson || "-",
    left + 14,
    y + 54,
    cardWidth - 28,
    58,
  );
  infoRow(
    doc,
    "Phone",
    input.order.supplierPhone || "-",
    left + 14,
    y + 74,
    cardWidth - 28,
    58,
  );
  infoRow(
    doc,
    "Email",
    input.order.supplierEmail || "-",
    left + 14,
    y + 94,
    cardWidth - 28,
    58,
  );

  const infoX = left + cardWidth + gap + 14;

  sectionTitle(doc, "Purchase Order Info", infoX, y + 12, cardWidth - 28);

  infoRow(
    doc,
    "Location",
    input.order.deliveryBranchName || "To confirm",
    infoX,
    y + 32,
    cardWidth - 28,
    62,
  );
  infoRow(
    doc,
    "Reference",
    input.order.reference || input.order.orderNumber,
    infoX,
    y + 52,
    cardWidth - 28,
    62,
  );
  infoRow(
    doc,
    "Expected",
    input.order.expectedDeliveryDate
      ? formatDate(input.order.expectedDeliveryDate)
      : "To confirm",
    infoX,
    y + 72,
    cardWidth - 28,
    62,
  );
  infoRow(
    doc,
    "Prepared",
    input.sender.name || input.sender.email || "Rurix user",
    infoX,
    y + 92,
    cardWidth - 28,
    62,
  );
  infoRow(
    doc,
    "Status",
    formatPurchaseOrderStatus(input.order.status),
    infoX,
    y + 112,
    cardWidth - 28,
    62,
  );

  return y + cardHeight + 18;
}

function getColumns(): TableColumn[] {
  return [
    { key: "itemNo", label: "#", x: 40, width: 34, align: "center" },
    {
      key: "item",
      label: "ITEM DESCRIPTION",
      x: 76,
      width: 274,
      align: "left",
    },
    { key: "qty", label: "QTY", x: 352, width: 52, align: "center" },
    { key: "price", label: "UNIT PRICE", x: 406, width: 72, align: "right" },
    { key: "total", label: "LINE TOTAL", x: 480, width: 76, align: "right" },
  ];
}

function drawTableHeader(doc: PDFKit.PDFDocument, yTop: number) {
  const left = 40;
  const right = 556;
  const headerHeight = 24;
  const cols = getColumns();

  drawRoundedRect(doc, left, yTop, right - left, headerHeight, 8, COLORS.ink);

  cols.forEach((col) => {
    drawText(doc, col.label, col.x + (col.key === "item" ? 4 : 0), yTop + 7, {
      width: col.width - (col.key === "item" ? 4 : 0),
      align: col.align === "left" ? "left" : "center",
      font: "Helvetica-Bold",
      size: 8.5,
      color: COLORS.white,
      lineBreak: false,
    });
  });

  return {
    left,
    right,
    cols,
    contentY: yTop + headerHeight + 8,
  };
}

function measureItemBlock(
  doc: PDFKit.PDFDocument,
  item: PurchaseOrderDocumentItem,
  itemWidth: number,
) {
  const itemName = safeText(item.itemName);
  const sku = safeTextSoft(item.itemSku);
  const skuLine = sku ? `SKU: ${sku}` : "";

  const nameHeight = Math.max(
    13,
    doc.heightOfString(itemName, {
      width: itemWidth,
      align: "left",
      lineGap: 1,
    }),
  );

  const skuHeight = skuLine
    ? doc.heightOfString(skuLine, {
        width: itemWidth,
        align: "left",
        lineGap: 1,
      }) + 2
    : 0;

  const note = safeTextSoft(item.note);
  const noteHeight = note
    ? doc.heightOfString(`Note: ${note}`, {
        width: itemWidth,
        align: "left",
        lineGap: 1,
      }) + 8
    : 0;

  return {
    itemName,
    skuLine,
    note,
    height: Math.max(28, nameHeight + skuHeight + noteHeight + 8),
    nameHeight,
    skuHeight,
  };
}

function drawItemRow(
  doc: PDFKit.PDFDocument,
  input: {
    rowIndex: number;
    item: PurchaseOrderDocumentItem;
    layout: {
      left: number;
      right: number;
      cols: TableColumn[];
      contentY: number;
    };
    y: number;
  },
) {
  const itemNumberColumn = input.layout.cols.find(
    (col) => col.key === "itemNo",
  );
  const itemColumn = input.layout.cols.find((col) => col.key === "item");
  const quantityColumn = input.layout.cols.find((col) => col.key === "qty");
  const priceColumn = input.layout.cols.find((col) => col.key === "price");
  const totalColumn = input.layout.cols.find((col) => col.key === "total");

  if (
    !itemNumberColumn ||
    !itemColumn ||
    !quantityColumn ||
    !priceColumn ||
    !totalColumn
  ) {
    return 0;
  }

  const measured = measureItemBlock(doc, input.item, itemColumn.width - 8);

  if (input.rowIndex % 2 === 0) {
    drawRoundedRect(
      doc,
      input.layout.left,
      input.y - 3,
      input.layout.right - input.layout.left,
      measured.height,
      6,
      COLORS.soft,
    );
  }

  drawText(doc, String(input.rowIndex + 1), itemNumberColumn.x, input.y + 2, {
    width: itemNumberColumn.width,
    align: "center",
    font: "Helvetica",
    size: 9,
    color: COLORS.text,
    lineBreak: false,
  });

  drawText(doc, measured.itemName, itemColumn.x, input.y + 1, {
    width: itemColumn.width,
    align: "left",
    font: "Helvetica-Bold",
    size: 9,
    color: COLORS.ink,
    lineGap: 1,
  });

  if (measured.skuLine) {
    drawText(
      doc,
      measured.skuLine,
      itemColumn.x,
      input.y + measured.nameHeight + 2,
      {
        width: itemColumn.width,
        align: "left",
        font: "Helvetica",
        size: 8,
        color: COLORS.muted,
        lineGap: 1,
      },
    );
  }

  drawText(
    doc,
    `${input.item.quantityOrdered.toLocaleString()} Each`,
    quantityColumn.x,
    input.y + 2,
    {
      width: quantityColumn.width,
      align: "center",
      font: "Helvetica",
      size: input.item.quantityOrdered >= 1000 ? 7.8 : 8.4,
      color: COLORS.text,
      lineBreak: false,
    },
  );

  drawText(
    doc,
    input.item.expectedUnitCostCents === null
      ? "To confirm"
      : money(input.item.expectedUnitCostCents),
    priceColumn.x,
    input.y + 2,
    {
      width: priceColumn.width,
      align: "right",
      font: "Helvetica",
      size: 9,
      color: COLORS.text,
      lineBreak: false,
    },
  );

  drawText(
    doc,
    input.item.expectedLineTotalCents === null
      ? "To confirm"
      : money(input.item.expectedLineTotalCents),
    totalColumn.x,
    input.y + 2,
    {
      width: totalColumn.width,
      align: "right",
      font: "Helvetica-Bold",
      size: 9.2,
      color: COLORS.ink,
      lineBreak: false,
    },
  );

  if (measured.note) {
    drawText(
      doc,
      `Note: ${measured.note}`,
      itemColumn.x,
      input.y + measured.nameHeight + measured.skuHeight + 3,
      {
        width: itemColumn.width,
        align: "left",
        font: "Helvetica-Oblique",
        size: 8,
        color: COLORS.muted,
        lineGap: 1,
      },
    );
  }

  return measured.height;
}

function drawTotalsCard(
  doc: PDFKit.PDFDocument,
  input: {
    order: PurchaseOrderDocumentOrder;
    items: PurchaseOrderDocumentItem[];
  },
  yTop: number,
) {
  const boxWidth = 214;
  const boxHeight = 76;
  const x = PAGE.width - PAGE.marginRight - boxWidth;
  const subtotalCents = input.items.reduce(
    (sum, item) => sum + (item.expectedLineTotalCents || 0),
    0,
  );

  drawRoundedRect(
    doc,
    x,
    yTop,
    boxWidth,
    boxHeight,
    12,
    COLORS.softCard,
    COLORS.softLine,
  );

  drawText(doc, "ORDER SUMMARY", x + 14, yTop + 11, {
    width: boxWidth - 28,
    font: "Helvetica-Bold",
    size: 8.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawLine(
    doc,
    x + 14,
    yTop + 26,
    x + boxWidth - 14,
    yTop + 26,
    COLORS.softLine,
  );

  drawText(doc, "Subtotal", x + 14, yTop + 35, {
    width: 70,
    font: "Helvetica",
    size: 9,
    color: COLORS.text,
    lineBreak: false,
  });

  drawText(doc, money(subtotalCents), x + 90, yTop + 34, {
    width: boxWidth - 104,
    align: "right",
    font: "Helvetica-Bold",
    size: 9.5,
    color: COLORS.ink,
    lineBreak: false,
  });

  drawText(doc, "Total", x + 14, yTop + 55, {
    width: 70,
    font: "Helvetica-Bold",
    size: 10,
    color: COLORS.ink,
    lineBreak: false,
  });

  drawText(doc, money(subtotalCents), x + 90, yTop + 53, {
    width: boxWidth - 104,
    align: "right",
    font: "Helvetica-Bold",
    size: 11,
    color: COLORS.ink,
    lineBreak: false,
  });

  return yTop + boxHeight;
}

function drawOptionalNotes(
  doc: PDFKit.PDFDocument,
  input: {
    order: PurchaseOrderDocumentOrder;
  },
  yTop: number,
) {
  if (!hasMeaningfulNotes(input.order.notes)) {
    return yTop;
  }

  const x = PAGE.marginLeft;
  const width = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

  sectionTitle(doc, "Special Instructions", x, yTop, width);

  const textY = yTop + 20;
  const textHeight = doc.heightOfString(input.order.notes || "", {
    width: width - 20,
    align: "left",
    lineGap: 2,
  });
  const boxHeight = Math.max(44, textHeight + 18);

  drawRoundedRect(
    doc,
    x,
    textY,
    width,
    boxHeight,
    10,
    COLORS.soft,
    COLORS.softLine,
  );

  drawText(doc, input.order.notes || "", x + 10, textY + 9, {
    width: width - 20,
    font: "Helvetica",
    size: 9.2,
    color: COLORS.text,
    lineGap: 2,
  });

  return textY + boxHeight + 16;
}

function drawApprovalAndSignature(
  doc: PDFKit.PDFDocument,
  input: {
    sender: PurchaseOrderDocumentSender;
  },
  yTop: number,
) {
  const x = PAGE.marginLeft;
  const width = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

  sectionTitle(doc, "Approval & Authorization", x, yTop, width);

  const topY = yTop + 22;
  const gap = 16;
  const leftWidth = 248;
  const rightWidth = width - leftWidth - gap;
  const leftX = x;
  const rightX = x + leftWidth + gap;

  drawRoundedRect(
    doc,
    leftX,
    topY,
    leftWidth,
    96,
    12,
    COLORS.soft,
    COLORS.softLine,
  );
  drawRoundedRect(
    doc,
    rightX,
    topY,
    rightWidth,
    96,
    12,
    COLORS.soft,
    COLORS.softLine,
  );

  drawText(doc, "APPROVAL DETAILS", leftX + 12, topY + 10, {
    width: leftWidth - 24,
    font: "Helvetica-Bold",
    size: 8.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  infoRow(
    doc,
    "Prepared",
    input.sender.name || "-",
    leftX + 12,
    topY + 32,
    leftWidth - 24,
    58,
  );
  infoRow(
    doc,
    "Email",
    input.sender.email || "-",
    leftX + 12,
    topY + 52,
    leftWidth - 24,
    58,
  );
  infoRow(
    doc,
    "Date",
    formatDate(new Date()),
    leftX + 12,
    topY + 72,
    leftWidth - 24,
    58,
  );

  drawText(doc, "SIGNATURE & STAMP", rightX + 12, topY + 10, {
    width: rightWidth - 24,
    font: "Helvetica-Bold",
    size: 8.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawText(doc, "Authorized signature", rightX + 12, topY + 34, {
    width: 120,
    font: "Helvetica",
    size: 8,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawLine(
    doc,
    rightX + 12,
    topY + 64,
    rightX + 128,
    topY + 64,
    COLORS.lineDark,
    0.9,
  );

  drawText(doc, "Sign above", rightX + 12, topY + 68, {
    width: 120,
    font: "Helvetica-Oblique",
    size: 7.5,
    color: COLORS.lightText,
    lineBreak: false,
  });

  const stampBoxX = rightX + rightWidth - 112;
  const stampBoxY = topY + 28;
  const stampBoxWidth = 88;
  const stampBoxHeight = 46;

  drawRoundedRect(
    doc,
    stampBoxX,
    stampBoxY,
    stampBoxWidth,
    stampBoxHeight,
    10,
    null,
    COLORS.line,
  );

  drawText(doc, "Official stamp", stampBoxX, stampBoxY + 16, {
    width: stampBoxWidth,
    align: "center",
    font: "Helvetica-Oblique",
    size: 8.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  return topY + 96;
}

function measureEndingSectionHeight(
  doc: PDFKit.PDFDocument,
  input: {
    order: PurchaseOrderDocumentOrder;
  },
) {
  let height = 76 + 18;

  if (hasMeaningfulNotes(input.order.notes)) {
    const notesHeight = doc.heightOfString(input.order.notes || "", {
      width: PAGE.width - PAGE.marginLeft - PAGE.marginRight - 20,
      align: "left",
      lineGap: 2,
    });

    height += 20 + Math.max(44, notesHeight + 18) + 16;
  }

  height += 22 + 96;

  return height;
}

function sectionTitle(
  doc: PDFKit.PDFDocument,
  label: string,
  x: number,
  y: number,
  width: number,
) {
  drawText(doc, label.toUpperCase(), x, y, {
    width,
    font: "Helvetica-Bold",
    size: 8.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawLine(doc, x, y + 14, x + width, y + 14, COLORS.softLine);
}

function infoRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  labelWidth = 80,
) {
  drawText(doc, label, x, y, {
    width: labelWidth,
    font: "Helvetica-Bold",
    size: 8.5,
    color: COLORS.muted,
    lineBreak: false,
  });

  drawText(doc, safeTextSoft(value, "-"), x + labelWidth + 8, y, {
    width: width - labelWidth - 8,
    font: "Helvetica",
    size: 9,
    color: COLORS.text,
    ellipsis: true,
    lineBreak: false,
  });
}

function drawText(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  options: TextOptions = {},
) {
  doc.fillColor(options.color || COLORS.text);
  doc.font(options.font || "Helvetica");
  doc.fontSize(options.size || 10);
  doc.text(String(value == null ? "" : value), x, y, {
    width: options.width,
    align: options.align,
    ellipsis: options.ellipsis,
    lineGap: options.lineGap,
    lineBreak: options.lineBreak,
  });
}

function drawLine(
  doc: PDFKit.PDFDocument,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = COLORS.line,
  width = 1,
) {
  doc
    .lineWidth(width)
    .strokeColor(color)
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke();
}

function drawRoundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 8,
  fill: string | null = null,
  stroke: string | null = null,
  lineWidth = 1,
) {
  if (fill) {
    doc.save();
    doc.fillColor(fill).roundedRect(x, y, width, height, radius).fill();
    doc.restore();
  }

  if (stroke) {
    doc.save();
    doc
      .lineWidth(lineWidth)
      .strokeColor(stroke)
      .roundedRect(x, y, width, height, radius)
      .stroke();
    doc.restore();
  }
}

function drawFooters(doc: PDFKit.PDFDocument, orderNumber: string) {
  const range = doc.bufferedPageRange();

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);

    const page = index + 1 - range.start;
    const totalPages = range.count;

    drawLine(
      doc,
      PAGE.marginLeft,
      790,
      PAGE.width - PAGE.marginRight,
      790,
      COLORS.softLine,
    );

    drawText(doc, `Purchase Order ${orderNumber}`, PAGE.marginLeft, 806, {
      width: 180,
      font: "Helvetica",
      size: 7.5,
      color: COLORS.lightText,
      lineBreak: false,
    });

    drawText(doc, `Page ${page} of ${totalPages}`, 250, 806, {
      width: 95,
      align: "center",
      font: "Helvetica",
      size: 7.5,
      color: COLORS.lightText,
      lineBreak: false,
    });

    drawText(doc, "Powered by Rurix", 420, 806, {
      width: 135,
      align: "right",
      font: "Helvetica",
      size: 7.5,
      color: COLORS.lightText,
      lineBreak: false,
    });
  }
}

export async function sendPurchaseOrderEmail(input: {
  business: PurchaseOrderDocumentBusiness;
  sender: PurchaseOrderDocumentSender;
  order: PurchaseOrderDocumentOrder;
  items: PurchaseOrderDocumentItem[];
  to: string;
  subject: string;
  message: string;
  pdfBuffer: Buffer;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RURIX_EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false as const,
      reason: "Email sending is not configured on this deployment.",
    };
  }

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    to: [input.to],
    subject: input.subject,
    html: buildPurchaseOrderEmailHtml({
      business: input.business,
      sender: input.sender,
      order: input.order,
      items: input.items,
      message: input.message,
    }),
    attachments: [
      {
        filename: getPurchaseOrderPdfFileName(input.order.orderNumber),
        content: input.pdfBuffer.toString("base64"),
      },
    ],
  });

  if (result.error) {
    return {
      ok: false as const,
      reason: result.error.message || "Email could not be sent.",
    };
  }

  return {
    ok: true as const,
  };
}

function hasMeaningfulNotes(value: string | null | undefined) {
  const text = safeTextSoft(value);

  if (!text) {
    return false;
  }

  const normalized = text.toLowerCase();

  if (["test", "ok", "none", "n/a", "-", "."].includes(normalized)) {
    return false;
  }

  return text.length >= 4;
}

function formatPurchaseOrderStatus(status: string | null | undefined) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  const labels: Record<string, string> = {
    draft: "Draft",
    ordered: "Ordered",
    sent: "Sent",
    partially_received: "Partially received",
    partly_received: "Partially received",
    fully_received: "Fully received",
    received: "Fully received",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    closed: "Closed",
    official: "Issued",
  };

  return labels[normalized] || "Issued";
}

function formatDate(value: Date | string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return `RWF ${Math.round(value / 100).toLocaleString()}`;
}

function safeText(value: string | null | undefined, fallback = "-") {
  const text = value == null ? "" : String(value).trim();

  return text || fallback;
}

function safeTextSoft(value: string | null | undefined, fallback = "") {
  const text = value == null ? "" : String(value).trim();

  return text || fallback;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
