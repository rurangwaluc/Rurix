"use client";

import { Bell, LogOut, Menu } from "lucide-react";

import { AsyncButton } from "../async-button";
import { ThemeToggle } from "../theme-toggle";

type AppHeaderProps = {
  displayName: string;
  greeting: string;
  businessName: string;
  isLoggingOut: boolean;
  onLogout: () => void;
  onOpenMenu: () => void;
};

export function AppHeader({
  displayName,
  greeting,
  businessName,
  isLoggingOut,
  onLogout,
  onOpenMenu,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/82 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-muted-foreground shadow-soft transition hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-[-0.03em] sm:text-2xl">
              {greeting}, {displayName}
            </h1>
            <p className="truncate text-xs font-semibold text-muted-foreground sm:text-sm">
              {businessName} control board
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />

          <button
            type="button"
            className="hidden h-10 w-10 place-items-center rounded-control bg-surface text-muted-foreground shadow-soft transition hover:text-foreground sm:grid"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>

          <AsyncButton
            variant="secondary"
            isLoading={isLoggingOut}
            loadingText="Signing out..."
            onClick={onLogout}
            className="h-10"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </AsyncButton>
        </div>
      </div>
    </header>
  );
}
