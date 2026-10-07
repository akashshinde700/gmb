# WebSetu

**WebSetu** is an AI-powered Website-as-a-Service (WaaS) platform for local
businesses in India. A business owner answers a few questions, picks an
industry template, and the platform's AI writes the copy, builds a multi-page
site, and puts it online with Google Business Profile integration, SEO/AEO,
WhatsApp & call CTAs, lead capture and analytics — no coding required.

It is also a **multi-tenant, white-label SaaS**: agencies can run the platform
under their own domain and brand, sell plans to their own customers, and manage
everything from an admin console.

---

## Features

- **Guided website builder** with 12 ready-made sections and a live visual editor.
- **AI content generation** — headlines, service descriptions and About copy
  drafted from business details, editable in place. Pluggable providers
  (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Z.AI).
- **Industry templates** with a per-site generated "animation genome" and
  theme palettes an admin controls.
- **SEO & AEO** — per-page meta tags, sitemap, schema markup and
  answer-engine optimization.
- **Google Maps & Google Business Profile** embeds, business hours and
  directions.
- **WhatsApp & click-to-call CTAs** that turn visitors into conversations.
- **Lead capture** with statuses, notes and follow-up tracking (CRM).
- **Analytics** — page views and events folded into daily totals.
- **Plans, coupons and subscriptions** with Razorpay payments (simulated
  checkout for local dev).
- **Custom domains** with DNS verification and a platform-managed host.
- **Reseller / white-label mode** — per-domain branding, reseller API keys and
  a reseller console.
- **Content importers** — Figma and existing-website import.
- **Blog** platform with seeded posts.
- **Admin console** — businesses, customers, plans, palettes, coupons,
  templates, leads, analytics and AI-usage dashboards.

## Tech stack

| Layer        | Choice                                                            |
| ------------ | ----------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, React 19)                                 |
| Styling      | Tailwind CSS v4, shadcn/ui components, Framer Motion              |
| Database     | Prisma + libSQL adapter (SQLite by default, Postgres via `db:use`) |
| Auth         | Signed session tokens (HMAC, `APP_SECRET`)                        |
| Email/SMS    | Nodemailer (SMTP) + httpSMS for lead alerts                       |
| Payments     | Razorpay (mock gateway for local dev)                             |
| Charts       | Recharts                                                          |
| State        | Zustand                                                           |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   - set APP_SECRET (openssl rand -hex 32)
#   - set NEXT_PUBLIC_APP_URL
#   - (optional) AI provider keys, SMTP, Razorpay, etc.

# 3. Prepare the database and seed demo data
npx prisma generate
npm run db:push
npm run seed

# 4. Run
npm run dev          # http://localhost:3000
```

### Useful scripts

| Script            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Dev server with request logging               |
| `npm run build`   | Production standalone build                   |
| `npm run lint`    | ESLint (Next config)                          |
| `npm run test:all`| Full API + unit test suite                    |
| `npm run seed`    | Seed demo businesses, plans, templates, posts |
| `npm run db:push` | Apply the Prisma schema to the database       |

## Project layout

- `src/app` — App Router routes (marketing `/`, `/login`, `/onboarding`,
  `/dashboard`, `/admin`, `/editor`, `/blog`, `/reseller`, `/developers`) and
  the `/api` surface.
- `src/components/views` — the larger screen-level views (landing, dashboard,
  admin, auth, editor, reseller, onboarding).
- `src/components/site` — the tenant-site renderer and section components.
- `src/components/ui` — shadcn/ui primitives.
- `src/lib` — business logic (billing, provisioning, appearance, analytics,
  auth guard, platform theme, reseller branding, legal copy).
- `prisma` — schema and seed.

## Security note (important for this public repo)

This repository's **current tree** is clean and does not track secrets. Its
**history**, however, briefly contained `db/custom.db` and `.env` in a few
early commits. Those blobs were removed from the tree but remain reachable from
old commit SHAs. If you clone or fork this repo:

1. Treat any password hash or lead from those old blobs as already public.
2. Rotate `APP_SECRET` and force a password reset for affected accounts.
3. Consider `git filter-repo` to purge the blobs, then coordinate a force-push
   (everyone re-clones). Until then, **never** commit `.env*` or `*.db` — they
   are already in `.gitignore`.

---

Built and maintained as a small Indian SaaS. Contributions welcome.
