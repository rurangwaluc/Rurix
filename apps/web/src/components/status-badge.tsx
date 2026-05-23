import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type StatusBadgeProps = {
  children: ReactNode;
  variant?: "neutral" | "success" | "warning" | "danger" | "primary";
  className?: string;
};

export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-control border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        variant === "neutral" && "border-border bg-muted text-muted-foreground",
        variant === "success" && "border-success/35 bg-success/10 text-success",
        variant === "warning" && "border-warning/35 bg-warning/10 text-warning",
        variant === "danger" && "border-danger/35 bg-danger/10 text-danger",
        variant === "primary" && "border-primary/40 bg-primary/10 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
