import { apiRequest } from "./api";

export type CashDrawerStatus = "open" | "closed";

export type CashDrawerMovementType =
  | "opening_cash"
  | "cash_sale"
  | "cash_in"
  | "cash_out"
  | "closing_adjustment";

export type CashDrawerSession = {
  id: string;
  branchId: string;
  branchName: string;
  status: CashDrawerStatus;
  openingCashCents: number;
  expectedCashCents: number;
  countedCashCents: number | null;
  differenceCents: number | null;
  notes: string | null;
  closeNotes: string | null;
  openedByName: string | null;
  closedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashDrawerMovement = {
  id: string;
  cashDrawerSessionId: string;
  saleId: string | null;
  salePaymentId: string | null;
  saleNumber: string | null;
  receiptNumber: string | null;
  movementType: CashDrawerMovementType;
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  reason: string | null;
  reference: string | null;
  actorName: string | null;
  createdAt: string;
};

export type CashDrawerDetailResponse = {
  ok: true;
  session: CashDrawerSession;
  movements: CashDrawerMovement[];
};

export type OpenCashDrawerPayload = {
  branchId: string;
  openingCashCents: number;
  notes?: string;
};

export type CloseCashDrawerPayload = {
  branchId: string;
  countedCashCents: number;
  notes?: string;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const value = query.toString();

  return value ? `?${value}` : "";
}

export function getCurrentCashDrawer(branchId: string) {
  return apiRequest<{
    ok: true;
    session: CashDrawerSession | null;
  }>(`/cash-drawer/current${buildQuery({ branchId })}`, {
    auth: true,
  });
}

export function openCashDrawer(payload: OpenCashDrawerPayload) {
  return apiRequest<CashDrawerDetailResponse>("/cash-drawer/open", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function closeCashDrawer(payload: CloseCashDrawerPayload) {
  return apiRequest<CashDrawerDetailResponse>("/cash-drawer/close", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function listCashDrawerSessions(
  params: {
    branchId?: string;
    status?: CashDrawerStatus;
  } = {},
) {
  return apiRequest<{
    ok: true;
    sessions: CashDrawerSession[];
  }>(
    `/cash-drawer/sessions${buildQuery({
      branchId: params.branchId,
      status: params.status,
    })}`,
    {
      auth: true,
    },
  );
}

export function getCashDrawerSession(sessionId: string) {
  return apiRequest<CashDrawerDetailResponse>(
    `/cash-drawer/sessions/${sessionId}`,
    {
      auth: true,
    },
  );
}
