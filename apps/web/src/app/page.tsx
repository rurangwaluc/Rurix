import {
  ArrowRight,
  Banknote,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Moon,
  PackagePlus,
  RadioTower,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sun,
  UsersRound,
} from "lucide-react";

import { AsyncButton } from "../components/async-button";
import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { ThemeToggle } from "../components/theme-toggle";

type NavItem = {
  label: string;
  icon: LucideIcon;
};

type TopCard = {
  icon: LucideIcon;
  tone: string;
  title: string;
  value: string;
  label: string;
  percent: string;
};

type UpdateItem = {
  name: string;
  text: string;
  time: string;
};

type AnalyticsItem = {
  label: string;
  change: string;
  value: string;
  tone: "success" | "danger" | "primary";
};

type TableRow = {
  record: string;
  method: string;
  payment: string;
  status: string;
};

type ProofBlock = {
  icon: LucideIcon;
  title: string;
  text: string;
};

const navItems: NavItem[] = [
  { label: "Today", icon: LayoutDashboard },
  { label: "Requests", icon: ClipboardList },
  { label: "Payments", icon: CircleDollarSign },
  { label: "Stock", icon: Boxes },
  { label: "Staff", icon: UsersRound },
  { label: "Reports", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

const topCards: TopCard[] = [
  {
    icon: CircleDollarSign,
    tone: "bg-primary/14 text-primary",
    title: "Money in",
    value: "RWF 2.48M",
    label: "Today",
    percent: "81%",
  },
  {
    icon: ReceiptText,
    tone: "bg-accent/14 text-accent",
    title: "Money out",
    value: "RWF 416K",
    label: "Expenses",
    percent: "42%",
  },
  {
    icon: Boxes,
    tone: "bg-success/14 text-success",
    title: "Stock released",
    value: "184",
    label: "Items",
    percent: "67%",
  },
];

const updates: UpdateItem[] = [
  { name: "Luc", text: "created customer request", time: "2 min ago" },
  { name: "Lily", text: "recorded MoMo payment", time: "5 min ago" },
  { name: "Eric", text: "released stock from main branch", time: "8 min ago" },
];

const analytics: AnalyticsItem[] = [
  { label: "Payments waiting", change: "+12%", value: "12", tone: "primary" },
  { label: "Needs review", change: "5", value: "Open", tone: "danger" },
  { label: "Saved offline", change: "3", value: "Waiting", tone: "success" },
];

const tableRows: TableRow[] = [
  { record: "Request #1042", method: "Cash", payment: "Paid", status: "Ready" },
  {
    record: "Request #1043",
    method: "MoMo",
    payment: "Waiting",
    status: "Review",
  },
  {
    record: "Request #1044",
    method: "Bank",
    payment: "Paid",
    status: "Released",
  },
  {
    record: "Expense #218",
    method: "Cash",
    payment: "Pending",
    status: "Approval",
  },
];

const proofBlocks: ProofBlock[] = [
  {
    icon: UsersRound,
    title: "Works with real teams",
    text: "Owner-only, small team, or many staff members with the same responsibility.",
  },
  {
    icon: Building2,
    title: "Built for branches",
    text: "Start with one main branch and add more branches when the business grows.",
  },
  {
    icon: RadioTower,
    title: "Offline-ready work",
    text: "Allowed work can be saved offline and synced when connection returns.",
  },
];

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

function ToneValue({ item }: { item: AnalyticsItem }) {
  const toneClass =
    item.tone === "success"
      ? "text-success"
      : item.tone === "danger"
        ? "text-danger"
        : "text-primary";

  return (
    <div className="text-right">
      <p className={`text-xs font-extrabold ${toneClass}`}>{item.change}</p>
      <p className="number-font text-sm font-extrabold">{item.value}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="app-grid relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.16),transparent_30%),linear-gradient(to_bottom,hsl(var(--background)/0.94),hsl(var(--background)))]" />

        <div className="relative mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between rounded-section border border-border bg-surface/88 px-4 py-3 shadow-soft backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-control bg-primary/12 text-primary">
                <PackagePlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.18em]">
                  Rurix
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  Business Control System
                </p>
              </div>
            </div>

            <nav className="hidden items-center gap-7 text-sm font-bold text-muted-foreground lg:flex">
              <a className="transition hover:text-primary" href="#preview">
                Preview
              </a>
              <a className="transition hover:text-primary" href="#model">
                Model
              </a>
              <a className="transition hover:text-primary" href="#access">
                Access
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <a
                href="/login"
                className="hidden text-sm font-extrabold text-muted-foreground transition hover:text-foreground sm:block"
              >
                Sign in
              </a>
            </div>
          </header>

          <div className="pt-7">
            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-3xl">
                <StatusBadge variant="primary">
                  Private business system
                </StatusBadge>
                <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-[2.65rem]">
                  Run your business from one clear control board.
                </h1>
                <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-muted-foreground sm:text-base">
                  Rurix is deployed privately for one business. Owners and staff
                  sign in to control sales, money, stock, branches, and daily
                  work from one trusted system.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <a
                  href="/login"
                  className="inline-flex h-11 w-full items-center justify-center rounded-control bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-glow transition hover:brightness-105 sm:w-auto"
                >
                  Open Rurix
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
                <a
                  href="#preview"
                  className="inline-flex h-11 w-full items-center justify-center rounded-control border border-border bg-surface px-5 text-sm font-extrabold text-foreground shadow-soft transition hover:border-primary/45 sm:w-auto"
                >
                  See the product
                </a>
              </div>
            </div>

            <div
              id="preview"
              className="rounded-section border border-border bg-panel-strong p-3 shadow-card"
            >
              <div className="grid min-h-[620px] overflow-hidden rounded-panel border border-border bg-background lg:grid-cols-[230px_1fr]">
                <aside className="hidden border-r border-border bg-surface p-5 lg:flex lg:flex-col">
                  <div className="mb-7 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-control bg-primary/12 text-primary">
                      <PackagePlus className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-extrabold uppercase tracking-[0.14em]">
                      Rurix
                    </p>
                  </div>

                  <div className="space-y-2">
                    {navItems.map((item, index) => {
                      const Icon = item.icon;

                      return (
                        <div
                          key={item.label}
                          className={[
                            "flex items-center gap-3 rounded-control px-3 py-3 text-sm font-bold transition",
                            index === 0
                              ? "bg-primary/12 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-auto rounded-panel border border-border bg-panel p-4">
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                      Saved offline
                    </p>
                    <p className="mt-2 text-sm font-extrabold">
                      3 actions waiting to sync
                    </p>
                  </div>
                </aside>

                <div className="min-w-0 bg-background">
                  <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <button className="grid h-9 w-9 place-items-center rounded-control bg-muted text-foreground lg:hidden">
                        <Menu className="h-5 w-5" />
                      </button>
                      <div>
                        <h2 className="text-xl font-extrabold tracking-[-0.03em]">
                          Dashboard
                        </h2>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Main branch today
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="hidden rounded-control bg-muted px-2 py-1 sm:flex">
                        <Sun className="h-4 w-4 rounded bg-primary p-0.5 text-primary-foreground" />
                        <Moon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Bell className="h-5 w-5 text-muted-foreground" />
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-extrabold text-accent-foreground">
                        L
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[1fr_310px]">
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        {topCards.map((card) => {
                          const Icon = card.icon;

                          return (
                            <div
                              key={card.title}
                              className="rounded-panel bg-surface p-5 shadow-soft"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div
                                    className={`grid h-11 w-11 place-items-center rounded-full ${card.tone}`}
                                  >
                                    <Icon className="h-5 w-5" />
                                  </div>
                                  <p className="mt-5 text-sm font-extrabold text-muted-foreground">
                                    {card.title}
                                  </p>
                                  <p className="number-font mt-2 text-2xl font-extrabold tracking-[-0.04em]">
                                    {card.value}
                                  </p>
                                  <p className="mt-3 text-xs font-semibold text-muted-foreground">
                                    {card.label}
                                  </p>
                                </div>
                                <MiniProgress value={card.percent} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-panel bg-surface p-5 shadow-soft">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-lg font-extrabold">
                            Recent business activity
                          </h3>
                          <StatusBadge variant="primary">Live</StatusBadge>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[620px] text-left text-sm">
                            <thead className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                              <tr>
                                <th className="py-3">Activity</th>
                                <th className="py-3">Method</th>
                                <th className="py-3">Payment</th>
                                <th className="py-3">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableRows.map((row) => (
                                <tr
                                  key={row.record}
                                  className="border-t border-border"
                                >
                                  <td className="py-3 font-bold">
                                    {row.record}
                                  </td>
                                  <td className="py-3 text-muted-foreground">
                                    {row.method}
                                  </td>
                                  <td className="py-3 text-muted-foreground">
                                    {row.payment}
                                  </td>
                                  <td className="py-3">
                                    <span className="font-extrabold text-primary">
                                      {row.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-panel bg-surface p-5 shadow-soft">
                        <h3 className="text-lg font-extrabold">
                          Recent updates
                        </h3>
                        <div className="mt-5 space-y-4">
                          {updates.map((item) => (
                            <div
                              key={`${item.name}-${item.text}`}
                              className="flex gap-3"
                            >
                              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-extrabold text-primary">
                                {item.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-bold leading-5">
                                  <span className="font-extrabold">
                                    {item.name}
                                  </span>{" "}
                                  {item.text}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                                  {item.time}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-lg font-extrabold">
                          Branch health
                        </h3>
                        {analytics.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between rounded-panel bg-surface p-4 shadow-soft"
                          >
                            <div className="flex items-center gap-3">
                              <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/12 text-primary">
                                <ShoppingBag className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="text-sm font-extrabold">
                                  {item.label}
                                </p>
                                <p className="text-xs font-semibold text-muted-foreground">
                                  Today
                                </p>
                              </div>
                            </div>
                            <ToneValue item={item} />
                          </div>
                        ))}
                      </div>

                      <button className="flex h-14 w-full items-center justify-center gap-2 rounded-panel border border-dashed border-primary/60 text-sm font-extrabold text-primary">
                        <PackagePlus className="h-4 w-4" />
                        Add staff or location
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section id="model" className="grid gap-5 py-7 lg:grid-cols-3">
              {proofBlocks.map((block) => {
                const Icon = block.icon;

                return (
                  <article
                    key={block.title}
                    className="rounded-section bg-surface p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-card"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/12 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-6 text-xl font-extrabold tracking-[-0.03em]">
                      {block.title}
                    </h3>
                    <p className="mt-3 text-sm font-semibold leading-7 text-muted-foreground">
                      {block.text}
                    </p>
                  </article>
                );
              })}
            </section>

            <section id="access" className="pb-10">
              <div className="rounded-section bg-surface p-6 shadow-card sm:p-8">
                <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
                      Private access
                    </p>
                    <h2 className="mt-2 max-w-2xl text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">
                      Owner and staff access is created by the business, not by
                      public signup.
                    </h2>
                  </div>

                  <a
                    href="/login"
                    className="inline-flex h-12 items-center justify-center rounded-control bg-primary px-6 text-sm font-extrabold text-primary-foreground shadow-glow transition hover:brightness-105"
                  >
                    Open Rurix
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
