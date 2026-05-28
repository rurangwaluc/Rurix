"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import {
  createSupplier,
  listSuppliers,
  updateSupplier,
  type Supplier,
  type SupplierStatus,
} from "../../../lib/inventory-api";
import { StatusBadge } from "../../status-badge";

type SupplierForm = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: SupplierStatus;
};

type SuppliersPanelProps = {
  search: string;
  refreshKey: number;
  canManageSuppliers: boolean;
};

const initialSupplierForm: SupplierForm = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  status: "active",
};

export function SuppliersPanel({
  search,
  refreshKey,
  canManageSuppliers,
}: SuppliersPanelProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<SupplierForm>(initialSupplierForm);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCount = useMemo(
    () => suppliers.filter((supplier) => supplier.status === "active").length,
    [suppliers],
  );

  useEffect(() => {
    void reloadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refreshKey]);

  async function reloadSuppliers() {
    setIsLoading(true);
    setError("");

    try {
      const params: Parameters<typeof listSuppliers>[0] = {};
      const searchValue = search.trim();

      if (searchValue) {
        params.search = searchValue;
      }

      const result = await listSuppliers(params);

      setSuppliers(result.suppliers);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load suppliers.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateForm() {
    setSelectedSupplier(null);
    setForm(initialSupplierForm);
    setIsFormOpen(true);
    setError("");
    setSuccess("");
  }

  function openEditForm(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      status: supplier.status,
    });
    setIsFormOpen(true);
    setError("");
    setSuccess("");
  }

  function closeForm() {
    setIsFormOpen(false);
    setSelectedSupplier(null);
    setForm(initialSupplierForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageSuppliers) {
      setError("You do not have access to manage suppliers.");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const basePayload: Parameters<typeof createSupplier>[0] = {
        name: form.name.trim(),
      };

      const contactPerson = cleanOptional(form.contactPerson);
      const phone = cleanOptional(form.phone);
      const email = cleanOptional(form.email);
      const address = cleanOptional(form.address);
      const notes = cleanOptional(form.notes);

      if (contactPerson) basePayload.contactPerson = contactPerson;
      if (phone) basePayload.phone = phone;
      if (email) basePayload.email = email;
      if (address) basePayload.address = address;
      if (notes) basePayload.notes = notes;

      if (selectedSupplier) {
        await updateSupplier(selectedSupplier.id, {
          ...basePayload,
          status: form.status,
        });
        setSuccess("Supplier updated successfully.");
      } else {
        await createSupplier(basePayload);
        setSuccess("Supplier created successfully.");
      }

      closeForm();
      await reloadSuppliers();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save supplier.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <StatusBadge variant="primary">Supplier control</StatusBadge>
            <h2 className="mt-3 text-2xl font-black">Suppliers</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
              Keep supplier contacts clean before creating purchase orders and
              receiving stock from them.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px]">
            <SummaryCard label="Total suppliers" value={suppliers.length} />
            <SummaryCard label="Active suppliers" value={activeCount} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void reloadSuppliers()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground transition hover:border-primary/50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh suppliers
          </button>

          {canManageSuppliers ? (
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Add supplier
            </button>
          ) : (
            <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
              You can view suppliers, but you cannot change them.
            </div>
          )}
        </div>
      </section>

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      {isFormOpen ? (
        <SupplierFormCard
          form={form}
          isSaving={isSaving}
          selectedSupplier={selectedSupplier}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      ) : null}

      {isLoading ? <SupplierSkeleton /> : null}

      {!isLoading && suppliers.length === 0 ? (
        <EmptySupplierState
          search={search}
          canManageSuppliers={canManageSuppliers}
          onAdd={openCreateForm}
        />
      ) : null}

      {!isLoading && suppliers.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              canManageSuppliers={canManageSuppliers}
              onEdit={() => openEditForm(supplier)}
            />
          ))}
        </section>
      ) : null}
    </section>
  );
}

function SupplierFormCard({
  form,
  selectedSupplier,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: SupplierForm;
  selectedSupplier: Supplier | null;
  isSaving: boolean;
  onChange: (value: SupplierForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge variant={selectedSupplier ? "warning" : "success"}>
            {selectedSupplier ? "Edit supplier" : "New supplier"}
          </StatusBadge>
          <h3 className="mt-3 text-xl font-black">
            {selectedSupplier ? "Update supplier details" : "Add supplier"}
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-border bg-background p-2 text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <InputField
          label="Supplier name"
          value={form.name}
          onChange={(value) => onChange({ ...form, name: value })}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Contact person"
            value={form.contactPerson}
            onChange={(value) => onChange({ ...form, contactPerson: value })}
          />
          <InputField
            label="Phone"
            value={form.phone}
            onChange={(value) => onChange({ ...form, phone: value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Email"
            value={form.email}
            onChange={(value) => onChange({ ...form, email: value })}
            type="email"
          />
          <InputField
            label="Address"
            value={form.address}
            onChange={(value) => onChange({ ...form, address: value })}
          />
        </div>

        {selectedSupplier ? (
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
              Status
            </span>
            <select
              value={form.status}
              onChange={(event) =>
                onChange({
                  ...form,
                  status: event.target.value as SupplierStatus,
                })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
            >
              <option value="active">Active</option>
              <option value="inactive">Paused</option>
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Notes
          </span>
          <textarea
            value={form.notes}
            onChange={(event) =>
              onChange({ ...form, notes: event.target.value })
            }
            rows={4}
            className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
            placeholder="Products supplied, payment expectations, or delivery notes"
          />
        </label>

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : null}
          {isSaving
            ? "Saving..."
            : selectedSupplier
              ? "Save supplier"
              : "Create supplier"}
        </button>
      </div>
    </form>
  );
}

function SupplierCard({
  supplier,
  canManageSuppliers,
  onEdit,
}: {
  supplier: Supplier;
  canManageSuppliers: boolean;
  onEdit: () => void;
}) {
  return (
    <article className="flex min-h-full flex-col rounded-[1.75rem] border border-border bg-surface p-4 shadow-card transition hover:border-primary/50 hover:bg-primary/5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          variant={supplier.status === "active" ? "success" : "warning"}
        >
          {supplier.status === "active" ? "Active" : "Paused"}
        </StatusBadge>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="break-words text-lg font-black">{supplier.name}</h3>
          <p className="mt-1 text-sm font-bold text-muted-foreground">
            {supplier.contactPerson || "No contact person added"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <ContactRow
          icon={Phone}
          label="Phone"
          value={supplier.phone || "Not added"}
        />
        <ContactRow
          icon={Mail}
          label="Email"
          value={supplier.email || "Not added"}
        />
        <DetailRow label="Address" value={supplier.address || "Not added"} />
      </div>

      {supplier.notes ? (
        <p className="mt-4 line-clamp-3 rounded-2xl border border-border bg-background p-3 text-sm font-semibold leading-6 text-muted-foreground">
          {supplier.notes}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        {canManageSuppliers ? (
          <button
            type="button"
            onClick={onEdit}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
          >
            Edit supplier
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-center text-sm font-bold text-muted-foreground">
            View only
          </div>
        )}
      </div>
    </article>
  );
}

function EmptySupplierState({
  search,
  canManageSuppliers,
  onAdd,
}: {
  search: string;
  canManageSuppliers: boolean;
  onAdd: () => void;
}) {
  return (
    <section className="rounded-section border border-dashed border-border bg-surface p-8 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        {search.trim() ? (
          <Search className="h-7 w-7" />
        ) : (
          <Building2 className="h-7 w-7" />
        )}
      </div>

      <h2 className="mt-4 text-xl font-black">
        {search.trim() ? "No suppliers found" : "No suppliers yet"}
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
        {search.trim()
          ? "Try another supplier name, phone, email, or contact person."
          : "Add suppliers so purchase orders can be prepared and stock can be received cleanly."}
      </p>

      {canManageSuppliers ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
        >
          Add supplier
        </button>
      ) : null}
    </section>
  );
}

function SupplierSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-64 animate-pulse rounded-[1.75rem] border border-border bg-surface"
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

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-border bg-background p-3">
      <Icon className="mt-0.5 h-4 w-4 text-primary" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-black">{value}</p>
      </div>
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

function InputField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
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
        required={required}
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

function cleanOptional(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}
