# Code Review — WebSetu (gmbzi)

> **Status, 7 October 2026** — addressed in the review pass recorded in
> `REVIEW-2026-10-07.md`:
> **1.2** (seed refuses a production database without `ADMIN_PASSWORD`) ✔
> **1.3** (both counters now claimed with one conditional statement; the
> overspend is reproduced and fixed in `tests/usage-race.mjs`) ✔
> **1.4** (a failed generation is refunded — same suite) ✔
> **1.6** (the onboarding draft is cleared on sign-out) ✔
> **1.5** stays a deployment decision, tracked with numbers in `SCALE-AUDIT.md`.
> **1.1** is the one item that is not a code change and is the most urgent: the
> public repository's *history* still carries `db/custom.db` and `.env`.
> `REVIEW-2026-10-07.md` §B has the fetch evidence and the exact commands.

## Context

- **Repository**: `C:\Users\ACER\Downloads\gmbzi` (branch `main`, uncommitted working-tree diff)
- **Diff size**: 114 files changed, ~8,088 insertions / ~17,117 deletions (per `git diff --stat`)
- **Stack**: Next.js `^16.1.1` (App Router, non-standard conventions per `AGENTS.md` — see note below), React `^19.0.0`, TypeScript `^5`, Prisma `^6.11.1` (SQLite dev / file-based DB), Tailwind, Razorpay payments.
- **Purpose/scope of the change**: A large restructuring of a "WebSetu" multi-tenant SaaS (local-business website builder). The diff:
  - Rewrites session handling from `localStorage` bearer tokens to httpOnly signed cookies, adds token-versioning for revocation.
  - Adds a shared API-route framework (`src/lib/api.ts`: `route()`, `HttpError`, rate limiting, validators, audit logging) and migrates nearly every route under `src/app/api/**` onto it.
  - Adds real Razorpay checkout (`order`/`verify`/`webhooks/razorpay`) alongside a guarded mock-payment path.
  - Adds subscription lifecycle sweeping (`expiry.ts`), custom-domain support (`domains.ts`, `Domain` model), GST-aware invoicing (`billing.ts`, `gst.ts`, `invoice.ts`), appearance/theme-change allowances, an AI-provider abstraction (`llm.ts`) replacing a sandbox-only SDK, and admin-side customer provisioning/impersonation.
  - Expands `prisma/schema.prisma` substantially (new models: `Domain`, `PasswordReset`, `AnalyticsDaily`, `Setting`, `Palette`, `PlatformLeadFollowUp`, `PlatformPost`; new indexes; new `Payment`/`Business`/`Plan` columns).
  - Adds security headers/CSP (`next.config.ts`), tightens ESLint rules, and removes dead scaffolding (`.zscripts/`, `examples/websocket/*`, unused shadcn/ui components, tool-results/upload transcripts, the tracked SQLite DB and `.env`).
  - Rewrites the large view components (`admin-view.tsx`, `dashboard-view.tsx`, `auth-view.tsx`, `onboarding-view.tsx`, `landing-view.tsx`) to match the new API surface.
- **Framework note**: Per `AGENTS.md`, this Next.js version deviates from standard training-data behavior; route conventions (e.g. `params: Promise<{...}>`, `after()` from `next/server`) were checked against local usage patterns rather than flagged as "wrong Next.js," per the review's scoping instructions.
- **Out of scope for deep review** (per reviewer instructions — noted here as cleanup, not re-analyzed): `.zscripts/*`, `tests/*.sh`, `examples/websocket/*`, `tool-results/*`, `upload/*`, deleted unused `src/components/ui/*` shadcn primitives. These are net deletions of unused scaffolding and carry effectively no risk.

## Review Plan

- [x] CR-PLAN-1.1 [Security Scan]: Auth/session (`src/lib/auth.ts`), payment/webhook signature verification (`src/lib/razorpay.ts`, `subscription/*`, `webhooks/razorpay`), tenant isolation and input validation across `src/app/api/**/route.ts`, file upload handling, secrets/git-history exposure. Priority: High.
- [x] CR-PLAN-1.2 [Data Integrity / Correctness Audit]: Prisma schema changes, transaction boundaries, idempotency of payment activation, race conditions in usage-counter enforcement (AI credits, theme changes, coupons). Priority: High.
- [x] CR-PLAN-1.3 [Performance Audit]: Pagination/N+1 patterns in list endpoints, rate-limiter architecture, DB indexing for new query patterns. Priority: Medium.
- [x] CR-PLAN-1.4 [Code Quality / Framework Best Practices]: API-route framework consistency, TypeScript strictness, dependency/config hygiene. Priority: Medium.

## Review Findings

- [ ] CR-ITEM-1.1 [Sensitive data and secrets committed to git history]:
  - **Severity**: Critical
  - **Location**: Repository history — `db/custom.db` (tracked across all 4 commits, ~312 KB SQLite file; deleted only in the current working-tree diff, `git status: D db/custom.db`), and `.env` (tracked at `HEAD`, containing `DATABASE_URL=...`; deleted only in this diff, `D .env`). The new `.gitignore` entries (`/db/`, `*.db`, `.env*`) and the comment added above them confirm the intent: *"The local SQLite database. It was tracked, which put real users, scrypt password hashes, leads and payment rows into every clone of this repo."*
  - **Description**: Deleting a file in a new commit does **not** remove it from git history — every prior commit (`1a097a7`, `f5d33d9`, `02b82c8`, `a6e0c20`) still contains the full SQLite database blob, including user password hashes (scrypt), lead PII (names/phones/emails), and payment/invoice rows, plus a `.env` file. Anyone who has ever cloned the repo, or anyone with future access to the remote, can extract this data from history regardless of the current working tree. This is the single most consequential issue in the diff — it is a data breach of user credentials and PII that working-tree deletion does not remediate.
  - **Recommendation**:
    1. Treat every password hash and PII record ever committed as compromised: force all existing users to reset their passwords (invalidate via `tokenVersion` bump + `PasswordReset` flow, which conveniently already exists in this diff) rather than assuming scrypt makes the hashes safe to leave circulating.
    2. Rewrite git history to purge the blobs (`git filter-repo --path db/custom.db --path .env --invert-paths`, or BFG Repo-Cleaner), then force-push and have every collaborator re-clone.
    3. Audit whether `db/custom.db`/`.env` were ever pushed to a shared remote (GitHub/GitLab/etc.) or only exist locally; if pushed, also rotate `APP_SECRET` and any other values that were in `.env` at any point in history (the current `.env` content shown is only `DATABASE_URL`, but earlier revisions were not checked line-by-line and should be audited too).
    4. Add a pre-commit hook or CI check (e.g. `git-secrets`, `gitleaks`) to prevent `*.db` / `.env*` from ever being staged again.

- [x] CR-ITEM-1.2 [Weak default/generated credentials for provisioned accounts]:
  - **Severity**: High
  - **Location**: `prisma/seed.ts` lines ~38-41 (`ADMIN_PASSWORD` fallback `"admin1234"`); `src/lib/provisioning.ts` lines 18-23 (`generatePassword()`).
  - **Description**:
    - `prisma/seed.ts` creates the platform `ADMIN` account with a password of `"admin1234"` whenever `ADMIN_PASSWORD` is not set in the environment. If the seed script is ever run against a production/staging database without that env var explicitly set (a realistic operational mistake — e.g. a fresh deploy, a CI job, a restored environment), a well-known, guessable admin credential is created with full platform-admin rights (including customer impersonation, per `CR-ITEM` note on `impersonate/route.ts`).
    - `generatePassword()` (used by `POST /api/admin/customers` when an admin provisions a customer without supplying a password) picks 2 words from a fixed 10-word list plus a 3-digit number: entropy is `10 × 10 × 900 = 90,000` combinations (~16.5 bits). Combined with login rate limiting (8 attempts/10 min per account, 20/10 min per IP — see `src/lib/api.ts`), this is not trivially brute-forceable online, but it is far weaker than the platform's own password policy for self-registered users (8+ chars, letter+digit required in `auth/register/route.ts`), and there is no forced password-change/reset requirement on first login for admin-provisioned accounts.
  - **Recommendation**:
    - Make the seed script refuse to create/reset the admin account with a hardcoded fallback when `NODE_ENV === "production"` — require `ADMIN_PASSWORD` explicitly, or generate and print a strong random password once and exit.
    - Increase `generatePassword()` entropy (e.g. `randomBytes` base32/base62 of 12+ chars) and/or set a `mustChangePassword` flag that forces a password reset on the admin-provisioned customer's first login.

- [x] CR-ITEM-1.3 [Race condition in usage-counter enforcement (AI credits, theme changes)]:
  - **Severity**: Medium
  - **Location**: `src/app/api/ai/generate/route.ts` (credit check/increment, ~lines 38-53); `src/lib/appearance.ts` `consumeThemeChange()` (lines 20-56).
  - **Description**: Both flows read the current usage count, compare it to the plan's allowance, and — only if under the limit — perform a **separate** `db.business.update({ data: { ...Count: { increment: 1 } } })` call. This is a classic check-then-act race: two concurrent requests (e.g. two browser tabs, or a retried request) can both pass the `used >= allowance` check before either write lands, letting a tenant consume one more unit than their plan allows. Notably, the codebase already knows the correct pattern and applies it correctly elsewhere — `src/lib/billing.ts` `activateSubscription()` claims a coupon with a **conditional** `updateMany({ where: { code, active: true }, data: { usedCount: { increment: 1 } } })` and checks `claimed.count`, specifically to avoid this exact race. The AI-credit and theme-change paths were not brought in line with that pattern.
  - **Recommendation**: Replace the read-check-then-write sequence with a single conditional update, mirroring the coupon-claim pattern, e.g.:
    ```ts
    const updated = await db.business.updateMany({
      where: { id: businessId, aiUsedCount: { lt: allowance } },
      data: { aiUsedCount: { increment: 1 } },
    });
    if (updated.count === 0) throw new HttpError("AI generation limit reached", 402);
    ```
    (Adjust for the period-rollover branch in `ai/generate/route.ts`, which will need the rollover write done conditionally too, e.g. gated on `aiPeriodStart` in the `where` clause.)

- [x] CR-ITEM-1.4 [AI credit consumed even when generation fails and only the deterministic fallback is served]:
  - **Severity**: Medium
  - **Location**: `src/app/api/ai/generate/route.ts`, lines ~38-53 vs. ~93-100.
  - **Description**: The route increments `aiUsedCount` (or resets the period) immediately after the allowance check, *before* calling `generateJson()`. `generateJson()` can legitimately return `null` (all configured providers failed, timed out, or returned unparseable output — see `src/lib/llm.ts` `generateJson`, which swallows every provider error and returns `null`), in which case the route falls back to deterministic template copy (`fallback` object, lines ~118-133) and reports `generated: false` to the client. The customer is nonetheless charged one of their limited monthly AI credits for a response that was not AI-generated at all.
  - **Recommendation**: Move the credit-consumption write to after a successful `generateJson()` call (i.e., only when `content` is non-null), or refund/skip the decrement when falling back to the deterministic template. Combine with the fix in CR-ITEM-1.3 so the whole check-generate-consume sequence is race-safe and fairness-correct together.

- [ ] CR-ITEM-1.5 [In-memory rate limiter is a silent single-point weakening if the deployment ever scales horizontally]:
  - **Severity**: Medium (currently Low given documented single-process deployment; escalates to High if deployed with >1 instance without the change below)
  - **Location**: `src/lib/rate-limit.ts` (entire file — in-memory `Map` bucket store).
  - **Description**: The file is explicit and self-aware about this ("*the app runs as a single PM2 fork process... If the deployment ever scales to multiple instances this must move to a shared store (Redis)*"), which is good practice, but there is no enforcement mechanism: if the app is later deployed behind a load balancer with N instances (a very plausible growth path for a SaaS), every rate limit in the app — login brute-force protection, per-account lockout, lead-form spam protection, coupon-enumeration protection, AI-credit throttling, subscription-order throttling — silently divides its effective strength by N with no error, warning, or metric to surface the regression. This is exactly the kind of security control that fails open silently.
  - **Recommendation**: Before any horizontal scaling, move `rateLimit()` to a shared store (Redis `INCR`+`EXPIRE`, or equivalent) behind the same function signature (the module comment already flags this as the intended migration point, which makes it low-effort). In the interim, consider a startup-time log/assertion if `process.env.INSTANCE_COUNT`/orchestrator metadata indicates more than one replica, so a misconfiguration is visible in logs rather than only in degraded security posture.

- [x] CR-ITEM-1.6 [Onboarding wizard persists business PII to `localStorage` in plaintext]:
  - **Severity**: Low
  - **Location**: `src/components/views/onboarding-view.tsx` — `DRAFT_KEY` usage (draft save ~line 308, restore ~line 289-292, clear ~line 544).
  - **Description**: The onboarding draft (business name, phone, email, address, description, etc.) is saved to `localStorage` unencrypted so a page reload can recover it. This is a reasonable UX tradeoff and is not the session-token problem the diff correctly fixed elsewhere (`api-client.ts` now uses httpOnly cookies), but on a shared/public computer this PII persists after the browser tab is closed and is readable by any script that later runs on the same origin (e.g. a future XSS, or a browser extension).
  - **Recommendation**: Low priority given the CSP hardening already added in `next.config.ts`. If addressed, prefer `sessionStorage` (cleared when the tab closes) over `localStorage`, and/or clear the draft key on an explicit "start over"/logout action in addition to the existing post-success clear.

## Positive Aspects

This diff is, on the whole, a well-executed and unusually security-conscious hardening pass. Worth calling out explicitly so they are not lost among the findings above:

- **Session handling**: Correctly migrated from `localStorage` bearer tokens to httpOnly, `SameSite=Lax`, `Secure`-in-production cookies, with a `tokenVersion` mechanism enabling real session revocation on password change — something the prior design could not do at all.
- **Payment security**: The Razorpay integration (`src/lib/razorpay.ts`, `subscription/order`, `subscription/verify`, `webhooks/razorpay`) is textbook-correct: server-computed amounts only, HMAC signature verification with `timingSafeEqual`, a second server-side fetch of the payment before trusting "captured" status, ownership cross-checks against order notes, and idempotent activation keyed on invoice number so the browser callback and the webhook can both fire safely.
- **Timing-safe comparisons** applied consistently (`verifyPassword`, `verifyTokenPayload`, Razorpay signature checks), including a deliberate dummy-hash computation on a malformed stored hash to avoid a user-enumeration timing oracle.
- **Coupon race condition already correctly solved** in `billing.ts` via a conditional `updateMany` rather than read-then-write (see CR-ITEM-1.3 for the two places this pattern wasn't yet copied).
- **File uploads**: magic-byte sniffing rather than trusting client `Content-Type`/filename, SVG deliberately excluded (script risk), path-traversal-safe filename resolution, and a nosniff + restrictive CSP on the serving route.
- **Rate limiting** is applied thoughtfully and specifically to the right endpoints (login, register, lead submission, coupon validation, AI generation, checkout, impersonation), with a documented and correct fix for a real X-Forwarded-For proxy-trust bug (only trusting the rightmost N hops).
- **Centralized API framework** (`src/lib/api.ts`) meaningfully reduces duplication and risk: consistent error shaping (never leaking Prisma internals or stack traces to clients), consistent tenant-isolation guard (`requireBusiness` always derives the business from the session, never from client input), and consistent audit logging on admin/state-changing actions.
- **CSP and security headers** added in `next.config.ts` with well-reasoned, documented tradeoffs (e.g. why `unsafe-inline` is currently unavoidable, why `includeSubDomains` on HSTS is deliberately omitted for customer custom domains).
- **JSON-LD injection defense**: `jsonLdScript()` in `site-utils.ts` correctly escapes `</script>` and line-separator characters that plain `JSON.stringify` would let through into a `dangerouslySetInnerHTML` script tag.
- **Cleanup**: substantial, low-risk removal of dead scaffolding (unused shadcn/ui components, deploy scripts, websocket examples, tool-result transcripts) improves maintainability without functional risk.

## Proposed Code Changes

**CR-ITEM-1.3 — atomic AI-credit consumption** (`src/app/api/ai/generate/route.ts`):
```diff
-  if (business && providerReady) {
-    const allowance = business.subscription?.plan?.aiCredits ?? FREE_AI_CREDITS;
-    const periodExpired = Date.now() - business.aiPeriodStart.getTime() >= AI_PERIOD_MS;
-    const used = periodExpired ? 0 : business.aiUsedCount;
-
-    if (allowance >= 0 && used >= allowance) {
-      throw new HttpError(
-        `You have used all ${allowance} AI generations included in your plan this month. Upgrade for more.`,
-        402,
-      );
-    }
-
-    await db.business.update({
-      where: { id: business.id },
-      data: periodExpired
-        ? { aiUsedCount: 1, aiPeriodStart: new Date() }
-        : { aiUsedCount: { increment: 1 } },
-    });
-  }
+  let creditReserved = false;
+  if (business && providerReady) {
+    const allowance = business.subscription?.plan?.aiCredits ?? FREE_AI_CREDITS;
+    const periodExpired = Date.now() - business.aiPeriodStart.getTime() >= AI_PERIOD_MS;
+
+    const claim = periodExpired
+      ? await db.business.updateMany({
+          where: { id: business.id, aiPeriodStart: business.aiPeriodStart },
+          data: { aiUsedCount: 1, aiPeriodStart: new Date() },
+        })
+      : await db.business.updateMany({
+          where: { id: business.id, ...(allowance >= 0 ? { aiUsedCount: { lt: allowance } } : {}) },
+          data: { aiUsedCount: { increment: 1 } },
+        });
+
+    if (claim.count === 0 && allowance >= 0) {
+      throw new HttpError(
+        `You have used all ${allowance} AI generations included in your plan this month. Upgrade for more.`,
+        402,
+      );
+    }
+    creditReserved = claim.count > 0;
+  }
```
Then, further down (CR-ITEM-1.4), only keep the credit consumed when a real AI response was produced — e.g. refund it when falling back:
```diff
   const content: AiSiteContent | null = generated?.content ?? null;
+  if (creditReserved && !content) {
+    // The provider chain failed and we are serving the deterministic
+    // fallback — do not charge the tenant's plan for template copy.
+    await db.business.update({ where: { id: business!.id }, data: { aiUsedCount: { decrement: 1 } } }).catch(() => {});
+  }
```

**CR-ITEM-1.3 — atomic theme-change consumption** (`src/lib/appearance.ts`):
```diff
-  const allowance = allowanceFor(business);
-  if (!allowance.canChange) {
-    throw new HttpError(
-      `You have used all ${allowance.limit} free design changes. Upgrade your plan to keep restyling your website.`,
-      402,
-    );
-  }
-  if (allowance.unlimited) return allowance;
-
-  const updated = await db.business.update({
-    where: { id: businessId },
-    data: { themeChangesUsed: { increment: 1 } },
-    select: { themeChangesUsed: true },
-  });
+  const allowance = allowanceFor(business);
+  if (allowance.unlimited) return allowance;
+  if (!allowance.canChange) {
+    throw new HttpError(
+      `You have used all ${allowance.limit} free design changes. Upgrade your plan to keep restyling your website.`,
+      402,
+    );
+  }
+
+  const claim = await db.business.updateMany({
+    where: { id: businessId, themeChangesUsed: { lt: allowance.limit } },
+    data: { themeChangesUsed: { increment: 1 } },
+  });
+  if (claim.count === 0) {
+    throw new HttpError(
+      `You have used all ${allowance.limit} free design changes. Upgrade your plan to keep restyling your website.`,
+      402,
+    );
+  }
+  const updated = await db.business.findUniqueOrThrow({
+    where: { id: businessId },
+    select: { themeChangesUsed: true },
+  });
```

**CR-ITEM-1.2 — seed script refuses insecure production default** (`prisma/seed.ts`):
```diff
-  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@websetu.in";
-  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin1234";
+  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@websetu.in";
+  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
+    throw new Error("ADMIN_PASSWORD must be set explicitly before seeding a production database.");
+  }
+  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin1234";
```

CR-ITEM-1.1 (git history purge) has no in-repo code diff — it is an operational/history-rewrite action plus a credential-rotation and forced password-reset action; see the recommendation steps under that finding.

## Effort & Priority Assessment

| Item | Effort | Complexity | Dependencies | Priority |
|---|---|---|---|---|
| CR-ITEM-1.1 (git history purge + credential rotation) | Medium (mechanical, but needs coordination: force-push, re-clone by all collaborators, forced user password resets) | Low technically, High organizationally | None blocking; should happen before this branch/repo is shared further or made public | **Do first** |
| CR-ITEM-1.2 (seed password hardening) | Low (few lines) | Low | None | High |
| CR-ITEM-1.3 (atomic credit/theme-change updates) | Low–Medium (two call sites, needs a quick concurrency test) | Low | None | Medium |
| CR-ITEM-1.4 (don't charge AI credit on fallback) | Low | Low | Best done together with 1.3 | Medium |
| CR-ITEM-1.5 (rate limiter scaling note) | None now / Medium later (Redis migration) | Medium (only when scaling) | Deployment topology decision | Medium (track, revisit before horizontal scaling) |
| CR-ITEM-1.6 (localStorage draft) | Low | Low | None | Low |

**Overall assessment**: The functional/security engineering quality of this diff is high — most of the classic SaaS pitfalls (payment amount tampering, session token theft via XSS, coupon double-redemption, path traversal, IDOR via tenant isolation, timing attacks, X-Forwarded-For spoofing) are already correctly handled, several with detailed in-code rationale showing the fix was deliberate rather than incidental. The one finding that materially changes the risk posture of this change is CR-ITEM-1.1: real credential and PII material sitting in git history is a genuine data-exposure incident that the working-tree cleanup in this diff does not resolve, and it should be treated with more urgency than the application-code fixes above it.
