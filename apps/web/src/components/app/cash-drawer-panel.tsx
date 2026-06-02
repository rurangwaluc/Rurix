"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Banknote,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Unlock,
} from "lucide-react";

import {
  closeCashDrawer,
  getCurrentCashDrawer,
  openCashDrawer,
  type CashDrawerSession,
} from "../../lib/cash-drawer-api";
import { StatusBadge } from "../status-badge";

type CashDrawerPanelProps = {
  branchId: string;
  paymentMethod: string;
  canOpen: boolean;
  canClose: boolean;
  canView: boolean;
  isOwner: boolean;
  onDrawerChanged?: (session: CashDrawerSession | null) => void;
};

export function CashDrawerPanel({
  branchId,
  paymentMethod,
  canOpen,
  canClose,
  canView,
  isOwner,
  onDrawerChanged,
}: CashDrawerPanelProps) {
  const [session, setSession] = useState<CashDrawerSession | null>(null);
  const [businessDay, setBusinessDay] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isCashPayment = paymentMethod === "cash";
  const isOpen = session?.status === "open";
  const isClosedToday = session?.status === "closed";

  const countedCashCents = toCents(countedCash);
  const expectedCashCents = session?.expectedCashCents || 0;
  const differenceCents = countedCash.trim()
    ? countedCashCents - expectedCashCents
    : 0;
  const needsDifferenceReason = countedCash.trim() && differenceCents !== 0;

  const drawerTone = useMemo(() => {
    if (!isCashPayment) return "neutral";
    if (isOpen) return "ready";
    return "blocked";
  }, [isCashPayment, isOpen]);

  useEffect(() => {
    if (!branchId || !canView) {
      setIsLoading(false);
      return;
    }

    void reloadDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, canView]);

  async function reloadDrawer() {
    setIsLoading(true);
    setError("");

    try {
      const result = await getCurrentCashDrawer(branchId);
      setSession(result.session);
      setBusinessDay(result.businessDay);
      onDrawerChanged?.(result.session);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load the cash drawer.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpenDrawer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canOpen) {
      setError("You do not have access to open the cash drawer.");
      return;
    }

    if (isClosedToday && ownerOverride && !reopenReason.trim()) {
      setError("Add a reason before reopening this cash drawer.");
      return;
    }

    setIsOpening(true);
    setError("");
    setSuccess("");

    try {
      const payload: Parameters<typeof openCashDrawer>[0] = {
        branchId,
        openingCashCents: toCents(openingCash),
      };

      const cleanNote = note.trim();
      const cleanReopenReason = reopenReason.trim();

      if (cleanNote) payload.note = cleanNote;

      if (ownerOverride) {
        payload.ownerOverride = true;
        payload.reopenReason = cleanReopenReason;
      }

      const result = await openCashDrawer(payload);

      setSession(result.session);
      onDrawerChanged?.(result.session);
      setOpeningCash("");
      setNote("");
      setOwnerOverride(false);
      setReopenReason("");
      setSuccess(
        ownerOverride
          ? "Cash drawer reopened successfully."
          : "Cash drawer opened successfully.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not open the cash drawer.",
      );
    } finally {
      setIsOpening(false);
    }
  }

  async function handleCloseDrawer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canClose) {
      setError("You do not have access to close the cash drawer.");
      return;
    }

    if (needsDifferenceReason && !differenceReason.trim()) {
      setError(
        "Add a reason because the cash counted is different from the expected cash.",
      );
      return;
    }

    setIsClosing(true);
    setError("");
    setSuccess("");

    try {
      const payload: Parameters<typeof closeCashDrawer>[0] = {
        branchId,
        countedCashCents,
      };

      const cleanNote = note.trim();
      const cleanDifferenceReason = differenceReason.trim();

      if (cleanNote) payload.note = cleanNote;
      if (cleanDifferenceReason) {
        payload.differenceReason = cleanDifferenceReason;
      }

      const result = await closeCashDrawer(payload);

      setSession(result.session);
      onDrawerChanged?.(result.session);
      setCountedCash("");
      setNote("");
      setDifferenceReason("");
      setSuccess("Cash drawer closed successfully.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not close the cash drawer.",
      );
    } finally {
      setIsClosing(false);
    }
  }

  if (!canView) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-section border border-border bg-surface shadow-card">
      <div className="relative p-4 sm:p-5">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                variant={
                  drawerTone === "ready"
                    ? "success"
                    : drawerTone === "blocked"
                      ? "warning"
                      : "primary"
                }
              >
                Cash drawer
              </StatusBadge>

              {businessDay ? (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-black text-muted-foreground">
                  {businessDay}
                </span>
              ) : null}
            </div>

            <h3 className="mt-3 text-xl font-black">
              {isOpen
                ? "Drawer is open"
                : isClosedToday
                  ? "Drawer is closed for today"
                  : "No drawer open today"}
            </h3>

            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
              {isCashPayment
                ? isOpen
                  ? "Cash sales can be recorded. Rurix will add cash payments to the expected drawer cash."
                  : "Open the drawer before taking cash. Non-cash payments do not need a cash drawer."
                : "This payment method does not use the cash drawer."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void reloadDrawer()}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition hover:border-primary/50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw
              className={["h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")}
            />
            Refresh
          </button>
        </div>

        {error ? <AlertCard tone="danger" message={error} /> : null}
        {success ? <AlertCard tone="success" message={success} /> : null}

        {isLoading ? (
          <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-2xl border border-border bg-background"
              />
            ))}
          </div>
        ) : (
          <div className="relative mt-4 grid gap-2 sm:grid-cols-3">
            <CashMetric
              label="Opening cash"
              value={money(session?.openingCashCents || 0)}
            />
            <CashMetric
              label="Expected cash"
              value={money(session?.expectedCashCents || 0)}
            />
            <CashMetric
              label="Cash counted"
              value={
                session?.countedCashCents === null ||
                session?.countedCashCents === undefined
                  ? "Not counted"
                  : money(session.countedCashCents)
              }
            />
          </div>
        )}

        {session?.differenceCents !== null &&
        session?.differenceCents !== undefined ? (
          <div
            className={[
              "relative mt-4 rounded-3xl border p-4",
              session.differenceCents === 0
                ? "border-success/25 bg-success/10 text-success"
                : "border-warning/25 bg-warning/10 text-warning",
            ].join(" ")}
          >
            <p className="text-xs font-black uppercase tracking-[0.16em]">
              Difference
            </p>
            <p className="mt-1 text-xl font-black">
              {formatSignedMoney(session.differenceCents)}
            </p>
            {session.differenceReason ? (
              <p className="mt-2 text-sm font-bold leading-6">
                {session.differenceReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {!isOpen ? (
          <form onSubmit={handleOpenDrawer} className="relative mt-5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField
                label={isClosedToday ? "Cash in drawer now" : "Opening cash"}
                value={openingCash}
                onChange={setOpeningCash}
                type="number"
                min="0"
              />

              <InputField
                label="Opening note"
                value={note}
                onChange={setNote}
                placeholder="Optional"
              />
            </div>

            {isClosedToday ? (
              <div className="rounded-3xl border border-warning/25 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-warning">
                      Drawer already closed today
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-warning">
                      It can normally be opened again tomorrow. Owner override
                      can reopen it today with a reason.
                    </p>
                  </div>
                </div>

                {isOwner ? (
                  <div className="mt-4 space-y-3">
                    <label className="flex items-center justify-between gap-4 rounded-2xl border border-warning/25 bg-background px-3 py-3 text-sm font-black">
                      <span>Owner override</span>
                      <input
                        type="checkbox"
                        checked={ownerOverride}
                        onChange={(event) =>
                          setOwnerOverride(event.target.checked)
                        }
                      />
                    </label>

                    {ownerOverride ? (
                      <TextAreaField
                        label="Reopen reason"
                        value={reopenReason}
                        onChange={setReopenReason}
                        placeholder="Explain why the drawer is being reopened today"
                        required
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isOpening || (isClosedToday && !ownerOverride)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpening ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : isClosedToday ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              {isOpening
                ? "Opening..."
                : isClosedToday
                  ? "Reopen drawer"
                  : "Open cash drawer"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleCloseDrawer}
            className="relative mt-5 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField
                label="Cash counted"
                value={countedCash}
                onChange={setCountedCash}
                type="number"
                min="0"
                required
              />

              <InputField
                label="Closing note"
                value={note}
                onChange={setNote}
                placeholder="Optional"
              />
            </div>

            {countedCash.trim() ? (
              <div
                className={[
                  "rounded-3xl border p-4",
                  differenceCents === 0
                    ? "border-success/25 bg-success/10 text-success"
                    : "border-warning/25 bg-warning/10 text-warning",
                ].join(" ")}
              >
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Difference preview
                </p>
                <p className="mt-1 text-xl font-black">
                  {formatSignedMoney(differenceCents)}
                </p>
                <p className="mt-1 text-sm font-bold leading-6">
                  {differenceCents === 0
                    ? "Cash counted matches expected cash."
                    : differenceCents > 0
                      ? "Cash counted is above expected. Add a reason before closing."
                      : "Cash counted is below expected. Add a reason before closing."}
                </p>
              </div>
            ) : null}

            {needsDifferenceReason ? (
              <TextAreaField
                label="Reason for difference"
                value={differenceReason}
                onChange={setDifferenceReason}
                placeholder="Explain why cash counted is above or below expected"
                required
              />
            ) : null}

            <button
              type="submit"
              disabled={isClosing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-warning/25 bg-warning px-4 py-3 text-sm font-black text-white shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isClosing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {isClosing ? "Closing..." : "Close cash drawer"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function CashMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-background p-3">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-2 truncate text-base font-black sm:text-lg">{value}</p>
    </div>
  );
}

function AlertCard({
  tone,
  message,
}: {
  tone: "success" | "danger";
  message: string;
}) {
  return (
    <div
      className={[
        "relative mt-4 rounded-2xl border px-4 py-3 text-sm font-bold",
        tone === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  min,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        min={min}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none transition focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        rows={3}
        className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none transition focus:border-primary"
      />
    </label>
  );
}

function toCents(value: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numberValue * 100));
}

function money(value: number) {
  return `${Math.round(value / 100).toLocaleString()} RWF`;
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";

  return `${sign}${money(Math.abs(value))}`;
}
