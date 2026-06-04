import { apiRequest } from "./api";

export type TaxMode = "included_in_prices" | "added_on_top" | "no_tax";

export type BusinessDocumentSettings = {
  businessId: string;
  taxLabel: string;
  taxRatePercent: number;
  taxRateBasisPoints: number;
  taxMode: TaxMode;
  showTaxOnReceipts: boolean;
  showTaxOnInvoices: boolean;
  businessTin: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateBusinessDocumentSettingsPayload = {
  taxLabel: string;
  taxRatePercent: number;
  taxMode: TaxMode;
  showTaxOnReceipts: boolean;
  showTaxOnInvoices: boolean;
  businessTin?: string;
};

export function getBusinessDocumentSettings() {
  return apiRequest<{
    ok: true;
    settings: BusinessDocumentSettings;
  }>("/settings/document", {
    auth: true,
  });
}

export function updateBusinessDocumentSettings(
  payload: UpdateBusinessDocumentSettingsPayload,
) {
  return apiRequest<{
    ok: true;
    settings: BusinessDocumentSettings;
  }>("/settings/document", {
    method: "PATCH",
    auth: true,
    body: payload,
  });
}
