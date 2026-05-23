import { cn } from "../lib/cn";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse-soft rounded-panel border border-border bg-muted",
        className,
      )}
    />
  );
}

export function LandingSkeleton() {
  return (
    <main className="min-h-screen bg-background px-5 py-6 text-foreground">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-10 w-32" />
          <SkeletonBlock className="h-10 w-24" />
        </div>

        <section className="grid gap-8 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div className="space-y-5">
            <SkeletonBlock className="h-6 w-40" />
            <SkeletonBlock className="h-16 w-full max-w-xl" />
            <SkeletonBlock className="h-16 w-full max-w-lg" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-11 w-32" />
              <SkeletonBlock className="h-11 w-40" />
            </div>
          </div>

          <SkeletonBlock className="h-[420px] w-full" />
        </section>
      </div>
    </main>
  );
}
