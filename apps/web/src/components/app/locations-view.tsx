"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, MapPinHouse, Plus, Search, X } from "lucide-react";

import {
  createLocation,
  listLocations,
  updateLocation,
  type BusinessLocation,
  type BusinessLocationStatus,
} from "../../lib/api";
import type { AppAccess } from "./app-permissions";
import { StatusBadge } from "../status-badge";

type LocationForm = {
  name: string;
  code: string;
  address: string;
  status: BusinessLocationStatus;
  isMain: boolean;
};

const initialLocationForm: LocationForm = {
  name: "",
  code: "",
  address: "",
  status: "active",
  isMain: false,
};

export function LocationsView({
  appAccess,
  onLocationsChanged,
}: {
  appAccess: AppAccess;
  onLocationsChanged: () => Promise<void>;
}) {
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<BusinessLocation | null>(null);

  const [form, setForm] = useState<LocationForm>(initialLocationForm);
  const [search, setSearch] = useState("");
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeLocations = locations.filter(
    (location) => location.status === "active",
  );
  const pausedLocations = locations.filter(
    (location) => location.status !== "active",
  );
  const mainLocation = locations.find((location) => location.isMain);

  const filteredLocations = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) {
      return locations;
    }

    return locations.filter((location) => {
      return `${location.name} ${location.code || ""} ${location.address || ""}`
        .toLowerCase()
        .includes(value);
    });
  }, [locations, search]);

  useEffect(() => {
    void reloadLocations();
  }, []);

  async function reloadLocations() {
    setIsLoading(true);
    setError("");

    try {
      const result = await listLocations();
      setLocations(result.locations);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load locations.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDrawer() {
    setSelectedLocation(null);
    setForm(initialLocationForm);
    setDrawerMode("create");
    setError("");
    setSuccess("");
  }

  function openEditDrawer(location: BusinessLocation) {
    setSelectedLocation(location);
    setForm({
      name: location.name,
      code: location.code || "",
      address: location.address || "",
      status: location.status,
      isMain: location.isMain,
    });
    setDrawerMode("edit");
    setError("");
    setSuccess("");
  }

  function closeDrawer() {
    setDrawerMode(null);
    setSelectedLocation(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appAccess.canManageLocations) {
      setError("You do not have access to manage locations.");
      return;
    }

    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      if (drawerMode === "create") {
        const payload: Parameters<typeof createLocation>[0] = {
          name: form.name.trim(),
        };

        const code = form.code.trim();
        const address = form.address.trim();

        if (code) payload.code = code;
        if (address) payload.address = address;
        if (form.isMain) payload.isMain = true;

        await createLocation(payload);
        setSuccess("Location created successfully.");
      }

      if (drawerMode === "edit" && selectedLocation) {
        const payload: Parameters<typeof updateLocation>[1] = {
          name: form.name.trim(),
          status: form.status,
          isMain: form.isMain,
        };

        const code = form.code.trim();
        const address = form.address.trim();

        if (code) payload.code = code;
        if (address) payload.address = address;

        await updateLocation(selectedLocation.id, payload);
        setSuccess("Location updated successfully.");
      }

      closeDrawer();
      await reloadLocations();
      await onLocationsChanged();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save this location.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-surface shadow-card">
        <div className="relative p-5 sm:p-6 lg:p-7">
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <StatusBadge variant="success">Business locations</StatusBadge>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Control every selling location
              </h1>
              <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-muted-foreground sm:text-base">
                Add stores, warehouses, and selling locations so stock, staff,
                sales, and cash can be tracked in the right place.
              </p>
            </div>

            {appAccess.canManageLocations ? (
              <button
                type="button"
                onClick={openCreateDrawer}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
              >
                <Plus className="h-4 w-4" />
                Add location
              </button>
            ) : null}
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Active locations"
              value={activeLocations.length}
            />
            <MetricCard
              label="Paused locations"
              value={pausedLocations.length}
            />
            <MetricCard
              label="Main location"
              value={mainLocation ? mainLocation.name : "Not set"}
            />
          </div>
        </div>
      </section>

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      <section className="rounded-section border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search location, code, or address"
              className="w-full min-w-0 rounded-2xl border border-border bg-background py-3 pl-9 pr-3 text-sm font-bold outline-none focus:border-primary"
            />
          </div>

          <button
            type="button"
            onClick={() => void reloadLocations()}
            className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-muted-foreground transition hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </section>

      {!appAccess.canManageLocations ? (
        <section className="rounded-section border border-warning/25 bg-warning/10 p-5 text-sm font-bold leading-6 text-warning">
          You can view locations, but you cannot create or update them.
        </section>
      ) : null}

      {isLoading ? <LocationsSkeleton /> : null}

      {!isLoading ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredLocations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              canManageLocations={appAccess.canManageLocations}
              onEdit={() => openEditDrawer(location)}
            />
          ))}
        </section>
      ) : null}

      {!isLoading && filteredLocations.length === 0 ? (
        <section className="rounded-section border border-dashed border-border bg-surface p-8 text-center shadow-card">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-primary/10 text-primary">
            <MapPinHouse className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-black">No locations found</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
            Add a location for a store, warehouse, or place where the business
            sells or keeps stock.
          </p>
        </section>
      ) : null}

      <LocationDrawer
        open={drawerMode !== null}
        title={drawerMode === "edit" ? "Edit location" : "Add location"}
        form={form}
        isSaving={isSaving}
        selectedLocation={selectedLocation}
        onChange={setForm}
        onClose={closeDrawer}
        onSubmit={handleSubmit}
      />
    </section>
  );
}

function LocationCard({
  location,
  canManageLocations,
  onEdit,
}: {
  location: BusinessLocation;
  canManageLocations: boolean;
  onEdit: () => void;
}) {
  return (
    <article className="rounded-[1.75rem] border border-border bg-surface p-4 shadow-card transition hover:border-primary/50 hover:bg-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>

          <h3 className="mt-4 break-words text-xl font-black">
            {location.name}
          </h3>
        </div>

        <div className="flex flex-col items-end gap-2">
          {location.isMain ? (
            <StatusBadge variant="primary">Main</StatusBadge>
          ) : null}

          <StatusBadge
            variant={location.status === "active" ? "success" : "warning"}
          >
            {location.status === "active" ? "Active" : "Paused"}
          </StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <DetailRow label="Location code" value={location.code || "Not set"} />
        <DetailRow label="Address" value={location.address || "Not set"} />
      </div>

      {canManageLocations ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
        >
          Edit location
        </button>
      ) : null}
    </article>
  );
}

function LocationDrawer({
  open,
  title,
  form,
  selectedLocation,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  form: LocationForm;
  selectedLocation: BusinessLocation | null;
  isSaving: boolean;
  onChange: (form: LocationForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) {
    return null;
  }

  const isEditingMainLocation = Boolean(selectedLocation?.isMain);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <aside className="rurix-scrollbar absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto border-l border-border bg-background shadow-2xl sm:max-w-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/95 p-5 backdrop-blur-xl">
          <div>
            <StatusBadge variant="primary">Location setup</StatusBadge>
            <h2 className="mt-3 text-2xl font-black">{title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border bg-surface p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <InputField
            label="Location name"
            value={form.name}
            onChange={(value) => onChange({ ...form, name: value })}
            placeholder="Example: Kigali Downtown"
            required
          />

          <InputField
            label="Location code"
            value={form.code}
            onChange={(value) => onChange({ ...form, code: value })}
            placeholder="Auto-generated if empty"
          />

          <TextAreaField
            label="Address"
            value={form.address}
            onChange={(value) => onChange({ ...form, address: value })}
            placeholder="Street, market, building, or helpful directions"
          />

          <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-extrabold">
            <span>Make this the main location</span>
            <input
              type="checkbox"
              checked={form.isMain}
              onChange={(event) =>
                onChange({ ...form, isMain: event.target.checked })
              }
            />
          </label>

          {selectedLocation ? (
            <SelectField
              label="Status"
              value={form.status}
              disabled={isEditingMainLocation}
              onChange={(value) =>
                onChange({
                  ...form,
                  status: value as BusinessLocationStatus,
                })
              }
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Paused" },
              ]}
            />
          ) : null}

          {isEditingMainLocation ? (
            <p className="rounded-2xl border border-warning/25 bg-warning/10 p-4 text-sm font-bold leading-6 text-warning">
              The main location cannot be paused. Choose another main location
              first if this location should be paused.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : null}
            {isSaving ? "Saving..." : "Save location"}
          </button>
        </form>
      </aside>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-3xl border border-border bg-background/80 p-4 shadow-soft">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-black">{value}</p>
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
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        placeholder={placeholder}
        rows={4}
        className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

function LocationsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-[1.75rem] border border-border bg-surface"
        />
      ))}
    </div>
  );
}
