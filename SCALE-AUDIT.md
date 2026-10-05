# Scale audit — gRPC, and what happens at a million requests

Measured on the live server, 11 September 2026. Nothing in this document has
been implemented. It is here to decide from.

---

## The short answer on gRPC

**gRPC will not help this project, and adding it would make things worse.**

That is not a general statement about gRPC — it is a good protocol. It is a
statement about what WebSetu is.

gRPC exists to make one **server** talk to another **server** quickly: binary
encoding instead of JSON, one long-lived HTTP/2 connection instead of many, a
generated client on both ends. It pays off when two of your own services
exchange millions of small messages.

WebSetu has none of that shape:

- **There is one service.** A single Next.js app. gRPC between a program and
  itself is a function call with extra steps.
- **The clients are browsers.** A browser cannot speak gRPC. It needs gRPC-Web,
  which needs a translating proxy (Envoy) in front. So you would add a protocol,
  a proxy, and a build step, to arrive back where you started.
- **The traffic is HTML.** The expensive request on this system is a shop's
  website page — server-rendered HTML sent to a phone. gRPC does not carry HTML
  and cannot make rendering it faster.
- **The bottleneck is not the wire.** Measured below: the time goes on CPU
  rendering and on the database, not on encoding JSON.

### Where gRPC would genuinely fit, later

One honest case. If WebSetu ever splits off a **separate worker** — an AI
content service, an image processor, a render farm — and that worker sits on its
own machine and is called constantly by the main app, gRPC between those two is
a reasonable choice. That is a problem to solve when it exists. Today there is
one process on one server.

**If the goal is "handle more traffic", gRPC is the wrong lever entirely.** The
right levers are measured below, and the cheapest one costs a single line.

---

## What "1,000,000 requests" actually means

The number alone cannot be answered. The window is everything:

| Spread over | Average rate | Verdict on today's setup |
|---|---|---|
| 1 day | ~12/sec | Comfortable, with room to spare |
| 1 hour | ~280/sec | HTML pages saturate; API is fine |
| 1 minute | ~16,600/sec | No single server survives this |
| Literally at once | — | Not a thing any architecture does |

Real traffic is never even. A normal site does its peak hour at roughly 5–10× its
average rate. So "a million a day" realistically means peaks of **60–120 requests
a second**, not twelve.

**And it would not "crash".** Node does not fall over under load — it queues.
What actually happens, in this order: response times climb (300 ms → 3 s → 20 s),
visitors give up and leave, and only then, if memory climbs past 600 MB, PM2
restarts the process and every in-flight request dies. The site gets unusably
slow long before anything crashes.

---

## Measured capacity, today

Server: **4 vCPU AMD EPYC 9355P, 16 GB RAM, 163 GB free.** Load average right
now: 0.00.

Throughput at concurrency 50, against the app directly:

| Endpoint | Requests/sec | p50 | p95 |
|---|---|---|---|
| `/api/plans` (JSON) | **830** | 49 ms | 122 ms |
| `/` (marketing HTML) | **167** | 295 ms | 369 ms |
| `/s/<slug>` (a customer's site) | **164** | 292 ms | 380 ms |

Single-request latency with nothing else happening: `/` 10 ms, `/api/plans`
3 ms, `/s/<slug>` 11 ms. The code is not slow. It runs out of **one CPU core**.

**Today's ceiling is roughly 165 HTML pages per second**, which is about
14 million a day if traffic were perfectly even, or around **1.5–3 million a day**
at realistic peakiness.

So: a million requests tomorrow, spread across the day, is survivable as it
stands. A million in an hour is not.

---

## Where it breaks, in order

Each of these is a real finding from the live server, cheapest fix first.

### 1. The app uses one CPU core out of four

```
exec mode : fork_mode
instances : 1
```

Three quarters of the machine is idle. This is the single biggest and cheapest
gain available — roughly **3–4× throughput for a configuration change**.

**The catch, and it is a real one.** Two pieces of the app assume there is only
one process, and both break silently in cluster mode:

- `src/lib/rate-limit.ts` keeps counters in memory. Four processes means four
  independent counters, so every limit becomes four times looser. The file says
  so already: *"If the deployment ever scales to multiple instances this must
  move to a shared store (Redis)."*
- `src/instrumentation.ts` runs the subscription sweep on a timer. Four
  processes means four sweeps doing the same work.

So this is not a one-line change on its own — it is one line plus a shared store
for those two things. Still the best return available.

### 2. Nothing is cached. Every visitor re-renders the page.

```
/                        private, no-cache, no-store, max-age=0, must-revalidate
/s/aetherdev-soft-tech   private, no-cache, no-store, max-age=0, must-revalidate
```

A shop's website that has not changed in a week is rendered from scratch,
including database queries, for **every single visitor**. This is the reason an
HTML page costs 165/sec while JSON costs 830/sec.

Tenant sites are close to perfectly cacheable: they change only when the owner
presses Publish. Caching them — even for 60 seconds — would take the common case
off the CPU almost entirely and is worth **more than the cluster change**, though
it needs more care.

### 3. SQLite is in the slowest of its modes

```
PRAGMA journal_mode = delete
PRAGMA synchronous  = 2   (FULL)
```

`delete` is the old default: **a writer blocks every reader**, and a reader blocks
the writer. For a read-heavy site this is the worst choice available.

`WAL` mode lets readers carry on while a write is in progress. It is a one-line
change, it is safe, and for this workload it is close to free performance.

The database is 700 KB. Size is not a problem and will not be for a long time.

SQLite's real limit is **one writer at a time**, server-wide. Reads scale;
writes do not. Today's writes are lead submissions, edits and payments — low
volume. This becomes a problem at a scale far beyond the traffic in question.

### 4. Static files are served by the origin

Every logo, CSS file and uploaded photo comes from this one server in Pune's
network path. A CDN in front would take the majority of requests off the box
entirely and make the site faster for anyone far from the server. This matters
more for *perceived* speed than for capacity.

### 5. One server, no redundancy

If this machine reboots, everything is down. Not a throughput issue, but it
belongs on the same list: there is no second machine, and `deploy-swap.py` gives
a ~1.5-second gap on every deploy precisely because there is nothing to fail over
to.

---

## The plan, staged by what is actually happening

Do not do all of this. Do the stage you are actually in.

### Stage 0 — today (3 customers, near-zero traffic)

**Do nothing.** The box is at 0.00 load. Every hour spent on capacity now is an
hour not spent finding customers, and the council in `.claude/council/` already
made that argument with the numbers behind it.

The one exception is the SQLite line, because it is nearly free:

| Change | Effort | Risk | Gain |
|---|---|---|---|
| `PRAGMA journal_mode = WAL` | minutes | low | readers stop blocking on writes |

### Stage 1 — when a page is measurably slow, or you expect a spike

Trigger: p95 above ~1 second in normal use, or a campaign that will send real
traffic.

| Change | Effort | Risk | Gain |
|---|---|---|---|
| Cache tenant sites (60 s, invalidated on Publish) | half a day | medium — must invalidate correctly or owners see stale pages | the big one; takes the common case off the CPU |
| CDN in front of static assets | half a day | low | most requests never reach the server |

### Stage 2 — when one core is genuinely the limit

Trigger: sustained CPU near 100% on the app's core.

| Change | Effort | Risk | Gain |
|---|---|---|---|
| Move rate limiting to a shared store (Redis) | half a day | low | prerequisite for the next line |
| Move the sweep timer to one owner (lock or cron) | hours | low | prerequisite |
| PM2 cluster, 4 instances | minutes, after the above | medium without them | 3–4× throughput |

**Order matters.** Turning on cluster mode before the first two lines quietly
multiplies every rate limit by four and runs the subscription sweep four times.
Nothing errors; the protections just stop protecting.

### Stage 3 — when SQLite's single writer is the limit

Trigger: write contention shows up as slow lead submissions or publish actions.

| Change | Effort | Risk | Gain |
|---|---|---|---|
| Move to PostgreSQL | 2–3 days | medium | concurrent writes, and a second app server becomes possible |

The groundwork is already done: `scripts/use-db.mjs` switches the Prisma
provider, and `src/lib/db-portable.ts` already handles the case-sensitivity
difference in search. This is a real migration, not a rewrite.

### Stage 4 — when one machine is the limit

Two or more app servers behind a load balancer, sharing PostgreSQL, Redis and
object storage for uploads. This is where the architecture changes shape, and
it is also the first point where **an internal protocol like gRPC could make
sense** — between the app servers and whatever workers exist by then.

Nothing about today's traffic argues for this.

---

## What not to do

- **Do not add gRPC to serve browsers.** It needs a translating proxy, and it
  cannot carry the HTML that is the actual load.
- **Do not switch to cluster mode without fixing the rate limiter first.** The
  limits silently become four times weaker — the login brute-force protection
  included.
- **Do not move to PostgreSQL to "prepare for scale."** SQLite is not the
  bottleneck at this traffic; the single core and the absent cache are.
- **Do not rewrite in another framework or language for speed.** The code
  answers in 10 ms. It is not the problem.

---

## The honest summary

If a million requests arrive tomorrow **spread over the day**, this server
handles it. Pages get slower at peak, nothing breaks.

If a million arrive **in an hour**, the site becomes unusably slow — not because
the code is bad, but because 3 of 4 cores are idle and every page is rendered
from scratch for every visitor. Both of those are fixable in about a day of
work, in the order above.

If a million arrive **in a minute**, no plan in this document helps, and none is
worth building for a business with three customers.

**The number that matters right now is not requests per second. It is customers.**
