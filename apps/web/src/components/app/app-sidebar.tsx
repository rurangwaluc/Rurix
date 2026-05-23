"use client";

import type { AppNavItem, AppSection } from "./app-types";
import { ChevronLeft, ChevronRight, PackagePlus, X } from "lucide-react";

type SidebarProps = {
  activeSection: AppSection;
  businessName: string;
  currentLocation: string;
  isCollapsed: boolean;
  navItems: AppNavItem[];
  onToggleCollapse: () => void;
  onChangeSection: (section: AppSection) => void;
};

export function AppDesktopSidebar(props: SidebarProps) {
  return (
    <aside
      className={[
        "sticky top-0 z-40 hidden h-screen overflow-visible border-r border-border bg-surface shadow-soft transition-all duration-300 lg:flex lg:flex-col",
        props.isCollapsed ? "w-[4.75rem]" : "w-[15.5rem]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={props.onToggleCollapse}
        className="absolute right-0 top-8 z-50 grid h-8 w-8 translate-x-1/2 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-card transition hover:border-primary/40 hover:text-primary"
        aria-label={props.isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={props.isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {props.isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      <div
        className={[
          "rurix-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden py-5",
          props.isCollapsed ? "px-2.5" : "px-4",
        ].join(" ")}
      >
        <SidebarContent {...props} />
      </div>
    </aside>
  );
}

export function AppMobileSidebar({
  activeSection,
  businessName,
  currentLocation,
  navItems,
  onChangeSection,
  onClose,
}: Omit<SidebarProps, "isCollapsed" | "onToggleCollapse"> & {
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu overlay"
        className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside className="relative flex h-full w-[82%] max-w-[20rem] flex-col bg-surface shadow-card">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-control bg-muted text-muted-foreground transition hover:text-foreground"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="rurix-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-5 py-6">
          <SidebarContent
            activeSection={activeSection}
            businessName={businessName}
            currentLocation={currentLocation}
            isCollapsed={false}
            navItems={navItems}
            onToggleCollapse={() => undefined}
            onChangeSection={onChangeSection}
          />
        </div>
      </aside>
    </div>
  );
}

function SidebarContent({
  activeSection,
  businessName,
  currentLocation,
  isCollapsed,
  navItems,
  onChangeSection,
}: SidebarProps) {
  return (
    <>
      <div
        className={[
          "mb-7 flex items-center",
          isCollapsed ? "justify-center" : "gap-3",
        ].join(" ")}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary/12 text-primary">
          <PackagePlus className="h-5 w-5" />
        </div>

        {!isCollapsed ? (
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em]">
              Rurix
            </p>
            <p className="max-w-[9.5rem] truncate text-xs font-semibold text-muted-foreground">
              {businessName}
            </p>
          </div>
        ) : null}
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChangeSection(item.key)}
              title={isCollapsed ? item.label : undefined}
              className={[
                "flex w-full items-center rounded-control px-3 py-2.5 text-left text-sm font-bold transition",
                isCollapsed ? "justify-center px-0" : "gap-3",
                active
                  ? "bg-primary/12 text-primary shadow-soft"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isCollapsed ? item.label : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div
          className={[
            "rounded-panel border border-border bg-panel p-3",
            isCollapsed ? "px-1.5 text-center" : "",
          ].join(" ")}
        >
          <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            {isCollapsed ? "Scope" : "Working scope"}
          </p>

          {!isCollapsed ? (
            <p className="mt-2 text-sm font-extrabold">{currentLocation}</p>
          ) : null}
        </div>

        {!isCollapsed ? (
          <div className="rounded-panel bg-primary/10 p-3 text-primary">
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em]">
              Saved offline
            </p>
            <p className="mt-2 text-xs font-extrabold leading-5">
              Work will sync when internet returns.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
