"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

type AsyncButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingText?: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function AsyncButton({
  isLoading = false,
  loadingText = "Working...",
  children,
  className,
  disabled,
  variant = "primary",
  ...props
}: AsyncButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-control px-5 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:brightness-105",
        variant === "secondary" &&
          "border border-border bg-surface text-foreground hover:border-primary/50",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
