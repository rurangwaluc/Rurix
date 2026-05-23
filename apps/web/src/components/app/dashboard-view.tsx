"use client";

import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Undo2,
  UsersRound,
  WalletCards,
} from "lucide-react";

import type { AppAccess } from "./app-permissions";
import type { AppSection } from "./app-types";
import type { CurrentUserResponse } from "../../lib/api";
import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "../status-badge";

type DashboardViewProps = {
  context: CurrentUserResponse;
  appAccess: AppAccess;
  staffCount: number;
  mainLocationName: string;
  onOpenSection: (section: AppSection) => void;
};

export function DashboardView({
  context,
  appAccess,
  staffCount,
  mainLocationName,
  onOpenSection,
}: DashboardViewProps) {
  const cards = getDashboardCards(appAccess);
  const actions = getQuickActions(appAccess);

  return (
    <div className="space-y-5">
      <section className="rounded-section bg-surface p-5 shadow-card sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <StatusBadge variant="primary">
              {getDashboardLabel(appAccess)}
            </StatusBadge>

            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">
              {getDashboardTitle(appAccess)}
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-muted-foreground">
              {getDashboardDescription(appAccess)}
            </p>
          </div>

          <div className="rounded-panel bg-panel p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
              Working scope
            </p>
            <p className="mt-2 text-sm font-extrabold">
              {appAccess.isOwner ? "Whole business" : mainLocationName}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_21rem]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <DashboardMetricCard key={card.title} {...card} />
            ))}
          </div>

          <div className="rounded-section bg-surface p-5 shadow-card sm:p-6">
            <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
                  Your work areas
                </p>
                <h3 className="mt-2 text-xl font-extrabold">
                  Available from your responsibilities
                </h3>
              </div>
              <StatusBadge variant="neutral">
                {appAccess.allowedSections.length} areas
              </StatusBadge>
            </div>

            <div className="grid gap-3">
              {actions.map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    key={action.section}
                    type="button"
                    onClick={() => onOpenSection(action.section)}
                    className="flex items-center justify-between rounded-control bg-panel px-4 py-3 text-left transition hover:bg-muted"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-control bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold">
                          {action.title}
                        </span>
                        <span className="block text-xs font-semibold text-muted-foreground">
                          {action.helper}
                        </span>
                      </span>
                    </span>

                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-section bg-surface p-5 shadow-card">
            <h3 className="text-lg font-extrabold">Access summary</h3>

            <div className="mt-5 space-y-3">
              <HealthRow
                label="Scope"
                value={appAccess.scopeLabel}
                tone="primary"
              />
              <HealthRow
                label="Locations"
                value={`${context.branches.length}`}
                tone="success"
              />
              <HealthRow
                label="Responsibilities"
                value={
                  appAccess.isOwner
                    ? "Owner"
                    : appAccess.branchRoles.length
                      ? `${appAccess.branchRoles.length}`
                      : "Limited"
                }
                tone="danger"
              />
            </div>
          </div>

          {appAccess.canManageStaff ? (
            <div className="rounded-section bg-surface p-5 shadow-card">
              <h3 className="text-lg font-extrabold">Staff control</h3>
              <p className="mt-3 text-sm font-semibold leading-7 text-muted-foreground">
                Create staff, assign responsibilities, and control location
                access.
              </p>

              <button
                type="button"
                onClick={() => onOpenSection("staff")}
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-control bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-glow transition hover:brightness-105"
              >
                Manage staff
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          ) : null}

          {appAccess.isOwner ? (
            <div className="rounded-section bg-surface p-5 shadow-card">
              <h3 className="text-lg font-extrabold">Business health</h3>

              <div className="mt-5 space-y-3">
                <HealthRow
                  label="Staff members"
                  value={`${staffCount}`}
                  tone="primary"
                />
                <HealthRow label="Needs review" value="0" tone="danger" />
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function DashboardMetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone,
  percent,
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
  percent: string;
}) {
  return (
    <article className="rounded-section bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className={`grid h-12 w-12 place-items-center rounded-full ${tone}`}
          >
            <Icon className="h-5 w-5" />
          </div>

          <p className="mt-5 text-sm font-extrabold text-muted-foreground">
            {title}
          </p>
          <p className="number-font mt-2 text-2xl font-extrabold tracking-[-0.04em]">
            {value}
          </p>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            {helper}
          </p>
        </div>

        <MiniProgress value={percent} />
      </div>
    </article>
  );
}

function MiniProgress({ value }: { value: string }) {
  return (
    <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary/10">
      <div className="absolute inset-2.5 rounded-full border-[8px] border-primary/20" />
      <div className="absolute inset-2.5 rounded-full border-[8px] border-b-transparent border-l-transparent border-r-primary border-t-primary" />
      <span className="number-font text-xs font-extrabold text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success bg-success/12"
      : tone === "danger"
        ? "text-danger bg-danger/12"
        : "text-primary bg-primary/12";

  return (
    <div className="flex items-center justify-between rounded-panel bg-panel p-4">
      <div className="flex items-center gap-3">
        <div
          className={`grid h-10 w-10 place-items-center rounded-full ${toneClass}`}
        >
          <ShieldCheck className="h-4 w-4" />
        </div>
        <p className="text-sm font-extrabold">{label}</p>
      </div>
      <p className="number-font text-right text-sm font-extrabold">{value}</p>
    </div>
  );
}

function getDashboardCards(appAccess: AppAccess) {
  if (appAccess.dashboardMode === "owner") {
    return [
      metric(
        "Money in",
        "RWF 0",
        "Whole business today",
        CircleDollarSign,
        "bg-primary/12 text-primary",
      ),
      metric(
        "Stock status",
        "Ready",
        "All locations",
        Boxes,
        "bg-success/12 text-success",
      ),
      metric(
        "Needs review",
        "0",
        "Across business",
        ReceiptText,
        "bg-accent/12 text-accent",
      ),
    ];
  }

  if (
    appAccess.dashboardMode === "admin" ||
    appAccess.dashboardMode === "manager"
  ) {
    return [
      metric(
        "Branch money",
        "RWF 0",
        "Assigned location",
        CircleDollarSign,
        "bg-primary/12 text-primary",
      ),
      metric(
        "Branch stock",
        "Ready",
        "Assigned location",
        Boxes,
        "bg-success/12 text-success",
      ),
      metric(
        "Needs review",
        "0",
        "Branch work",
        ReceiptText,
        "bg-accent/12 text-accent",
      ),
    ];
  }

  if (appAccess.dashboardMode === "seller_cashier") {
    return [
      metric(
        "Sales work",
        "Ready",
        "Create sales",
        ShoppingBag,
        "bg-primary/12 text-primary",
      ),
      metric(
        "Payments",
        "Ready",
        "Receive payment",
        CircleDollarSign,
        "bg-success/12 text-success",
      ),
      metric(
        "Cash drawer",
        "Ready",
        "Daily cash work",
        WalletCards,
        "bg-accent/12 text-accent",
      ),
    ];
  }

  if (appAccess.dashboardMode === "seller") {
    return [
      metric(
        "Sales work",
        "Ready",
        "Create sales",
        ShoppingBag,
        "bg-primary/12 text-primary",
      ),
      metric(
        "Refund requests",
        "Ready",
        "Request only",
        Undo2,
        "bg-accent/12 text-accent",
      ),
      metric(
        "Customer work",
        "Ready",
        "Assigned location",
        ReceiptText,
        "bg-success/12 text-success",
      ),
    ];
  }

  if (appAccess.dashboardMode === "cashier") {
    return [
      metric(
        "Payments",
        "Ready",
        "Receive payment",
        CircleDollarSign,
        "bg-primary/12 text-primary",
      ),
      metric(
        "Cash drawer",
        "Ready",
        "Open and close",
        WalletCards,
        "bg-success/12 text-success",
      ),
      metric(
        "Expenses",
        "Ready",
        "Submit for review",
        ReceiptText,
        "bg-accent/12 text-accent",
      ),
    ];
  }

  if (appAccess.dashboardMode === "storekeeper") {
    return [
      metric(
        "Stock work",
        "Ready",
        "Release stock",
        Boxes,
        "bg-primary/12 text-primary",
      ),
      metric(
        "Stock checks",
        "Ready",
        "Assigned location",
        ShieldCheck,
        "bg-success/12 text-success",
      ),
      metric(
        "Pending release",
        "0",
        "Stock requests",
        ReceiptText,
        "bg-accent/12 text-accent",
      ),
    ];
  }

  return [
    metric(
      "Access",
      "Limited",
      "Ask owner/admin",
      ShieldCheck,
      "bg-primary/12 text-primary",
    ),
    metric(
      "Location",
      "Assigned",
      "Your working scope",
      ReceiptText,
      "bg-success/12 text-success",
    ),
    metric(
      "Tasks",
      "Waiting",
      "No module assigned",
      Boxes,
      "bg-accent/12 text-accent",
    ),
  ];
}

function getQuickActions(appAccess: AppAccess) {
  return appAccess.allowedSections
    .filter((item) => item.key !== "dashboard")
    .map((item) => ({
      section: item.key,
      title: item.label,
      helper: getSectionHelper(item.key),
      icon: item.icon,
    }));
}

function metric(
  title: string,
  value: string,
  helper: string,
  icon: LucideIcon,
  tone: string,
) {
  return {
    title,
    value,
    helper,
    icon,
    tone,
    percent: "0%",
  };
}

function getDashboardLabel(appAccess: AppAccess) {
  if (appAccess.isOwner) return "Owner dashboard";
  if (appAccess.isAdmin) return "Admin dashboard";
  if (appAccess.isManager) return "Manager dashboard";
  return "Work dashboard";
}

function getDashboardTitle(appAccess: AppAccess) {
  if (appAccess.isOwner) return "Whole-business control";
  if (appAccess.isAdmin) return "Assigned-location control";
  if (appAccess.isManager) return "Branch review and control";
  if (appAccess.dashboardMode === "seller_cashier")
    return "Sales and payment workspace";
  if (appAccess.dashboardMode === "seller") return "Sales workspace";
  if (appAccess.dashboardMode === "cashier")
    return "Payment and cash workspace";
  if (appAccess.dashboardMode === "storekeeper") return "Stock workspace";
  return "Your Rurix workspace";
}

function getDashboardDescription(appAccess: AppAccess) {
  if (appAccess.isOwner) {
    return "See the whole business across locations, money, stock, staff, reports, and settings.";
  }

  if (appAccess.isAdmin) {
    return "Manage the assigned location without receiving owner-only business-wide control.";
  }

  if (appAccess.isManager) {
    return "Review branch activity, exceptions, refunds, expenses, and daily operations.";
  }

  if (appAccess.dashboardMode === "seller_cashier") {
    return "You can create sales and receive payments because you have both seller and cashier responsibilities.";
  }

  if (appAccess.dashboardMode === "seller") {
    return "You can handle sales work for your assigned location.";
  }

  if (appAccess.dashboardMode === "cashier") {
    return "You can handle payments, cash drawer work, expenses, and refund processing steps assigned to cashiers.";
  }

  if (appAccess.dashboardMode === "storekeeper") {
    return "You can handle stock work for your assigned location.";
  }

  return "Your dashboard only shows the work assigned to you.";
}

function getSectionHelper(section: AppSection) {
  switch (section) {
    case "sales":
      return "Create and follow sales work";
    case "stock":
      return "Handle stock work";
    case "payments":
      return "Receive and review payments";
    case "cash":
      return "Cash drawer and deposits";
    case "expenses":
      return "Submit or review expenses";
    case "refunds":
      return "Request or review refunds";
    case "staff":
      return "Manage staff access";
    case "reports":
      return "Review performance";
    case "settings":
      return "Owner-level settings";
    default:
      return "Open work area";
  }
}
