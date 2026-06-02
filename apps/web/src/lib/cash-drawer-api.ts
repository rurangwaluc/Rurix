import { apiRequest } from "./api";

export type CashDrawerStatus = "open" | "closed";

export type CashDrawerMovementType =
  | "opening_cash"
  | "cash_sale"
  | "manual_cash_in"
  | "manual_cash_out"
  | "drawer_reopened"
  | "drawer_closed";

export type CashDrawerSession = {
  id: string;
  businessId: string;
  branchId: string;
  branchName: string;
  businessDay: string;
  status: CashDrawerStatus;
  openingCashCents: number;
  expectedCashCents: number;
  countedCashCents: number | null;
  differenceCents: number | null;
  closeNote: string | null;
  differenceReason: string | null;
  openedByUserId: string;
  openedByName: string | null;
  closedByUserId: string | null;
  closedByName: string | null;
  reopenedByUserId: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
  openedAt: string;
  closedAt: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashDrawerMovement = {
  id: string;
  cashDrawerSessionId: string;
  businessId: string;
  branchId: string;
  movementType: CashDrawerMovementType;
  amountCents: number;
  expectedCashBeforeCents: number;
  expectedCashAfterCents: number;
  reason: string | null;
  note: string | null;
  reference: string | null;
  actorUserId: string | null;
  actorName: string | null;
  saleId: string | null;
  salePaymentId: string | null;
  createdAt: string;
};

export type CashDrawerCurrentResponse = {
  ok: true;
  session: CashDrawerSession | null;
  businessDay: string;
};

export type CashDrawerActionResponse = {
  ok: true;
  session: CashDrawerSession | null;
};

export type CashDrawerDetailResponse = {
  ok: true;
  session: CashDrawerSession;
  movements: CashDrawerMovement[];
};

export type OpenCashDrawerPayload = {
  branchId: string;
  openingCashCents: number;
  note?: string;
  ownerOverride?: boolean;
  reopenReason?: string;
};

export type CloseCashDrawerPayload = {
  branchId: string;
  countedCashCents: number;
  note?: string;
  differenceReason?: string;
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
  return apiRequest<CashDrawerCurrentResponse>(
    `/cash-drawer/current${buildQuery({ branchId })}`,
    {
      auth: true,
    },
  );
}

export function openCashDrawer(payload: OpenCashDrawerPayload) {
  return apiRequest<CashDrawerActionResponse>("/cash-drawer/open", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function closeCashDrawer(payload: CloseCashDrawerPayload) {
  return apiRequest<CashDrawerActionResponse>("/cash-drawer/close", {
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
