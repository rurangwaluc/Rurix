"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  LockKeyhole,
  Save,
} from "lucide-react";

import {
  getBusinessDocumentSettings,
  updateBusinessDocumentSettings,
  type BusinessDocumentSettings,
  type TaxMode,
} from "../../../lib/business-settings-api";

type DocumentTaxSettingsPanelProps = {
  canEdit: boolean;
};

type FormState = {
  taxLabel: string;
  taxRatePercent: string;
  taxMode: TaxMode;
  showTaxOnReceipts: boolean;
  showTaxOnInvoices: boolean;
  businessTin: string;
};

const defaultForm: FormState = {
  taxLabel: "VAT",
  taxRatePercent: "18",
  taxMode: "included_in_prices",
  showTaxOnReceipts: true,
  showTaxOnInvoices: true,
  businessTin: "",
};

export function DocumentTaxSettingsPanel({
  canEdit,
}: DocumentTaxSettingsPanelProps) {
  const [settings, setSettings] = useState<BusinessDocumentSettings | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setIsLoading(true);
      setError("");

      try {
        const result = await getBusinessDocumentSettings();

        if (!active) return;

        setSettings(result.settings);
        setForm({
          taxLabel: result.settings.taxLabel,
          taxRatePercent: String(result.settings.taxRatePercent),
          taxMode: result.settings.taxMode,
          showTaxOnReceipts: result.settings.showTaxOnReceipts,
          showTaxOnInvoices: result.settings.showTaxOnInvoices,
          businessTin: result.settings.businessTin || "",
        });
      } catch (caughtError) {
        if (!active) return;

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load document settings.",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const taxPreview = useMemo(() => {
    const rate = Number(form.taxRatePercent);

    if (!Number.isFinite(rate) || rate < 0) {
      return null;
    }

    const exampleTotal = 100000;

    if (form.taxMode === "included_in_prices") {
      const tax = Math.round((exampleTotal * rate) / (100 + rate));
      const subtotal = exampleTotal - tax;

      return {
        title: "Tax included in product prices",
        lines: [
          ["Customer pays", money(exampleTotal)],
          [`Subtotal before ${form.taxLabel || "tax"}`, money(subtotal)],
          [`${form.taxLabel || "Tax"} ${rate}%`, money(tax)],
        ],
      };
    }

    if (form.taxMode === "added_on_top") {
      const tax = Math.round((exampleTotal * rate) / 100);
      const total = exampleTotal + tax;

      return {
        title: "Tax added on top of product prices",
        lines: [
          ["Products total", money(exampleTotal)],
          [`${form.taxLabel || "Tax"} ${rate}%`, money(tax)],
          ["Customer pays", money(total)],
        ],
      };
    }

    return {
      title: "No tax shown on documents",
      lines: [["Document total", money(exampleTotal)]],
    };
  }, [form.taxLabel, form.taxMode, form.taxRatePercent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const taxRatePercent = Number(form.taxRatePercent);

    if (!form.taxLabel.trim()) {
      setError("Add a tax label.");
      return;
    }

    if (
      !Number.isFinite(taxRatePercent) ||
      taxRatePercent < 0 ||
      taxRatePercent > 100
    ) {
      setError("Tax rate must be between 0 and 100.");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await updateBusinessDocumentSettings({
        taxLabel: form.taxLabel.trim(),
        taxRatePercent,
        taxMode: form.taxMode,
        showTaxOnReceipts: form.showTaxOnReceipts,
        showTaxOnInvoices: form.showTaxOnInvoices,
        businessTin: form.businessTin.trim(),
      });

      setSettings(result.settings);
      setForm({
        taxLabel: result.settings.taxLabel,
        taxRatePercent: String(result.settings.taxRatePercent),
        taxMode: result.settings.taxMode,
        showTaxOnReceipts: result.settings.showTaxOnReceipts,
        showTaxOnInvoices: result.settings.showTaxOnInvoices,
        businessTin: result.settings.businessTin || "",
      });
      setSuccess("Document and tax settings saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save document settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <DocumentTaxSettingsSkeleton />;
  }

  return (
    <section className="overflow-hidden rounded-section border border-border bg-surface shadow-card">
      <div className="border-b border-border bg-panel px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-primary">
              <FileText className="h-4 w-4" />
              Documents
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight">
              Document & tax settings
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-muted-foreground">
              Control how receipts, invoices, proformas, and delivery documents
              show tax details for this business.
            </p>
          </div>

          {!canEdit ? (
            <div className="rounded-panel border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
              <span className="inline-flex items-center gap-2">
                <LockKeyhole className="h-4 w-4" />
                Only the owner can update these settings.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1fr_22rem]"
      >
        <div className="grid gap-5">
          {error ? (
            <div className="rounded-panel border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-panel border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {success}
              </span>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tax label" help="Example: VAT, Tax, Service tax">
              <input
                value={form.taxLabel}
                disabled={!canEdit || isSaving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    taxLabel: event.target.value,
                  }))
                }
                className="w-full rounded-control border border-border bg-background px-4 py-3 text-sm font-bold outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="VAT"
              />
            </Field>

            <Field
              label="Tax rate"
              help="Use 18 for Rwanda VAT when applicable."
            >
              <div className="flex overflow-hidden rounded-control border border-border bg-background focus-within:border-primary">
                <input
                  value={form.taxRatePercent}
                  disabled={!canEdit || isSaving}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      taxRatePercent: event.target.value,
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-bold outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  inputMode="decimal"
                  placeholder="18"
                />
                <span className="grid w-12 place-items-center border-l border-border text-sm font-black text-muted-foreground">
                  %
                </span>
              </div>
            </Field>
          </div>

          <Field
            label="Tax mode"
            help="Choose whether product prices already include tax or tax is added after products are selected."
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <TaxModeCard
                active={form.taxMode === "included_in_prices"}
                disabled={!canEdit || isSaving}
                title="Included in prices"
                description="The customer pays the product price shown in POS. Documents split tax from the same total."
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    taxMode: "included_in_prices",
                  }))
                }
              />

              <TaxModeCard
                active={form.taxMode === "added_on_top"}
                disabled={!canEdit || isSaving}
                title="Added on top"
                description="Tax is added after products are selected. Customer total becomes products plus tax."
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    taxMode: "added_on_top",
                  }))
                }
              />

              <TaxModeCard
                active={form.taxMode === "no_tax"}
                disabled={!canEdit || isSaving}
                title="No tax shown"
                description="Documents show products total, paid amount, and balance without tax breakdown."
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    taxMode: "no_tax",
                  }))
                }
              />
            </div>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <ToggleCard
              checked={form.showTaxOnReceipts}
              disabled={!canEdit || isSaving}
              title="Show tax on receipts"
              description="Receipts will include the tax breakdown when tax mode allows it."
              onChange={() =>
                setForm((current) => ({
                  ...current,
                  showTaxOnReceipts: !current.showTaxOnReceipts,
                }))
              }
            />

            <ToggleCard
              checked={form.showTaxOnInvoices}
              disabled={!canEdit || isSaving}
              title="Show tax on invoices"
              description="Invoices and proformas will include the tax breakdown when tax mode allows it."
              onChange={() =>
                setForm((current) => ({
                  ...current,
                  showTaxOnInvoices: !current.showTaxOnInvoices,
                }))
              }
            />
          </div>

          <Field
            label="Business TIN"
            help="Optional. This will appear on documents when filled."
          >
            <input
              value={form.businessTin}
              disabled={!canEdit || isSaving}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  businessTin: event.target.value,
                }))
              }
              className="w-full rounded-control border border-border bg-background px-4 py-3 text-sm font-bold outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Business TIN"
            />
          </Field>

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold leading-6 text-muted-foreground">
              These settings control how tax appears on printed business
              documents and sales totals.
            </p>

            {canEdit ? (
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-control bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "Saving..." : "Save settings"}
              </button>
            ) : null}
          </div>
        </div>

        <aside className="rounded-section border border-border bg-panel p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Preview
          </p>

          <h3 className="mt-3 text-lg font-black">
            {taxPreview?.title || "Tax preview"}
          </h3>

          <div className="mt-5 grid gap-3">
            {taxPreview?.lines.map(([label, value]) => (
              <div
                key={label}
                className="rounded-panel border border-border bg-background px-4 py-3"
              >
                <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-base font-black">{value}</p>
              </div>
            ))}
          </div>

          {settings ? (
            <div className="mt-5 rounded-panel border border-border bg-background px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Last updated
              </p>
              <p className="mt-1 text-sm font-bold">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(settings.updatedAt))}
              </p>
            </div>
          ) : null}
        </aside>
      </form>
    </section>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      {help ? (
        <span className="mt-1 block text-xs font-semibold leading-5 text-muted-foreground">
          {help}
        </span>
      ) : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function TaxModeCard({
  active,
  disabled,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-panel border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-primary bg-primary/10 text-foreground shadow-soft"
          : "border-border bg-background hover:border-primary/40",
      ].join(" ")}
    >
      <span className="text-sm font-black">{title}</span>
      <span className="mt-2 block text-xs font-semibold leading-6 text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

function ToggleCard({
  checked,
  disabled,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className="flex items-start justify-between gap-4 rounded-panel border border-border bg-background p-4 text-left transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-2 block text-xs font-semibold leading-6 text-muted-foreground">
          {description}
        </span>
      </span>

      <span
        className={[
          "mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition",
          checked ? "bg-primary" : "bg-muted",
        ].join(" ")}
      >
        <span
          className={[
            "h-5 w-5 rounded-full bg-white shadow-soft transition",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

function DocumentTaxSettingsSkeleton() {
  return (
    <section className="rounded-section border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="h-5 w-40 animate-pulse rounded-full bg-muted" />
      <div className="mt-5 h-8 w-72 max-w-full animate-pulse rounded-control bg-muted" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-control bg-muted" />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="h-24 animate-pulse rounded-panel bg-muted" />
        <div className="h-24 animate-pulse rounded-panel bg-muted" />
      </div>

      <div className="mt-5 h-40 animate-pulse rounded-panel bg-muted" />
      <div className="mt-5 h-20 animate-pulse rounded-panel bg-muted" />
    </section>
  );
}

function money(value: number) {
  return `${Math.round(value).toLocaleString()} RWF`;
}
