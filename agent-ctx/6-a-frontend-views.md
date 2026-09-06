# Task 6-a — Landing View + Auth View (work record)

Agent: frontend-views (Z.ai Code)
Date: session record

## Scope
Exactly 2 files created; no other file modified:
- `src/components/views/landing-view.tsx` — full marketing page for view "home"
- `src/components/views/auth-view.tsx` — split-screen login/register view

## Key contract facts used (for downstream agents)
- `page.tsx` root is `flex min-h-screen flex-col`; landing returns a **fragment** with `<footer className="mt-auto">`.
- `useApp` selectors used: `user`, `plans`, `authMode`, `setAuthMode`, `openSite`, `hydrate`; post-auth unread via `useApp.getState().setUnread`.
- Auth APIs return `{ token, user }` only — business presence must come from `hydrate()` (`/api/auth/me`). Routing rule implemented: ADMIN → `#/admin`, business → `#/dashboard`, else → `#/onboarding`.
- `GET /api/plans` → `{ plans, templates }`; store.hydrate also fills `plans` (store preferred, fetch as fallback).
- `POST /api/platform-lead` fields: name, email, phone, businessType, message, source:"CONTACT"; success returns `{ message }`.
- Toasts: shadcn `useToast` (`@/hooks/use-toast`) — Toaster is mounted in layout.tsx. Sonner is NOT mounted.
- `globals.css` `--primary` is zinc, not emerald → brand buttons use explicit `bg-emerald-600 hover:bg-emerald-700 text-white`.

## Gotchas solved (relevant to other view builders)
1. **Anchor vs hash router**: plain `href="#features"` triggers the shell's `hashchange` → `scrollTo(top)`. All in-page anchors use `e.preventDefault()` + `scrollIntoView({behavior:"smooth"})` instead.
2. **Tailwind safelist**: template gradients arrive at runtime via API and are NOT scanned. Seed gradients are mirrored in a `FALLBACK_TEMPLATES` const inside landing-view.tsx so Tailwind generates those classes.
3. **Missing image**: `/images/hero-business.jpg` doesn't exist yet → rendered via `<img onError>` that falls back to the emerald gradient strip.
4. **Loader2** import was initially missing in landing-view (caught by tsc, fixed).

## Verification
- `bunx tsc --noEmit` → 0 errors in both files.
- `bunx eslint <both files>` → exit 0 (0 errors, 0 warnings).
- Full-repo lint has pre-existing errors in `src/components/views/site-view.tsx` (react-hooks/set-state-in-effect) — owned by another task, not modified.

## Not done (out of scope)
- onboarding/dashboard/admin/site views (other task IDs).
- hero-business.jpg asset generation (task 1-5 scope).
