"use client";
// WebSetu — Auth view (login / register). Split-screen layout:
// emerald brand panel (desktop) + form card with Login/Register tabs.

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api, setToken } from "@/lib/api-client";
import { useApp } from "@/store/app-store";
import type { AuthResponse } from "@/lib/types";

const BULLETS = ["Launch in 15 minutes", "AI-written content", "Leads + WhatsApp built-in"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthView() {
  const authMode = useApp((s) => s.authMode);
  const setAuthMode = useApp((s) => s.setAuthMode);
  const hydrate = useApp((s) => s.hydrate);
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  // register fields
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  /** Shared post-auth flow: persist token, hydrate session, route by account state. */
  async function finishAuth(res: AuthResponse) {
    setToken(res.token);
    await hydrate();
    // best-effort notification badge refresh (optional, must not block routing)
    api
      .get<{ unread: number }>("/api/notifications")
      .then((d) => useApp.getState().setUnread(d.unread))
      .catch(() => {});
    toast({ title: `Welcome, ${res.user.name.split(" ")[0]}! 👋` });

    const state = useApp.getState();
    if (res.user.role === "ADMIN") {
      window.location.hash = "#/admin";
    } else if (state.business) {
      window.location.hash = "#/dashboard";
    } else {
      window.location.hash = "#/onboarding";
    }
  }

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!loginEmail.trim() || !loginPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/login", {
        email: loginEmail,
        password: loginPassword,
      });
      await finishAuth(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
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
    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/register", {
        name,
        email: regEmail,
        password: regPassword,
      });
      await finishAuth(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo() {
    setAuthMode("login");
    setError("");
    setLoginEmail("demo@websetu.in");
    setLoginPassword("demo1234");
  }

  function switchMode(mode: string) {
    setAuthMode(mode === "register" ? "register" : "login");
    setError("");
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
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
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl font-bold backdrop-blur">
            W
          </span>
          <span className="text-xl font-bold tracking-tight">WebSetu</span>
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
          <div className="mt-10 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
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
      <div className="flex flex-1 flex-col items-center justify-center bg-[#fafaf9] px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => {
              window.location.hash = "#/";
            }}
            className="mb-4 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-zinc-500 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </button>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-900/5 sm:p-8">
            {/* Mobile logo (left panel is hidden) */}
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white">
                W
              </span>
              <span className="text-lg font-bold tracking-tight text-zinc-900">WebSetu</span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-500">
              {authMode === "login"
                ? "Log in to manage your website, leads and more."
                : "Start your 14-day free trial — no credit card required."}
            </p>

            <Tabs value={authMode} onValueChange={switchMode} className="mt-6">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-zinc-100 p-1">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
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

                  {/* Demo credential hint */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-900">Try the demo</p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800">
                      Demo: demo@websetu.in / demo1234
                      <br />
                      Admin: admin@websetu.in / admin1234
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fillDemo}
                      className="mt-2.5 h-8 border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100"
                    >
                      Fill demo
                    </Button>
                  </div>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-zinc-400">Minimum 6 characters.</p>
                  </div>

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
          </div>

          <p className="mt-6 text-center text-xs text-zinc-400">
            By continuing, you agree to our{" "}
            <a href="#" className="underline underline-offset-2 hover:text-emerald-700">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-2 hover:text-emerald-700">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
