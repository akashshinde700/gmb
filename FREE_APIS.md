# Free API keys you can use with WebSetu

WebSetu is designed so most integrations are **optional** — the app runs
without any of them (it falls back to simulated checkout, in-app alerts, and a
built-in AI stub). When you do wire real services in, these are the keys worth
getting because they have a genuinely usable **free tier**. Each row maps to a
variable in `.env.example`.

> Rule of thumb: never put a paid-only key on a public demo. Free tiers are
> enough to run WebSetu end-to-end and to show it to customers.

---

## 1. AI content generation (the big one)

WebSetu's AI copywriter reads `LLM_PROVIDER` / `LLM_MODEL` and one of these
keys. You only need **one**.

| Provider | Env var | Free tier | Notes |
| -------- | ------- | --------- | ----- |
| **Google Gemini** | `GEMINI_API_KEY` | Free tier, very generous (≈60 req/min, no card) | Best default for this project. Get it at Google AI Studio. |
| **Groq** | `GROQ_API_KEY` | Free, very fast inference on open models (Llama, Mixtral, Gemma) | Great for low-latency copy. Rate-limited but no card. |
| **OpenRouter** | `OPENROUTER_API_KEY` | Free tier + many "$0" open models (Mistral, Llama) | One key, dozens of models. Good for experimentation. |
| **Z.AI (Zhipu GLM)** | `ZAI_API_KEY` | Free tier for GLM models | Decent multilingual output. |
| **OpenAI** | `OPENAI_API_KEY` | Trial credits historically; limited free quota now | Works, but no standing free tier — watch billing. |
| **Anthropic** | `ANTHROPIC_API_KEY` | **Paid only** (no free tier) | Skip unless you already pay. |

**Recommendation:** start with **Gemini** (free, reliable) or **Groq** (free,
fast). Set `LLM_PROVIDER=gemini` and `LLM_MODEL=gemini-2.0-flash` (or whatever
the current free model is).

---

## 2. Transactional email (lead alerts, welcome, receipts)

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **Gmail SMTP** | Free | Use an app-specific password for `SMTP_PASS`. Zero cost, already configured as the default in `.env.example`. |
| **Resend** | 3,000 emails/mo on a verified domain (free) | Cleanest developer API; swap `SMTP_*` for Resend's SMTP. |
| **Brevo (Sendinblue)** | 300 emails/day free | Good if you don't own a domain yet. |
| **Mailgun** | Trial only | Free tier ended; use for production sends. |

**Recommendation:** **Gmail app password** for local/dev, **Resend** for
production.

---

## 3. SMS lead alerts

WebSetu's SMS path uses **httpSMS** — it turns one Android phone you own into a
gateway, so there is effectively **no per-message cost**.

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **httpSMS** | Free software; you supply the SIM/phone | What `.env.example` already targets (`HTTPSMS_API_*`). |
| **TextBelt** | 1 free SMS/day + cheap paid | Quick test without a phone. |
| **Twilio** | Trial credits only | Paid after trial. |

**Recommendation:** httpSMS — it's the integration already built in.

---

## 4. Payments

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **Razorpay** | Free to create account; **test mode** is free forever | Set `RAZORPAY_KEY_ID/SECRET`. Leave `ALLOW_MOCK_PAYMENTS=true` for local dev. |
| **Stripe** | Test mode free forever | Not yet wired into WebSetu, but easy to add. |

**Recommendation:** Razorpay test mode (India-focused, matches the INR pricing
already in the code).

---

## 5. Maps & location

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **OpenStreetMap + Nominatim** | Free, no key | Self-host or use the public endpoint for geocoding/embeds. |
| **Mapbox** | 50,000 map loads/mo free | Nicer tiles than OSM. |
| **Google Maps Platform** | $200/mo credit (not "free", but covers light use) | Heaviest; only if you need Google Places reviews. |

**Recommendation:** OSM/Nominatim for embeds to stay $0; Mapbox if you want
polished maps.

---

## 6. Images & media for templates/sites

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **Unsplash API** | Free (50 req/hr) | Royalty-free photos for template covers. |
| **Pexels API** | Free | Alternative stock source. |
| **Pixabay API** | Free | Another stock option. |
| **Remove.bg** | 50 credits/mo free | Background removal for logos/product shots. |
| **Cloudinary** | 25 GB storage free | Host + transform uploaded images. |

---

## 7. Logos & favicons

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **Clearbit Logo API** | Free, no key | `https://logo.clearbit.com/domain.com` — fetch a business logo by domain. |
| **Logo.dev** | Free tier | Higher quality, keyed. |

---

## 8. Analytics & monitoring (optional)

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **Umami** | Self-hosted, free | Privacy-friendly; pairs well with WebSetu's own analytics. |
| **PostHog** | 1M events/mo free | Product analytics. |
| **Sentry** | 5K errors/mo free | Crash/error monitoring for the app. |
| **Better Stack** | Free uptime monitoring | Know when the site is down. |

WebSetu already records its own page-view/event analytics in the database, so
external analytics are optional.

---

## 9. Hosting & DNS (to actually deploy)

| Service | Free tier | Notes |
| ------- | --------- | ----- |
| **Vercel** | Hobby tier free | Easy Next.js deploy. |
| **Netlify** | Free tier | Also Next.js friendly. |
| **Cloudflare** | Free DNS + CDN | Point custom domains here. |
| **Railway / Render** | Free tier (limited) | For the long-running Node server + DB. |

---

## Recommended starter kit (all free)

1. `GEMINI_API_KEY` — AI copy.
2. Gmail app password — transactional email.
3. httpSMS (your own phone) — SMS alerts.
4. Razorpay test mode — payments.
5. Unsplash API — template imagery.
6. Cloudflare (free) — DNS for custom domains.

That combination runs the entire product for **$0** while you validate it, then
you swap in paid tiers (Razorpay live, Resend, Mapbox, Sentry) as you grow.
