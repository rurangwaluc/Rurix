export function AppSkeleton() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 h-16 animate-pulse-soft rounded-section bg-muted" />

        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="hidden h-[720px] animate-pulse-soft rounded-section bg-muted lg:block" />

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="h-40 animate-pulse-soft rounded-panel bg-muted" />
              <div className="h-40 animate-pulse-soft rounded-panel bg-muted" />
              <div className="h-40 animate-pulse-soft rounded-panel bg-muted" />
            </div>

            <div className="h-96 animate-pulse-soft rounded-section bg-muted" />
          </div>
        </div>
      </div>
    </main>
  );
}
