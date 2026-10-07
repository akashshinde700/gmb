"use client";
// WebSetu — Auth view (login / register). Split-screen layout:
// emerald brand panel (desktop) + form card with Login/Register tabs.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TRIAL_LABEL } from "@/lib/trial";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
import {
  ForgotPasswordDialog, ResetPasswordPanel, resetTokenFromUrl,
} from "@/components/views/password-reset";
import { useApp } from "@/store/app-store";
import { PRIVACY, TERMS } from "@/lib/legal";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { themeVars, type PlatformTheme } from "@/lib/platform-theme";
import type { AuthResponse } from "@/lib/types";

const BULLETS = ["Launch in 15 minutes", "AI-written content", "Leads + WhatsApp built-in"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password input with a show/hide toggle. Typing a long password blind is the
 * main reason people end up at "Invalid email or password".
 */
function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  hint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  minLength?: number;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Password</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** @param serverTheme the platform palette, resolved on the server — see the
 *  note in landing-view: nothing on a signed-out page hydrates the store. */
export default function AuthView({ platformTheme: serverTheme, brand }: {
  platformTheme?: PlatformTheme;
  /** A reseller's brand when this page is served on their domain. */
  brand?: { name: string; logoUrl: string; whiteLabel: boolean };
}) {
  const router = useRouter();
  const authMode = useApp((s) => s.authMode);
  const storeTheme = useApp((s) => s.platformTheme);
  const platformTheme = serverTheme ?? storeTheme;
  const setAuthMode = useApp((s) => s.setAuthMode);
  const hydrate = useApp((s) => s.hydrate);
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  /**
   * The real double-submit guard.
   *
   * `busy` only disables the button on the NEXT render, so a second click that
   * lands in the same tick sails past it and fires a second request — two
   * sessions, and two hits against the account's login budget for what the
   * person experienced as one impatient double-click. A ref flips now, in the
   * handler, before anything is awaited.
   */
  const inFlight = useRef(false);
  // Terms and Privacy used to be href="#" links. On a hash-routed app that
  // is not merely dead — it rewrites the route and throws the visitor back
  // to the marketing page mid-signup.
  const [legal, setLegal] = useState<"privacy" | "terms" | null>(null);
  const [error, setError] = useState("");

  // login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  // register fields
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  // Set when the visitor arrived on an emailed reset link (…/?reset=<token>).
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    // Read once on mount: the token lives in the query string, which the server
    // render knows nothing about, so it cannot be read during render without a
    // hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResetToken(resetTokenFromUrl());
  }, []);

  /** Shared post-auth flow: hydrate the session and route by account state. */
  async function finishAuth(res: AuthResponse) {
    // The session cookie was set by the response that carried `res`; there is
    // nothing to persist here any more.
    await hydrate();
    // best-effort notification badge refresh (optional, must not block routing)
    api
      .get<{ unread: number }>("/api/notifications")
      .then((d) => useApp.getState().setUnread(d.unread))
      .catch(() => {});
    toast({ title: `Welcome, ${res.user.name.split(" ")[0]}! 👋` });

    const state = useApp.getState();
    if (res.user.role === "ADMIN") {
      router.push("/admin");
    } else if (state.business) {
      router.push("/dashboard");
    } else {
      router.push("/onboarding");
    }
  }

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!loginEmail.trim() || !loginPassword) {
      setError("Please enter your email and password.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/login", {
        email: loginEmail,
        password: loginPassword,
      });
      await finishAuth(res);
      // Deliberately not re-enabling the form on success: we are on our way to
      // the dashboard, and the soft navigation takes long enough that a second
      // click still lands on a button that says "Logging in…". That is how one
      // impatient double-click became two sessions and two hits against the
      // account's login budget. Only a FAILED attempt puts the form back.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const name = regName.trim();
    if (name.length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (!EMAIL_RE.test(regEmail.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    // Mirrors the server rule in /api/auth/register — the server is the one
    // that enforces it; this only saves a round-trip.
    if (regPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }
    // Same guard as the login form: a double-click here would create the
    // account twice, and the second attempt fails on the unique email with an
    // error the person did nothing to deserve.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/register", {
        name,
        email: regEmail,
        password: regPassword,
      });
      await finishAuth(res);
      // As above: on success this form is on its way off screen.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
      inFlight.current = false;
      setBusy(false);
    }
  }


  function switchMode(mode: string) {
    setAuthMode(mode === "register" ? "register" : "login");
    setError("");
  }

  return (
    <>
    <ForgotPasswordDialog
      open={forgotOpen}
      onOpenChange={setForgotOpen}
      defaultEmail={loginEmail}
    />
    <div
      className="ws-theme grid min-h-screen w-full lg:grid-cols-2"
      style={themeVars(platformTheme) as React.CSSProperties}
    >
      {/* ---------- Left brand panel (desktop only) ---------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-10 text-white lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-amber-400/15 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/15 text-xl font-bold backdrop-blur">
            W
          </span>
          <span className="text-xl font-bold tracking-tight">{brand?.name ?? "WebSetu"}</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-[2.75rem]">
            Bring your business online today.
          </h1>
          <ul className="mt-8 space-y-4">
            {BULLETS.map((b) => (
              <li key={b} className="flex items-center gap-3 text-base text-emerald-50">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-200" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl border border-white/15 bg-card/10 p-5 backdrop-blur">
            <p className="text-sm leading-relaxed text-emerald-50">
              &ldquo;We went live the same evening we signed up — and got three enquiries in the first week.&rdquo;
            </p>
            <p className="mt-3 text-xs font-medium text-emerald-200">Ramesh Sharma · Sharma Electricals, Pune</p>
          </div>
        </div>

        <p className="relative flex items-center gap-2 text-sm text-emerald-100/80">
          <Sparkles className="h-4 w-4" />
          Website · Google · SEO · Leads · WhatsApp · Analytics
        </p>
      </div>

      {/* ---------- Right form panel ---------- */}
      {/* A landmark so screen-reader users can jump straight to the form. */}
      <main className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => {
              router.push("/");
            }}
            className="mb-4 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </button>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-zinc-900/5 sm:p-8">
            {/* Mobile logo (left panel is hidden) */}
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white">
                W
              </span>
              <span className="text-lg font-bold tracking-tight text-foreground">{brand?.name ?? "WebSetu"}</span>
            </div>

            {resetToken ? (
              <ResetPasswordPanel
                token={resetToken}
                onDone={finishAuth}
                onCancel={() => setResetToken("")}
              />
            ) : (
            <>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {authMode === "login"
                ? "Log in to manage your website, leads and more."
                : `Start your ${TRIAL_LABEL} — no credit card required.`}
            </p>

            <Tabs value={authMode} onValueChange={switchMode} className="mt-6">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted p-1">
                <TabsTrigger value="login" className="rounded-lg data-[state=active]:text-emerald-700">
                  Login
                </TabsTrigger>
                <TabsTrigger value="register" className="rounded-lg data-[state=active]:text-emerald-700">
                  Register
                </TabsTrigger>
              </TabsList>

              {/* ----- Login ----- */}
              <TabsContent value="login">
                <form onSubmit={onLogin} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@business.in"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <PasswordField
                    id="login-password"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {error ? (
                    <Alert variant="destructive">
                      <AlertTitle>Could not log in</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {busy ? "Logging in…" : "Log In"}
                  </Button>

                </form>
              </TabsContent>

              {/* ----- Register ----- */}
              <TabsContent value="register">
                <form onSubmit={onRegister} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">Full name</Label>
                    <Input
                      id="reg-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Ramesh Sharma"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@business.in"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>
                  <PasswordField
                    id="reg-password"
                    value={regPassword}
                    onChange={setRegPassword}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    minLength={8}
                    hint="Minimum 8 characters, with at least one letter and one number."
                  />

                  {error ? (
                    <Alert variant="destructive">
                      <AlertTitle>Could not create account</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {busy ? "Creating account…" : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <button
              type="button"
              onClick={() => setLegal("terms")}
              className="underline underline-offset-2 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Terms of Service
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => setLegal("privacy")}
              className="underline underline-offset-2 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Privacy Policy
            </button>
            .
          </p>
        </div>
      </main>

      <Dialog open={legal !== null} onOpenChange={(open) => !open && setLegal(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{legal === "terms" ? "Terms of Service" : "Privacy Policy"}</DialogTitle>
            <DialogDescription>
              {legal === "terms"
                ? `The short version of what you agree to when you use ${brand?.name ?? "WebSetu"}.`
                : "What we collect, why we collect it, and what we never do with it."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            {(legal === "terms" ? TERMS : PRIVACY).map((item) => (
              <div key={item.heading}>
                <p className="font-semibold text-foreground">{item.heading}</p>
                <p className="mt-1">{item.body}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
