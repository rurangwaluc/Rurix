"use client";

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MapPinPlus,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type {
  CurrentUserResponse,
  StaffMember,
  StaffRole,
} from "../../lib/api";
import type {
  StaffEditFormState,
  StaffFormState,
  StaffLocationAssignFormState,
  StaffPasswordFormState,
} from "./app-types";

import { AsyncButton } from "../async-button";
import { StatusBadge } from "../status-badge";

const availableRoles: Array<{
  value: StaffRole;
  label: string;
  helper: string;
}> = [
  {
    value: "SELLER",
    label: "Seller",
    helper: "Creates customer requests",
  },
  {
    value: "CASHIER",
    label: "Cashier",
    helper: "Records payments",
  },
  {
    value: "STOREKEEPER",
    label: "Storekeeper",
    helper: "Releases stock",
  },
  {
    value: "SERVICE_STAFF",
    label: "Service staff",
    helper: "Completes service work",
  },
  {
    value: "MANAGER",
    label: "Manager",
    helper: "Handles reviews and exceptions",
  },
  {
    value: "ADMIN",
    label: "Admin",
    helper: "Manages staff and locations",
  },
];

type StaffViewProps = {
  context: CurrentUserResponse;
  staff: StaffMember[];
  selectedStaff: StaffMember | null;
  staffForm: StaffFormState;
  staffEditForm: StaffEditFormState;
  staffPasswordForm: StaffPasswordFormState;
  staffLocationAssignForm: StaffLocationAssignFormState;
  canManageStaff: boolean;
  canSeeStaff: boolean;
  isStaffLoading: boolean;
  isCreatingStaff: boolean;
  isUpdatingStaff: boolean;
  isResettingPassword: boolean;
  isAssigningLocation: boolean;
  isRemovingAccess: boolean;
  showStaffPassword: boolean;
  showResetPassword: boolean;
  changingStaffId: string;
  removingAccessKey: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdateStaff: (event: React.FormEvent<HTMLFormElement>) => void;
  onResetPassword: (event: React.FormEvent<HTMLFormElement>) => void;
  onAssignLocation: (event: React.FormEvent<HTMLFormElement>) => void;
  onRemoveStaffRole: (branchId: string, role: StaffRole) => void;
  onRemoveStaffLocation: (branchId: string) => void;
  onSelectStaff: (member: StaffMember) => void;
  onCloseDetails: () => void;
  onToggleRole: (role: StaffRole) => void;
  onToggleAssignRole: (role: StaffRole) => void;
  onToggleStaffStatus: (member: StaffMember) => void;
  onSetShowStaffPassword: React.Dispatch<React.SetStateAction<boolean>>;
  onSetShowResetPassword: React.Dispatch<React.SetStateAction<boolean>>;
  onSetStaffForm: React.Dispatch<React.SetStateAction<StaffFormState>>;
  onSetStaffEditForm: React.Dispatch<React.SetStateAction<StaffEditFormState>>;
  onSetStaffPasswordForm: React.Dispatch<
    React.SetStateAction<StaffPasswordFormState>
  >;
  onSetStaffLocationAssignForm: React.Dispatch<
    React.SetStateAction<StaffLocationAssignFormState>
  >;
};

export function StaffView({
  context,
  staff,
  selectedStaff,
  staffForm,
  staffEditForm,
  staffPasswordForm,
  staffLocationAssignForm,
  canManageStaff,
  canSeeStaff,
  isStaffLoading,
  isCreatingStaff,
  isUpdatingStaff,
  isResettingPassword,
  isAssigningLocation,
  isRemovingAccess,
  showStaffPassword,
  showResetPassword,
  changingStaffId,
  removingAccessKey,
  onSubmit,
  onUpdateStaff,
  onResetPassword,
  onAssignLocation,
  onRemoveStaffRole,
  onRemoveStaffLocation,
  onSelectStaff,
  onCloseDetails,
  onToggleRole,
  onToggleAssignRole,
  onToggleStaffStatus,
  onSetShowStaffPassword,
  onSetShowResetPassword,
  onSetStaffForm,
  onSetStaffEditForm,
  onSetStaffPasswordForm,
  onSetStaffLocationAssignForm,
}: StaffViewProps) {
  if (!canManageStaff && !canSeeStaff) {
    return (
      <section className="rounded-section bg-surface p-6 shadow-card">
        <StatusBadge variant="warning">Limited access</StatusBadge>
        <h2 className="mt-4 text-2xl font-extrabold">
          Staff management is not available for your access.
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-muted-foreground">
          Ask the owner or business admin if you need staff management access.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-section bg-surface p-5 shadow-card sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <StatusBadge variant="primary">Staff</StatusBadge>
              <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">
                Staff access and responsibilities
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-muted-foreground">
                Create staff, open full details, update information, assign or
                remove responsibilities, and reset access.
              </p>
            </div>

            <div className="rounded-panel bg-panel p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Staff members
              </p>
              <p className="number-font mt-2 text-2xl font-extrabold">
                {staff.length}
              </p>
            </div>
          </div>
        </section>

        <section
          className={[
            "grid gap-5",
            canManageStaff ? "xl:grid-cols-[0.9fr_1.1fr]" : "grid-cols-1",
          ].join(" ")}
        >
          {canManageStaff ? (
            <CreateStaffForm
              context={context}
              staffForm={staffForm}
              showStaffPassword={showStaffPassword}
              isCreatingStaff={isCreatingStaff}
              onSubmit={onSubmit}
              onToggleRole={onToggleRole}
              onSetStaffForm={onSetStaffForm}
              onSetShowStaffPassword={onSetShowStaffPassword}
            />
          ) : null}

          <StaffList
            staff={staff}
            isLoading={isStaffLoading}
            selectedStaffId={selectedStaff?.id || ""}
            changingStaffId={changingStaffId}
            onSelectStaff={onSelectStaff}
            onToggleStatus={onToggleStaffStatus}
          />
        </section>
      </div>

      {selectedStaff ? (
        <StaffDetailsDrawer
          context={context}
          member={selectedStaff}
          canManageStaff={canManageStaff}
          editForm={staffEditForm}
          passwordForm={staffPasswordForm}
          assignForm={staffLocationAssignForm}
          isUpdatingStaff={isUpdatingStaff}
          isResettingPassword={isResettingPassword}
          isAssigningLocation={isAssigningLocation}
          isRemovingAccess={isRemovingAccess}
          showResetPassword={showResetPassword}
          removingAccessKey={removingAccessKey}
          onClose={onCloseDetails}
          onUpdateStaff={onUpdateStaff}
          onResetPassword={onResetPassword}
          onAssignLocation={onAssignLocation}
          onRemoveStaffRole={onRemoveStaffRole}
          onRemoveStaffLocation={onRemoveStaffLocation}
          onToggleAssignRole={onToggleAssignRole}
          onSetEditForm={onSetStaffEditForm}
          onSetPasswordForm={onSetStaffPasswordForm}
          onSetAssignForm={onSetStaffLocationAssignForm}
          onSetShowResetPassword={onSetShowResetPassword}
        />
      ) : null}
    </>
  );
}

function CreateStaffForm({
  context,
  staffForm,
  showStaffPassword,
  isCreatingStaff,
  onSubmit,
  onToggleRole,
  onSetStaffForm,
  onSetShowStaffPassword,
}: {
  context: CurrentUserResponse;
  staffForm: StaffFormState;
  showStaffPassword: boolean;
  isCreatingStaff: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleRole: (role: StaffRole) => void;
  onSetStaffForm: React.Dispatch<React.SetStateAction<StaffFormState>>;
  onSetShowStaffPassword: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-section bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
            New staff member
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em]">
            Create staff access
          </h2>
        </div>
        <Plus className="h-6 w-6 text-primary" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name">
          <input
            required
            value={staffForm.fullName}
            onChange={(event) =>
              onSetStaffForm((current) => ({
                ...current,
                fullName: event.target.value,
              }))
            }
            className="h-12 w-full rounded-control border border-border bg-background px-4 text-sm font-bold outline-none transition focus:border-primary"
            placeholder="Example: Jean Uwimana"
          />
        </Field>

        <Field label="Email">
          <input
            required
            type="email"
            value={staffForm.email}
            onChange={(event) =>
              onSetStaffForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            className="h-12 w-full rounded-control border border-border bg-background px-4 text-sm font-bold outline-none transition focus:border-primary"
            placeholder="staff@example.com"
          />
        </Field>

        <Field label="Phone">
          <input
            value={staffForm.phone}
            onChange={(event) =>
              onSetStaffForm((current) => ({
                ...current,
                phone: event.target.value,
              }))
            }
            className="h-12 w-full rounded-control border border-border bg-background px-4 text-sm font-bold outline-none transition focus:border-primary"
            placeholder="Optional"
          />
        </Field>

        <Field label="Temporary password">
          <PasswordInput
            value={staffForm.password}
            show={showStaffPassword}
            placeholder="At least 8 characters"
            inputBackgroundClassName="bg-background"
            onToggle={() => onSetShowStaffPassword((current) => !current)}
            onChange={(value) =>
              onSetStaffForm((current) => ({
                ...current,
                password: value,
              }))
            }
          />
        </Field>

        <Field label="Location">
          <select
            required
            value={staffForm.branchId}
            onChange={(event) =>
              onSetStaffForm((current) => ({
                ...current,
                branchId: event.target.value,
              }))
            }
            className="h-12 w-full rounded-control border border-border bg-background px-4 text-sm font-bold outline-none transition focus:border-primary"
          >
            <option value="">Choose location</option>
            {context.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <RolePicker selectedRoles={staffForm.roles} onToggleRole={onToggleRole} />

      <div className="mt-6 flex justify-end">
        <AsyncButton
          type="submit"
          isLoading={isCreatingStaff}
          loadingText="Creating staff..."
          className="w-full sm:w-auto"
        >
          Create staff
          <ArrowRight className="h-4 w-4" />
        </AsyncButton>
      </div>
    </form>
  );
}

function StaffList({
  staff,
  isLoading,
  selectedStaffId,
  changingStaffId,
  onSelectStaff,
  onToggleStatus,
}: {
  staff: StaffMember[];
  isLoading: boolean;
  selectedStaffId: string;
  changingStaffId: string;
  onSelectStaff: (member: StaffMember) => void;
  onToggleStatus: (member: StaffMember) => void;
}) {
  if (isLoading) {
    return (
      <section className="rounded-section bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-5 h-8 w-48 animate-pulse-soft rounded-control bg-muted" />
        <div className="space-y-3">
          <div className="h-24 animate-pulse-soft rounded-panel bg-muted" />
          <div className="h-24 animate-pulse-soft rounded-panel bg-muted" />
          <div className="h-24 animate-pulse-soft rounded-panel bg-muted" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-section bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
            Staff
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em]">
            Staff access
          </h2>
        </div>
        <StatusBadge variant="primary">{staff.length} total</StatusBadge>
      </div>

      {staff.length === 0 ? (
        <div className="rounded-panel border border-dashed border-border bg-background p-6 text-center">
          <UserRound className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-4 text-lg font-extrabold">No staff members yet.</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Create the first staff member and assign their location and
            responsibilities.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((member) => (
            <article
              key={member.id}
              className={[
                "rounded-panel border bg-background p-4 transition",
                selectedStaffId === member.id
                  ? "border-primary shadow-glow"
                  : "border-border hover:border-primary/40",
              ].join(" ")}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => onSelectStaff(member)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-extrabold tracking-[-0.03em]">
                      {member.fullName}
                    </h3>
                    <StatusBadge
                      variant={
                        member.status === "active" ? "success" : "danger"
                      }
                    >
                      {member.status === "active" ? "Active" : "Disabled"}
                    </StatusBadge>
                  </div>

                  <ContactStack email={member.email} phone={member.phone} />

                  <div className="mt-4 flex flex-wrap gap-2">
                    {member.locations.length ? (
                      member.locations.flatMap((location) =>
                        location.roles.map((role) => (
                          <StatusBadge
                            key={`${location.id}-${role}`}
                            variant="neutral"
                          >
                            {formatRole(role)}
                          </StatusBadge>
                        )),
                      )
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">
                        No location assigned.
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex gap-2 sm:flex-col">
                  <AsyncButton
                    variant="secondary"
                    onClick={() => onSelectStaff(member)}
                    className="w-full sm:w-auto"
                  >
                    Details
                  </AsyncButton>

                  <AsyncButton
                    variant="secondary"
                    isLoading={changingStaffId === member.id}
                    loadingText="Updating..."
                    onClick={() => onToggleStatus(member)}
                    className="w-full sm:w-auto"
                  >
                    {member.status === "active" ? "Disable" : "Activate"}
                  </AsyncButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StaffDetailsDrawer({
  context,
  member,
  canManageStaff,
  editForm,
  passwordForm,
  assignForm,
  isUpdatingStaff,
  isResettingPassword,
  isAssigningLocation,
  isRemovingAccess,
  showResetPassword,
  removingAccessKey,
  onClose,
  onUpdateStaff,
  onResetPassword,
  onAssignLocation,
  onRemoveStaffRole,
  onRemoveStaffLocation,
  onToggleAssignRole,
  onSetEditForm,
  onSetPasswordForm,
  onSetAssignForm,
  onSetShowResetPassword,
}: {
  context: CurrentUserResponse;
  member: StaffMember;
  canManageStaff: boolean;
  editForm: StaffEditFormState;
  passwordForm: StaffPasswordFormState;
  assignForm: StaffLocationAssignFormState;
  isUpdatingStaff: boolean;
  isResettingPassword: boolean;
  isAssigningLocation: boolean;
  isRemovingAccess: boolean;
  showResetPassword: boolean;
  removingAccessKey: string;
  onClose: () => void;
  onUpdateStaff: (event: React.FormEvent<HTMLFormElement>) => void;
  onResetPassword: (event: React.FormEvent<HTMLFormElement>) => void;
  onAssignLocation: (event: React.FormEvent<HTMLFormElement>) => void;
  onRemoveStaffRole: (branchId: string, role: StaffRole) => void;
  onRemoveStaffLocation: (branchId: string) => void;
  onToggleAssignRole: (role: StaffRole) => void;
  onSetEditForm: React.Dispatch<React.SetStateAction<StaffEditFormState>>;
  onSetPasswordForm: React.Dispatch<
    React.SetStateAction<StaffPasswordFormState>
  >;
  onSetAssignForm: React.Dispatch<
    React.SetStateAction<StaffLocationAssignFormState>
  >;
  onSetShowResetPassword: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close staff details"
        className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[42rem] flex-col bg-surface shadow-card">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
              Staff details
            </p>
            <h2 className="mt-2 truncate text-2xl font-extrabold tracking-[-0.035em]">
              {member.fullName}
            </h2>
            <ContactStack email={member.email} phone={member.phone} compact />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-muted-foreground transition hover:text-foreground"
            aria-label="Close staff details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-panel bg-panel p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Status
              </p>
              <div className="mt-3">
                <StatusBadge
                  variant={member.status === "active" ? "success" : "danger"}
                >
                  {member.status === "active" ? "Active" : "Disabled"}
                </StatusBadge>
              </div>
            </div>

            <div className="rounded-panel bg-panel p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Locations
              </p>
              <p className="number-font mt-2 text-2xl font-extrabold">
                {member.locations.length}
              </p>
            </div>
          </div>

          <div className="rounded-panel bg-panel p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
              Locations and responsibilities
            </p>

            <div className="mt-3 space-y-3">
              {member.locations.length ? (
                member.locations.map((location) => (
                  <div
                    key={location.id}
                    className="rounded-control border border-border bg-background px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold">
                          {location.name}
                          {location.isMain ? (
                            <span className="ml-2 text-xs text-primary">
                              Main location
                            </span>
                          ) : null}
                        </p>
                        {canManageStaff ? (
                          <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                            Remove one responsibility or remove this location
                            access completely.
                          </p>
                        ) : null}
                      </div>

                      {canManageStaff ? (
                        <AsyncButton
                          type="button"
                          variant="secondary"
                          isLoading={
                            isRemovingAccess &&
                            removingAccessKey === location.id
                          }
                          loadingText="Removing..."
                          onClick={() => onRemoveStaffLocation(location.id)}
                          className="h-9 shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline">Location</span>
                        </AsyncButton>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {location.roles.map((role) => {
                        const accessKey = `${location.id}-${role}`;

                        return (
                          <span
                            key={role}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5"
                          >
                            <span className="text-xs font-extrabold text-muted-foreground">
                              {formatRole(role)}
                            </span>

                            {canManageStaff ? (
                              <button
                                type="button"
                                disabled={isRemovingAccess}
                                onClick={() =>
                                  onRemoveStaffRole(location.id, role)
                                }
                                className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Remove ${formatRole(role)}`}
                                title={`Remove ${formatRole(role)}`}
                              >
                                {isRemovingAccess &&
                                removingAccessKey === accessKey ? (
                                  <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </button>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">
                  No location assigned.
                </p>
              )}
            </div>
          </div>

          {canManageStaff ? (
            <>
              <form
                onSubmit={onAssignLocation}
                className="rounded-panel border border-border bg-background p-4"
              >
                <div className="mb-4 flex items-center gap-2">
                  <MapPinPlus className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-extrabold">
                    Assign another location
                  </h3>
                </div>

                <Field label="Location">
                  <select
                    required
                    value={assignForm.branchId}
                    onChange={(event) =>
                      onSetAssignForm((current) => ({
                        ...current,
                        branchId: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-control border border-border bg-surface px-4 text-sm font-bold outline-none transition focus:border-primary"
                  >
                    <option value="">Choose location</option>
                    {context.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <RolePicker
                  selectedRoles={assignForm.roles}
                  onToggleRole={onToggleAssignRole}
                />

                <div className="mt-5 flex justify-end">
                  <AsyncButton
                    type="submit"
                    isLoading={isAssigningLocation}
                    loadingText="Assigning..."
                    className="w-full sm:w-auto"
                  >
                    Assign location
                    <MapPinPlus className="h-4 w-4" />
                  </AsyncButton>
                </div>
              </form>

              <form
                onSubmit={onUpdateStaff}
                className="rounded-panel border border-border bg-background p-4"
              >
                <div className="mb-4 flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-extrabold">Update details</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name">
                    <input
                      required
                      value={editForm.fullName}
                      onChange={(event) =>
                        onSetEditForm((current) => ({
                          ...current,
                          fullName: event.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-control border border-border bg-surface px-4 text-sm font-bold outline-none transition focus:border-primary"
                    />
                  </Field>

                  <Field label="Email">
                    <input
                      required
                      type="email"
                      value={editForm.email}
                      onChange={(event) =>
                        onSetEditForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-control border border-border bg-surface px-4 text-sm font-bold outline-none transition focus:border-primary"
                    />
                  </Field>

                  <Field label="Phone">
                    <input
                      value={editForm.phone}
                      onChange={(event) =>
                        onSetEditForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-control border border-border bg-surface px-4 text-sm font-bold outline-none transition focus:border-primary"
                      placeholder="Optional"
                    />
                  </Field>
                </div>

                <div className="mt-5 flex justify-end">
                  <AsyncButton
                    type="submit"
                    isLoading={isUpdatingStaff}
                    loadingText="Saving..."
                    className="w-full sm:w-auto"
                  >
                    Save changes
                    <RefreshCcw className="h-4 w-4" />
                  </AsyncButton>
                </div>
              </form>

              <form
                onSubmit={onResetPassword}
                className="rounded-panel border border-border bg-background p-4"
              >
                <div className="mb-4 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-extrabold">Reset password</h3>
                </div>

                <Field label="New temporary password">
                  <PasswordInput
                    value={passwordForm.password}
                    show={showResetPassword}
                    placeholder="At least 8 characters"
                    inputBackgroundClassName="bg-background"
                    onToggle={() =>
                      onSetShowResetPassword((current) => !current)
                    }
                    onChange={(value) =>
                      onSetPasswordForm({
                        password: value,
                      })
                    }
                  />
                </Field>

                <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">
                  Resetting the password signs this staff member out of active
                  sessions.
                </p>

                <div className="mt-5 flex justify-end">
                  <AsyncButton
                    type="submit"
                    variant="secondary"
                    isLoading={isResettingPassword}
                    loadingText="Resetting..."
                    className="w-full sm:w-auto"
                  >
                    Reset password
                    <KeyRound className="h-4 w-4" />
                  </AsyncButton>
                </div>
              </form>
            </>
          ) : (
            <div className="rounded-panel bg-panel p-4">
              <p className="text-sm font-bold text-muted-foreground">
                You can view staff details, but updating details requires owner
                or admin access.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ContactStack({
  email,
  phone,
  compact = false,
}: {
  email: string;
  phone: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3 space-y-1.5" : "mt-2 space-y-1.5"}>
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Mail className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{email}</span>
      </div>

      {phone ? (
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{phone}</span>
        </div>
      ) : null}
    </div>
  );
}

function RolePicker({
  selectedRoles,
  onToggleRole,
}: {
  selectedRoles: StaffRole[];
  onToggleRole: (role: StaffRole) => void;
}) {
  return (
    <div className="mt-5">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
        Responsibilities
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {availableRoles.map((role) => {
          const checked = selectedRoles.includes(role.value);

          return (
            <button
              key={role.value}
              type="button"
              onClick={() => onToggleRole(role.value)}
              className={[
                "rounded-panel border p-4 text-left transition",
                checked
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/45",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <span
                  className={[
                    "grid h-5 w-5 place-items-center rounded-full border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  ].join(" ")}
                >
                  {checked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="text-sm font-extrabold">{role.label}</span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
                {role.helper}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  show,
  placeholder,
  inputBackgroundClassName,
  onToggle,
  onChange,
}: {
  value: string;
  show: boolean;
  placeholder: string;
  inputBackgroundClassName: string;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <input
        required
        type={show ? "text" : "password"}
        minLength={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          "h-12 w-full rounded-control border border-border px-4 pr-12 text-sm font-bold outline-none transition focus:border-primary",
          inputBackgroundClassName,
        ].join(" ")}
        placeholder={placeholder}
      />

      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatRole(role: string) {
  return role
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
