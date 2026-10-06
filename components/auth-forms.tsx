"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

/**
 * Auth forms.
 *
 * These call Better Auth's client, which posts to /api/auth/*. All the
 * security-relevant work (hashing, token issuing, rate limiting, breached
 * password checks) happens server-side in lib/auth.ts - nothing here is
 * trusted, and the client-side length check below is only to save a round trip.
 */

type Status = { kind: "idle" } | { kind: "error"; message: string } | { kind: "done"; message: string };

function Message({ status }: { status: Status }) {
  if (status.kind === "idle") return null;

  return (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      className={
        status.kind === "error"
          ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-md bg-secondary px-3 py-2 text-sm"
      }
    >
      {status.message}
    </p>
  );
}

/** Keeps an open redirect from being possible via ?next=. */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Only same-site, absolute paths. Rejects "//evil.com" and "https://evil.com".
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function GoogleButton({ next }: { next: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
    >
      Continue with Google
    </Button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-5">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setPending(true);
          setStatus({ kind: "idle" });

          const { error } = await authClient.signIn.email({
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            callbackURL: next,
          });

          setPending(false);

          if (error) {
            // Deliberately does not distinguish "no such account" from "wrong
            // password" - that difference is an account-enumeration oracle.
            setStatus({
              kind: "error",
              message:
                error.message ?? "That email and password do not match an account.",
            });
            return;
          }

          router.push(next);
          router.refresh();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="bg-paper" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs underline hover:text-enamel">
              Forgot it?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="bg-paper"
          />
        </div>

        <Message status={status} />

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <Divider />
          <GoogleButton next={next} />
        </>
      )}

      <p className="text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/register" className="underline hover:text-enamel">
          Create one
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-5">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const password = String(form.get("password") ?? "");

          // Saves a round trip; the server enforces this independently.
          if (password.length < 12) {
            setStatus({
              kind: "error",
              message: "Use at least 12 characters - a short phrase works well.",
            });
            return;
          }

          setPending(true);
          setStatus({ kind: "idle" });

          const { error } = await authClient.signUp.email({
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            password,
          });

          setPending(false);

          if (error) {
            setStatus({ kind: "error", message: error.message ?? "Could not create that account." });
            return;
          }

          setStatus({
            kind: "done",
            message:
              "Account created. Check your email for a confirmation link, then sign in. In development the link is printed in the server terminal.",
          });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required className="bg-paper" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="bg-paper" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            className="bg-paper"
          />
          <p className="text-xs text-muted-foreground">
            At least 12 characters. Length matters more than symbols, so a phrase you can remember
            is a good choice. Passwords found in known data breaches are refused.
          </p>
        </div>

        <Message status={status} />

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account..." : "Create account"}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <Divider />
          <GoogleButton next={next} />
        </>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline hover:text-enamel">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setStatus({ kind: "idle" });

        await authClient.requestPasswordReset({
          email: String(form.get("email") ?? ""),
          redirectTo: "/reset-password",
        });

        setPending(false);

        // The SAME message whether or not the address exists. Confirming which
        // emails have accounts would hand an attacker a user list.
        setStatus({
          kind: "done",
          message:
            "If that address has an account, a reset link is on its way. The link works once and expires in an hour.",
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="bg-paper" />
      </div>

      <Message status={status} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Email me a reset link"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline hover:text-enamel">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This reset link is incomplete or has already been used.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");

        if (password.length < 12) {
          setStatus({ kind: "error", message: "Use at least 12 characters." });
          return;
        }
        if (password !== String(form.get("confirm") ?? "")) {
          setStatus({ kind: "error", message: "Those two passwords do not match." });
          return;
        }

        setPending(true);
        setStatus({ kind: "idle" });

        const { error } = await authClient.resetPassword({ newPassword: password, token });

        setPending(false);

        if (error) {
          setStatus({
            kind: "error",
            message: error.message ?? "That link has expired or has already been used.",
          });
          return;
        }

        router.push("/login?reset=1");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="bg-paper"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="bg-paper"
        />
      </div>

      <Message status={status} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}
