"use client";

import type { AppAccess } from "../app-permissions";
import type { CurrentUserResponse } from "../../../lib/api";
import { DocumentTaxSettingsPanel } from "./document-tax-settings-panel";
import { Settings } from "lucide-react";

type SettingsViewProps = {
  context: CurrentUserResponse;
  appAccess: AppAccess;
};

export function SettingsView({ context, appAccess }: SettingsViewProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-section border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-primary">
              <Settings className="h-4 w-4" />
              Settings
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight">
              Business settings
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-muted-foreground">
              Manage business-level rules that affect documents, taxes, and
              owner-controlled operations.
            </p>
          </div>

          <div className="rounded-panel border border-border bg-panel px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              Business
            </p>
            <p className="mt-1 text-sm font-black">{context.business.name}</p>
          </div>
        </div>
      </div>

      <DocumentTaxSettingsPanel canEdit={appAccess.isOwner} />
    </section>
  );
}
