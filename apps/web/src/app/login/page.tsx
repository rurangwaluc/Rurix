"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
} from "lucide-react";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AsyncButton } from "../../components/async-button";
import Link from "next/link";
import { StatusBadge } from "../../components/status-badge";
import { ThemeToggle } from "../../components/theme-toggle";
import { login } from "../../lib/api";
import { saveAuthToken } from "../../lib/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerCreated = searchParams.get("setup") === "success";

  const [email, setEmail] = useState("luc@ruraxis.com");
  const [password, setPassword] = useState("Rura@123");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await login({
        email,
        password,
        deviceKey: getDeviceKey(),
        deviceName: "Web browser",
        platform: "web",
      });

      saveAuthToken(result.token);
      router.push("/app");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Sign in failed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-grid min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between rounded-section border border-border bg-surface/88 px-4 py-3 shadow-soft backdrop-blur-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Rurix
          </Link>

          <ThemeToggle />
        </header>

        <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <aside className="rounded-section bg-surface p-6 shadow-card sm:p-8">
            <StatusBadge variant="primary">Private access</StatusBadge>

            <h1 className="mt-5 max-w-xl text-3xl font-extrabold leading-tight tracking-[-0.035em] sm:text-4xl">
              Sign in to your business control board.
            </h1>

            <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-muted-foreground sm:text-base">
              Rurix access is created by the business. Owners and staff sign in
              with the access already assigned to them.
            </p>

            <div className="mt-8 space-y-4">
              {[
                "Location access is assigned by the business",
                "Staff only see allowed responsibilities",
                "Daily activity remains traceable",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <p className="text-sm font-bold text-muted-foreground">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </aside>

          <form
            onSubmit={handleSubmit}
            className="rounded-section bg-surface p-5 shadow-card sm:p-7"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
                  Sign in
                </p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em]">
                  Access Rurix
                </h2>
              </div>
              <LockKeyhole className="h-6 w-6 text-primary" />
            </div>

            {ownerCreated ? (
              <div className="mt-5 rounded-panel border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success">
                Owner access created. Sign in with the owner email and password.
              </div>
            ) : null}

            {error ? (
              <div className="mt-5 rounded-panel border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
                {error}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-control border border-border bg-background px-4 text-sm font-bold outline-none transition focus:border-primary"
                  placeholder="you@example.com"
                />
              </Field>

              <Field label="Password">
                <div className="relative">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 w-full rounded-control border border-border bg-background px-4 pr-12 text-sm font-bold outline-none transition focus:border-primary"
                    placeholder="Your password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </Field>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-muted-foreground">
                Need access? Ask the owner or business admin.
              </p>

              <AsyncButton
                type="submit"
                isLoading={isSubmitting}
                loadingText="Signing in..."
                className="w-full sm:w-auto"
              >
                Sign in
                <ArrowRight className="h-4 w-4" />
              </AsyncButton>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function LoginShellFallback() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 h-16 animate-pulse-soft rounded-section bg-muted" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-[520px] animate-pulse-soft rounded-section bg-muted" />
          <div className="h-[520px] animate-pulse-soft rounded-section bg-muted" />
        </div>
      </div>
    </main>
  );
}

function getDeviceKey() {
  if (typeof window === "undefined") {
    return "web-server-device";
  }

  const key = "rurix_device_key";
  const existing = window.localStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const created = `web_${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);

  return created;
}
