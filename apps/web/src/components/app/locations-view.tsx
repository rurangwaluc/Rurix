"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MapPinHouse, Plus, Search, X } from "lucide-react";

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

type LocationFilter = "all" | "active" | "paused";

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
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
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

    return locations.filter((location) => {
      const matchesStatus =
        locationFilter === "all" ||
        (locationFilter === "active" && location.status === "active") ||
        (locationFilter === "paused" && location.status !== "active");

      if (!matchesStatus) {
        return false;
      }

      if (!value) {
        return true;
      }

      return `${location.name} ${location.code || ""} ${location.address || ""}`
        .toLowerCase()
        .includes(value);
    });
  }, [locations, locationFilter, search]);

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
    if (!appAccess.canManageLocations) {
      return;
    }

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
    <section className="mx-auto w-full max-w-6xl space-y-4 pb-8">
      <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <StatusBadge variant="primary">Business locations</StatusBadge>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.035em] sm:text-3xl">
              Selling locations
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-muted-foreground">
              Manage stores, warehouses, and places where the business sells or
              keeps stock.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:min-w-[460px] sm:grid-cols-4">
            <MetricCard label="Active" value={activeLocations.length} />
            <MetricCard label="Paused" value={pausedLocations.length} />
            <MetricCard label="Total" value={locations.length} />
            <MetricCard
              label="Main"
              value={mainLocation ? mainLocation.name : "Not set"}
            />
          </div>
        </div>
      </section>

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      {!appAccess.canManageLocations ? (
        <section className="rounded-section border border-warning/25 bg-warning/10 p-5 text-sm font-bold leading-6 text-warning">
          You can view locations, but you cannot create or update them.
        </section>
      ) : null}

      <section className="overflow-hidden rounded-section border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-black">Locations</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
              Open a location to update its code, address, status, or main
              location setting.
            </p>
          </div>

          <StatusBadge variant="primary">
            {filteredLocations.length.toLocaleString()} of{" "}
            {locations.length.toLocaleString()}
          </StatusBadge>
        </div>

        <div className="grid gap-3 border-b border-border px-4 py-3 sm:px-5 lg:grid-cols-[180px_minmax(0,1fr)_120px_auto]">
          <select
            value={locationFilter}
            onChange={(event) =>
              setLocationFilter(event.target.value as LocationFilter)
            }
            className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm font-black outline-none transition focus:border-primary"
          >
            <option value="all">All locations</option>
            <option value="active">Active only</option>
            <option value="paused">Paused only</option>
          </select>

          <label className="block min-w-0">
            <span className="sr-only">Search locations</span>
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-background px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search location, code, or address"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={() => void reloadLocations()}
            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm font-black text-muted-foreground transition hover:text-foreground"
          >
            Refresh
          </button>

          {appAccess.canManageLocations ? (
            <button
              type="button"
              onClick={openCreateDrawer}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Add location
            </button>
          ) : null}
        </div>

        {isLoading ? <LocationsSkeleton /> : null}

        {!isLoading && filteredLocations.length ? (
          <LocationsList
            locations={filteredLocations}
            canManageLocations={appAccess.canManageLocations}
            onOpenLocation={openEditDrawer}
          />
        ) : null}

        {!isLoading && filteredLocations.length === 0 ? (
          <div className="p-4 sm:p-5">
            <div className="rounded-section border border-dashed border-border bg-background p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-primary/10 text-primary">
                <MapPinHouse className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-xl font-black">No locations found</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
                Add a location for a store, warehouse, or place where the
                business sells or keeps stock.
              </p>
            </div>
          </div>
        ) : null}
      </section>

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

function LocationsList({
  locations,
  canManageLocations,
  onOpenLocation,
}: {
  locations: BusinessLocation[];
  canManageLocations: boolean;
  onOpenLocation: (location: BusinessLocation) => void;
}) {
  return (
    <>
      <div className="hidden border-b border-border bg-background/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground md:grid md:grid-cols-[minmax(0,1.1fr)_130px_minmax(0,1.15fr)_104px_86px] md:gap-x-4">
        <div>Location</div>
        <div>Code</div>
        <div>Address</div>
        <div>Status</div>
        <div className="text-right">Action</div>
      </div>

      <div>
        {locations.map((location) => {
          const isActive = location.status === "active";
          const canOpen = canManageLocations;

          return (
            <article
              key={location.id}
              role={canOpen ? "button" : undefined}
              tabIndex={canOpen ? 0 : undefined}
              onClick={() => {
                if (canOpen) {
                  onOpenLocation(location);
                }
              }}
              onKeyDown={(event) => {
                if (canOpen && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onOpenLocation(location);
                }
              }}
              className={[
                "border-b border-border px-4 py-3 last:border-b-0 transition sm:px-5 md:grid md:grid-cols-[minmax(0,1.1fr)_130px_minmax(0,1.15fr)_104px_86px] md:items-center md:gap-x-4 md:px-4",
                canOpen
                  ? "cursor-pointer hover:bg-muted/45 focus:bg-muted/45 focus:outline-none"
                  : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-black text-foreground">
                    {location.name}
                  </p>
                  {location.isMain ? (
                    <StatusBadge variant="primary">Main</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs font-bold text-muted-foreground md:hidden">
                  {location.code || "No code"}
                </p>
              </div>

              <div className="mt-3 min-w-0 md:mt-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {location.code || "No code"}
                </p>
              </div>

              <div className="mt-3 min-w-0 md:mt-0">
                <p className="truncate text-sm font-bold text-muted-foreground">
                  {location.address || "No address"}
                </p>
              </div>

              <div className="mt-3 md:mt-0">
                <StatusBadge variant={isActive ? "success" : "warning"}>
                  {isActive ? "Active" : "Paused"}
                </StatusBadge>
              </div>

              <div className="mt-3 md:mt-0 md:text-right">
                {canManageLocations ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenLocation(location);
                    }}
                    className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground transition hover:border-primary/50 md:w-auto"
                  >
                    Edit
                  </button>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground">
                    View only
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
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
            aria-label="Close location drawer"
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
    <div className="min-w-0 rounded-3xl border border-border bg-background p-3 sm:p-4">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-black sm:text-xl">{value}</p>
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
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="px-4 py-4 sm:px-5">
          <div className="h-5 w-48 animate-pulse rounded-full bg-muted" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
