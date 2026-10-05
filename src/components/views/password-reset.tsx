"use client";
// WebSetu — forgotten-password flow.
//
// Two pieces that belong together:
//   ForgotPasswordDialog — "email me a link", opened from the login form.
//   ResetPasswordPanel   — the screen the emailed link lands on, shown instead
//                          of the login form when the URL carries ?reset=<token>.
//
// Before this existed a customer who forgot their password had to reach an
// administrator, who reset it by hand.

import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";
import type { AuthResponse } from "@/lib/types";

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Strip ?reset= from the address bar so the token stops being re-submitted. */
export function clearResetParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("reset");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Read the reset token out of the current URL, if the visitor arrived on one. */
export function resetTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("reset") || "";
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  defaultEmail = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/auth/forgot", { email: email.trim() });
      // The server answers the same way whether or not the address is
      // registered, and so does this screen — otherwise the UI would leak what
      // the API deliberately does not.
      setSent(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSent(false);
          setError("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            {sent
              ? "Check your inbox — and your spam folder, just in case."
              : "We will email you a link to choose a new password."}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <Alert className="border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">
              If that email has an account, a reset link is on its way. It works once and expires in
              an hour.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="submit" disabled={busy || !email.trim()} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordPanel({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: (res: AuthResponse) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    // Checked here as well as on the server so the mistake is caught before the
    // single-use token is spent on it.
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/reset", { token, password });
      clearResetParam();
      await onDone(res);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Choose a new password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This link works once. Setting a new password also signs you out everywhere else.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-password">New password</Label>
        <div className="relative">
          <Input
            id="reset-password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <Input
          id="reset-confirm"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={busy || !password || !confirm} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set new password and sign in"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          clearResetParam();
          onCancel();
        }}
      >
        Back to sign in
      </Button>
    </form>
  );
}
