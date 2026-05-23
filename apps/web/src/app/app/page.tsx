"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  assignStaffLocationRoles,
  createStaff,
  getCurrentUser,
  getStaff,
  listStaff,
  logout,
  removeStaffLocationRoles,
  resetStaffPassword,
  updateStaffDetails,
  updateStaffStatus,
  type CreateStaffPayload,
  type CurrentUserResponse,
  type StaffMember,
  type StaffRole,
  type UpdateStaffDetailsPayload,
} from "../../lib/api";
import { clearAuthToken } from "../../lib/auth";
import { AppHeader } from "../../components/app/app-header";
import {
  AppDesktopSidebar,
  AppMobileSidebar,
} from "../../components/app/app-sidebar";
import { AppSkeleton } from "../../components/app/app-skeleton";
import { DashboardView } from "../../components/app/dashboard-view";
import { StaffView } from "../../components/app/staff-view";
import {
  buildAppAccess,
  canOpenSection,
  type AppAccess,
} from "../../components/app/app-permissions";
import {
  initialStaffEditForm,
  initialStaffForm,
  initialStaffLocationAssignForm,
  initialStaffPasswordForm,
  type AppSection,
  type StaffEditFormState,
  type StaffFormState,
  type StaffLocationAssignFormState,
  type StaffPasswordFormState,
} from "../../components/app/app-types";
import { StatusBadge } from "../../components/status-badge";

export default function AppPage() {
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [context, setContext] = useState<CurrentUserResponse | null>(null);
  const [appAccess, setAppAccess] = useState<AppAccess | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const [staffForm, setStaffForm] = useState<StaffFormState>(initialStaffForm);
  const [staffEditForm, setStaffEditForm] =
    useState<StaffEditFormState>(initialStaffEditForm);
  const [staffPasswordForm, setStaffPasswordForm] =
    useState<StaffPasswordFormState>(initialStaffPasswordForm);
  const [staffLocationAssignForm, setStaffLocationAssignForm] =
    useState<StaffLocationAssignFormState>(initialStaffLocationAssignForm);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drawerNotice, setDrawerNotice] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isStaffLoading, setIsStaffLoading] = useState(true);
  const [isRefreshingStaffDetails, setIsRefreshingStaffDetails] =
    useState(false);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isAssigningLocation, setIsAssigningLocation] = useState(false);
  const [isRemovingAccess, setIsRemovingAccess] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [changingStaffId, setChangingStaffId] = useState("");
  const [removingAccessKey, setRemovingAccessKey] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const me = await getCurrentUser();

        if (!active) {
          return;
        }

        const access = buildAppAccess(me);

        setContext(me);
        setAppAccess(access);
        setActiveSection(access.defaultSection);

        const mainBranch = me.branches.find((branch) => branch.is_main);
        const firstBranch = mainBranch || me.branches[0];

        if (firstBranch) {
          setStaffForm((current) => ({
            ...current,
            branchId: firstBranch.id,
          }));

          setStaffLocationAssignForm((current) => ({
            ...current,
            branchId: firstBranch.id,
          }));
        }

        if (access.canViewStaff) {
          const staffResult = await listStaff();

          if (active) {
            setStaff(staffResult.staff);
          }
        }
      } catch {
        clearAuthToken();
        router.replace("/login");
      } finally {
        if (active) {
          setIsLoading(false);
          setIsStaffLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, [router]);

  async function reloadStaff() {
    if (!context) {
      return;
    }

    const access = appAccess || buildAppAccess(context);

    if (!access.canViewStaff) {
      setStaff([]);
      return;
    }

    setIsStaffLoading(true);

    try {
      const result = await listStaff();
      setStaff(result.staff);

      if (selectedStaff) {
        const matchingStaff = result.staff.find(
          (member) => member.id === selectedStaff.id,
        );

        if (matchingStaff) {
          const details = await getStaff(matchingStaff.id);
          setSelectedStaff(details.staff);
          hydrateStaffEditForm(details.staff);
        } else {
          setSelectedStaff(null);
        }
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load staff.",
      );
    } finally {
      setIsStaffLoading(false);
    }
  }

  async function refreshSelectedStaff(staffId: string) {
    const details = await getStaff(staffId);
    setSelectedStaff(details.staff);
    hydrateStaffEditForm(details.staff);

    const result = await listStaff();
    setStaff(result.staff);
  }

  async function handleLogout() {
    setError("");
    setIsLoggingOut(true);

    try {
      await logout();
      clearAuthToken();
      router.replace("/login");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Sign out failed. Please try again.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function handleCreateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!staffForm.branchId) {
      setError("Choose a location for this staff member.");
      return;
    }

    if (!staffForm.roles.length) {
      setError("Choose at least one responsibility.");
      return;
    }

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setIsCreatingStaff(true);

    const payload: CreateStaffPayload = {
      fullName: staffForm.fullName.trim(),
      email: staffForm.email.trim(),
      password: staffForm.password,
      locationAssignments: [
        {
          branchId: staffForm.branchId,
          roles: staffForm.roles,
        },
      ],
    };

    const phone = staffForm.phone.trim();

    if (phone) {
      payload.phone = phone;
    }

    try {
      await createStaff(payload);
      setSuccess("Staff member created and assigned successfully.");
      setStaffForm((current) => ({
        ...initialStaffForm,
        branchId: current.branchId,
        roles: ["SELLER"],
      }));
      await reloadStaff();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create staff member.",
      );
    } finally {
      setIsCreatingStaff(false);
    }
  }

  async function handleSelectStaff(member: StaffMember) {
    setError("");
    setSuccess("");

    setSelectedStaff(member);
    hydrateStaffEditForm(member);
    setStaffPasswordForm(initialStaffPasswordForm);
    setShowResetPassword(false);

    setIsRefreshingStaffDetails(true);
    setDrawerNotice("Refreshing staff details...");

    try {
      const result = await getStaff(member.id);

      setSelectedStaff((current) => {
        if (!current || current.id !== member.id) {
          return current;
        }

        return result.staff;
      });

      hydrateStaffEditForm(result.staff);
      setDrawerNotice("");
    } catch (caughtError) {
      setDrawerNotice("");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not refresh staff details.",
      );
    } finally {
      setIsRefreshingStaffDetails(false);
    }
  }

  async function handleUpdateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStaff) {
      return;
    }

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setIsUpdatingStaff(true);

    const payload: UpdateStaffDetailsPayload = {
      fullName: staffEditForm.fullName.trim(),
      email: staffEditForm.email.trim(),
    };

    const phone = staffEditForm.phone.trim();

    if (phone) {
      payload.phone = phone;
    }

    try {
      const result = await updateStaffDetails(selectedStaff.id, payload);
      setSelectedStaff(result.staff);
      hydrateStaffEditForm(result.staff);
      setSuccess("Staff details updated successfully.");
      await reloadStaff();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update staff details.",
      );
    } finally {
      setIsUpdatingStaff(false);
    }
  }

  async function handleResetStaffPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStaff) {
      return;
    }

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setIsResettingPassword(true);

    try {
      await resetStaffPassword(selectedStaff.id, {
        password: staffPasswordForm.password,
      });

      setStaffPasswordForm(initialStaffPasswordForm);
      setShowResetPassword(false);
      setSuccess("Staff password reset successfully.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not reset staff password.",
      );
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleAssignStaffLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStaff) {
      return;
    }

    if (!staffLocationAssignForm.branchId) {
      setError("Choose a location to assign.");
      return;
    }

    if (!staffLocationAssignForm.roles.length) {
      setError("Choose at least one responsibility for this location.");
      return;
    }

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setIsAssigningLocation(true);

    try {
      await assignStaffLocationRoles(selectedStaff.id, {
        branchId: staffLocationAssignForm.branchId,
        roles: staffLocationAssignForm.roles,
      });

      await refreshSelectedStaff(selectedStaff.id);
      setSuccess("Location and responsibilities assigned successfully.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not assign this location.",
      );
    } finally {
      setIsAssigningLocation(false);
    }
  }

  async function handleRemoveStaffRole(branchId: string, role: StaffRole) {
    if (!selectedStaff) {
      return;
    }

    const accessKey = `${branchId}-${role}`;

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setRemovingAccessKey(accessKey);
    setIsRemovingAccess(true);

    try {
      await removeStaffLocationRoles(selectedStaff.id, {
        branchId,
        roles: [role],
      });

      await refreshSelectedStaff(selectedStaff.id);
      setSuccess("Responsibility removed successfully.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not remove this responsibility.",
      );
    } finally {
      setRemovingAccessKey("");
      setIsRemovingAccess(false);
    }
  }

  async function handleRemoveStaffLocation(branchId: string) {
    if (!selectedStaff) {
      return;
    }

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setRemovingAccessKey(branchId);
    setIsRemovingAccess(true);

    try {
      await removeStaffLocationRoles(selectedStaff.id, {
        branchId,
      });

      await refreshSelectedStaff(selectedStaff.id);
      setSuccess("Location access removed successfully.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not remove this location access.",
      );
    } finally {
      setRemovingAccessKey("");
      setIsRemovingAccess(false);
    }
  }

  async function handleToggleStaffStatus(member: StaffMember) {
    const nextStatus = member.status === "active" ? "inactive" : "active";

    setError("");
    setSuccess("");
    setDrawerNotice("");
    setChangingStaffId(member.id);

    try {
      await updateStaffStatus(member.id, nextStatus);
      setSuccess(
        nextStatus === "active"
          ? "Staff member has been activated."
          : "Staff member has been disabled.",
      );
      await reloadStaff();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not change staff status.",
      );
    } finally {
      setChangingStaffId("");
    }
  }

  function toggleRole(role: StaffRole) {
    setStaffForm((current) => {
      const exists = current.roles.includes(role);

      return {
        ...current,
        roles: exists
          ? current.roles.filter((item) => item !== role)
          : [...current.roles, role],
      };
    });
  }

  function toggleAssignRole(role: StaffRole) {
    setStaffLocationAssignForm((current) => {
      const exists = current.roles.includes(role);

      return {
        ...current,
        roles: exists
          ? current.roles.filter((item) => item !== role)
          : [...current.roles, role],
      };
    });
  }

  function changeSection(section: AppSection) {
    if (appAccess && !canOpenSection(appAccess, section)) {
      return;
    }

    setActiveSection(section);
    setIsMobileMenuOpen(false);
    setError("");
    setSuccess("");
    setDrawerNotice("");
  }

  function closeStaffDetails() {
    setSelectedStaff(null);
    setDrawerNotice("");
    setIsRefreshingStaffDetails(false);
  }

  function hydrateStaffEditForm(member: StaffMember) {
    setStaffEditForm({
      fullName: member.fullName,
      email: member.email,
      phone: member.phone || "",
    });
  }

  if (isLoading) {
    return <AppSkeleton />;
  }

  if (!context) {
    return null;
  }

  const access = appAccess || buildAppAccess(context);
  const displayName = getDisplayName(context.user.fullName);
  const greeting = getTimeGreeting();
  const canManageStaff = access.canManageStaff;
  const canSeeStaff = access.canViewStaff;
  const currentLocation = access.scopeLabel;

  return (
    <>
      <style jsx global>{`
        html,
        body {
          overflow: hidden;
        }

        .rurix-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(139, 92, 246, 0.65) rgba(6, 17, 31, 0.28);
        }

        .rurix-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .rurix-scrollbar::-webkit-scrollbar-track {
          background: rgba(6, 17, 31, 0.28);
          border-radius: 999px;
        }

        .rurix-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(
            180deg,
            rgba(139, 92, 246, 0.95),
            rgba(34, 211, 238, 0.72)
          );
          border-radius: 999px;
          border: 2px solid rgba(6, 17, 31, 0.45);
          background-clip: padding-box;
        }

        .rurix-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(
            180deg,
            rgba(167, 139, 250, 1),
            rgba(34, 211, 238, 0.95)
          );
        }

        .rurix-scrollbar::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>

      <main className="h-screen overflow-hidden bg-background text-foreground">
        <div
          className={[
            "mx-auto grid h-screen max-w-[1560px] overflow-hidden transition-[grid-template-columns] duration-300",
            isSidebarCollapsed
              ? "lg:grid-cols-[4.75rem_1fr]"
              : "lg:grid-cols-[15.5rem_1fr]",
          ].join(" ")}
        >
          <AppDesktopSidebar
            activeSection={activeSection}
            businessName={context.business.name}
            currentLocation={currentLocation}
            isCollapsed={isSidebarCollapsed}
            navItems={access.allowedSections}
            onToggleCollapse={() =>
              setIsSidebarCollapsed((current) => !current)
            }
            onChangeSection={changeSection}
          />

          {isMobileMenuOpen ? (
            <AppMobileSidebar
              activeSection={activeSection}
              businessName={context.business.name}
              currentLocation={currentLocation}
              navItems={access.allowedSections}
              onChangeSection={changeSection}
              onClose={() => setIsMobileMenuOpen(false)}
            />
          ) : null}

          <section className="flex h-screen min-w-0 flex-col overflow-hidden bg-background">
            <AppHeader
              displayName={displayName}
              greeting={greeting}
              businessName={context.business.name}
              isLoggingOut={isLoggingOut}
              onLogout={handleLogout}
              onOpenMenu={() => setIsMobileMenuOpen(true)}
            />

            <main className="rurix-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4 sm:px-6 lg:px-8 lg:pb-8">
              {error ? (
                <div className="mb-5 rounded-panel border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="mb-5 rounded-panel border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success">
                  {success}
                </div>
              ) : null}

              {drawerNotice ? (
                <div className="mb-5 rounded-panel border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                    {drawerNotice}
                  </span>
                </div>
              ) : null}

              {activeSection === "dashboard" ? (
                <DashboardView
                  context={context}
                  appAccess={access}
                  staffCount={staff.length}
                  mainLocationName={currentLocation}
                  onOpenSection={changeSection}
                />
              ) : null}

              {activeSection === "staff" && canOpenSection(access, "staff") ? (
                <StaffView
                  context={context}
                  staff={staff}
                  selectedStaff={selectedStaff}
                  staffForm={staffForm}
                  staffEditForm={staffEditForm}
                  staffPasswordForm={staffPasswordForm}
                  staffLocationAssignForm={staffLocationAssignForm}
                  canManageStaff={canManageStaff}
                  canSeeStaff={canSeeStaff}
                  isStaffLoading={isStaffLoading}
                  isCreatingStaff={isCreatingStaff}
                  isUpdatingStaff={isUpdatingStaff}
                  isResettingPassword={isResettingPassword}
                  isAssigningLocation={isAssigningLocation}
                  isRemovingAccess={isRemovingAccess}
                  showStaffPassword={showStaffPassword}
                  showResetPassword={showResetPassword}
                  changingStaffId={
                    isRefreshingStaffDetails && selectedStaff
                      ? selectedStaff.id
                      : changingStaffId
                  }
                  removingAccessKey={removingAccessKey}
                  onSubmit={handleCreateStaff}
                  onUpdateStaff={handleUpdateStaff}
                  onResetPassword={handleResetStaffPassword}
                  onAssignLocation={handleAssignStaffLocation}
                  onRemoveStaffRole={handleRemoveStaffRole}
                  onRemoveStaffLocation={handleRemoveStaffLocation}
                  onSelectStaff={handleSelectStaff}
                  onCloseDetails={closeStaffDetails}
                  onToggleRole={toggleRole}
                  onToggleAssignRole={toggleAssignRole}
                  onToggleStaffStatus={handleToggleStaffStatus}
                  onSetShowStaffPassword={setShowStaffPassword}
                  onSetShowResetPassword={setShowResetPassword}
                  onSetStaffForm={setStaffForm}
                  onSetStaffEditForm={setStaffEditForm}
                  onSetStaffPasswordForm={setStaffPasswordForm}
                  onSetStaffLocationAssignForm={setStaffLocationAssignForm}
                />
              ) : null}

              {activeSection !== "dashboard" && activeSection !== "staff" ? (
                canOpenSection(access, activeSection) ? (
                  <ComingSoonView section={activeSection} />
                ) : (
                  <ComingSoonView section={access.defaultSection} />
                )
              ) : null}
            </main>
          </section>
        </div>
      </main>
    </>
  );
}

function ComingSoonView({ section }: { section: AppSection }) {
  return (
    <section className="rounded-section bg-surface p-6 shadow-card">
      <StatusBadge variant="warning">Coming next</StatusBadge>
      <h2 className="mt-4 text-2xl font-extrabold">
        {formatSectionName(section)} will be built after the current phase.
      </h2>
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-muted-foreground">
        We are building Rurix feature by feature so every area has proper
        backend rules, web screens, loading states, and business-friendly
        wording.
      </p>
    </section>
  );
}

function getDisplayName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "there";
  }

  return parts[0] || "there";
}

function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

function formatSectionName(section: AppSection) {
  return section
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
