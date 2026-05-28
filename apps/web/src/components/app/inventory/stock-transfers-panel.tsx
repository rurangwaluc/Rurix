"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Boxes,
  PackageCheck,
  RefreshCw,
  Repeat2,
  Search,
} from "lucide-react";

import {
  createStockTransfer,
  listStockTransfers,
  type CreateStockTransferPayload,
  type StockTransfer,
} from "../../../lib/inventory-api";
import {
  listStock,
  type BranchStock,
  type CurrentUserResponse,
} from "../../../lib/api";
import { StatusBadge } from "../../status-badge";

type TransferForm = {
  itemId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: string;
  reference: string;
  reason: string;
  note: string;
};

type StockTransfersPanelProps = {
  search: string;
  refreshKey: number;
  branches: CurrentUserResponse["branches"];
  canCreateTransfer: boolean;
};

const initialTransferForm: TransferForm = {
  itemId: "",
  fromBranchId: "",
  toBranchId: "",
  quantity: "",
  reference: "",
  reason: "",
  note: "",
};

export function StockTransfersPanel({
  search,
  refreshKey,
  branches,
  canCreateTransfer,
}: StockTransfersPanelProps) {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [stockRows, setStockRows] = useState<BranchStock[]>([]);
  const [form, setForm] = useState<TransferForm>(initialTransferForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const productOptions = useMemo(() => {
    const productMap = new Map<string, { id: string; name: string }>();

    for (const row of stockRows) {
      productMap.set(row.itemId, {
        id: row.itemId,
        name: row.itemName,
      });
    }

    return [...productMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [stockRows]);

  const selectedProductStockRows = useMemo(() => {
    if (!form.itemId) {
      return stockRows;
    }

    return stockRows.filter((row) => row.itemId === form.itemId);
  }, [form.itemId, stockRows]);

  const sourceStock = useMemo(() => {
    return stockRows.find(
      (row) => row.itemId === form.itemId && row.branchId === form.fromBranchId,
    );
  }, [form.fromBranchId, form.itemId, stockRows]);

  const sourceAvailable = sourceStock?.quantityAvailable || 0;
  const quantity = toInt(form.quantity);
  const isSameLocation =
    Boolean(form.fromBranchId) && form.fromBranchId === form.toBranchId;
  const notEnoughStock = quantity > 0 && sourceAvailable < quantity;

  const totalTransferred = useMemo(
    () => transfers.reduce((total, transfer) => total + transfer.quantity, 0),
    [transfers],
  );

  useEffect(() => {
    void reloadPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refreshKey]);

  async function reloadPanel() {
    setIsLoading(true);
    setError("");

    try {
      const transferParams: Parameters<typeof listStockTransfers>[0] = {};
      const searchValue = search.trim();

      if (searchValue) {
        transferParams.search = searchValue;
      }

      const [transferResult, stockResult] = await Promise.all([
        listStockTransfers(transferParams),
        listStock(),
      ]);

      setTransfers(transferResult.transfers);
      setStockRows(stockResult.stock);

      setForm((current) => {
        if (current.itemId) {
          return current;
        }

        const firstStockRow = stockResult.stock.find(
          (row) => row.quantityAvailable > 0,
        );

        return {
          ...current,
          itemId: firstStockRow?.itemId || "",
          fromBranchId: firstStockRow?.branchId || "",
          toBranchId:
            branches.find((branch) => branch.id !== firstStockRow?.branchId)
              ?.id || "",
        };
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load stock transfers.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateTransfer) {
      setError("You do not have access to transfer stock.");
      return;
    }

    if (!form.itemId || !form.fromBranchId || !form.toBranchId) {
      setError("Choose a product, source location, and receiving location.");
      return;
    }

    if (isSameLocation) {
      setError("Choose two different locations.");
      return;
    }

    if (quantity <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }

    if (notEnoughStock) {
      setError("There is not enough available stock in the source location.");
      return;
    }

    setIsCreating(true);
    setError("");
    setSuccess("");

    try {
      const payload: CreateStockTransferPayload = {
        itemId: form.itemId,
        fromBranchId: form.fromBranchId,
        toBranchId: form.toBranchId,
        quantity,
      };

      const reference = cleanOptional(form.reference);
      const reason = cleanOptional(form.reason);
      const note = cleanOptional(form.note);

      if (reference) payload.reference = reference;
      if (reason) payload.reason = reason;
      if (note) payload.note = note;

      await createStockTransfer(payload);

      setForm((current) => ({
        ...current,
        quantity: "",
        reference: "",
        reason: "",
        note: "",
      }));

      setSuccess("Stock moved successfully.");
      await reloadPanel();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not move stock.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="space-y-4">
      <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <StatusBadge variant="primary">Location movement</StatusBadge>
            <h2 className="mt-3 text-2xl font-black">Stock transfers</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
              Move available stock from one selling location to another while
              keeping both stock records and history accurate.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[340px]">
            <SummaryCard label="Transfers" value={transfers.length} />
            <SummaryCard label="Items moved" value={totalTransferred} />
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => void reloadPanel()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground transition hover:border-primary/50 sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh transfers
          </button>
        </div>
      </section>

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      {canCreateTransfer ? (
        <TransferFormCard
          form={form}
          branches={branches}
          productOptions={productOptions}
          selectedProductStockRows={selectedProductStockRows}
          sourceAvailable={sourceAvailable}
          isSameLocation={isSameLocation}
          notEnoughStock={notEnoughStock}
          isCreating={isCreating}
          onChange={setForm}
          onSubmit={handleCreateTransfer}
        />
      ) : (
        <PermissionCard message="You can view transfers, but you cannot move stock." />
      )}

      {isLoading ? <TransferSkeleton /> : null}

      {!isLoading && transfers.length === 0 ? (
        <EmptyTransferState search={search} />
      ) : null}

      {!isLoading && transfers.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {transfers.map((transfer) => (
            <TransferCard key={transfer.id} transfer={transfer} />
          ))}
        </section>
      ) : null}
    </section>
  );
}

function TransferFormCard({
  form,
  branches,
  productOptions,
  selectedProductStockRows,
  sourceAvailable,
  isSameLocation,
  notEnoughStock,
  isCreating,
  onChange,
  onSubmit,
}: {
  form: TransferForm;
  branches: CurrentUserResponse["branches"];
  productOptions: Array<{ id: string; name: string }>;
  selectedProductStockRows: BranchStock[];
  sourceAvailable: number;
  isSameLocation: boolean;
  notEnoughStock: boolean;
  isCreating: boolean;
  onChange: (value: TransferForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:items-start">
        <div>
          <StatusBadge variant="success">New transfer</StatusBadge>
          <h3 className="mt-3 text-xl font-black">Move stock</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Choose the product, the source location, and the receiving location.
            Rurix will decrease stock from the source and increase stock at the
            receiving location.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Source available
          </p>
          <p className="mt-2 text-3xl font-black">
            {sourceAvailable.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            Only available stock can be moved.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <SelectField
          label="Product"
          value={form.itemId}
          onChange={(value) => {
            const firstSource = selectedProductStockRows.find(
              (row) => row.itemId === value && row.quantityAvailable > 0,
            );

            onChange({
              ...form,
              itemId: value,
              fromBranchId: firstSource?.branchId || form.fromBranchId,
            });
          }}
          options={productOptions.map((product) => ({
            value: product.id,
            label: product.name,
          }))}
        />

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <SelectField
            label="From location"
            value={form.fromBranchId}
            onChange={(value) => onChange({ ...form, fromBranchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />

          <div className="hidden justify-center pb-3 text-primary sm:flex">
            <ArrowRight className="h-5 w-5" />
          </div>

          <SelectField
            label="To location"
            value={form.toBranchId}
            onChange={(value) => onChange({ ...form, toBranchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <InputField
            label="Quantity"
            value={form.quantity}
            onChange={(value) => onChange({ ...form, quantity: value })}
            type="number"
            min="1"
            required
          />
          <InputField
            label="Reference"
            value={form.reference}
            onChange={(value) => onChange({ ...form, reference: value })}
            placeholder="Auto-generated if empty"
          />
          <InputField
            label="Reason"
            value={form.reason}
            onChange={(value) => onChange({ ...form, reason: value })}
            placeholder="Why stock is moving"
          />
        </div>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Note
          </span>
          <textarea
            value={form.note}
            onChange={(event) =>
              onChange({ ...form, note: event.target.value })
            }
            rows={4}
            className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
            placeholder="Driver, handover note, or receiving instruction"
          />
        </label>

        {isSameLocation ? (
          <ValidationCard message="Choose two different locations." />
        ) : null}

        {notEnoughStock ? (
          <ValidationCard message="There is not enough available stock in the source location." />
        ) : null}

        <button
          type="submit"
          disabled={isCreating || isSameLocation || notEnoughStock}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : null}
          {isCreating ? "Moving stock..." : "Move stock"}
        </button>
      </div>
    </form>
  );
}

function TransferCard({ transfer }: { transfer: StockTransfer }) {
  return (
    <article className="flex min-h-full flex-col rounded-[1.75rem] border border-border bg-surface p-4 shadow-card transition hover:border-primary/50 hover:bg-primary/5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant="success">Completed</StatusBadge>
        <StatusBadge variant="primary">{transfer.reference}</StatusBadge>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Repeat2 className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <h3 className="break-words text-lg font-black">
            {transfer.itemName}
          </h3>
          {transfer.itemSku ? (
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              {transfer.itemSku}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-2">
        <LocationBox label="From" value={transfer.fromBranchName} />
        <div className="flex items-center justify-center text-primary">
          <ArrowRight className="h-5 w-5" />
        </div>
        <LocationBox label="To" value={transfer.toBranchName} />
      </div>

      <div className="mt-4 grid gap-2">
        <DetailRow
          label="Quantity moved"
          value={transfer.quantity.toLocaleString()}
        />
        <DetailRow
          label="Recorded by"
          value={transfer.createdByName || "Not recorded"}
        />
        <DetailRow
          label="Date"
          value={new Date(transfer.createdAt).toLocaleString()}
        />
      </div>

      {transfer.reason ? (
        <p className="mt-4 rounded-2xl border border-border bg-background p-3 text-sm font-semibold leading-6 text-muted-foreground">
          {transfer.reason}
        </p>
      ) : null}

      {transfer.note ? (
        <p className="mt-2 rounded-2xl border border-border bg-background p-3 text-sm font-semibold leading-6 text-muted-foreground">
          {transfer.note}
        </p>
      ) : null}
    </article>
  );
}

function EmptyTransferState({ search }: { search: string }) {
  return (
    <section className="rounded-section border border-dashed border-border bg-surface p-8 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        {search.trim() ? (
          <Search className="h-7 w-7" />
        ) : (
          <PackageCheck className="h-7 w-7" />
        )}
      </div>

      <h2 className="mt-4 text-xl font-black">
        {search.trim() ? "No transfers found" : "No stock transfers yet"}
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
        {search.trim()
          ? "Try another product name, product code, location, or transfer reference."
          : "Move stock between locations to keep each selling location accurate."}
      </p>
    </section>
  );
}

function TransferSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-72 animate-pulse rounded-[1.75rem] border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-border bg-background p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value.toLocaleString()}</p>
    </div>
  );
}

function LocationBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      >
        <option value="">Choose</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
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
        "rounded-panel border px-4 py-3 text-sm font-bold",
        tone === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function ValidationCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
      {message}
    </div>
  );
}

function PermissionCard({ message }: { message: string }) {
  return (
    <div className="rounded-section border border-warning/25 bg-warning/10 p-5 text-sm font-bold leading-6 text-warning">
      {message}
    </div>
  );
}

function toInt(value: string, fallback = 0) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.round(numberValue));
}

function cleanOptional(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}
