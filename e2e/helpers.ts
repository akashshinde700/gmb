import { expect, type Page, type ConsoleMessage, type Request } from "@playwright/test";

/** Seeded accounts (prisma/seed.ts). */
export const ADMIN = { email: "admin@websetu.in", password: "admin1234" };
export const DEMO = { email: "demo@websetu.in", password: "demo1234" };
export const DEMO_SLUG = "sharma-electricals";

/** Noise that is not the application's fault and would fail every test. */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /webpack-hmr|_next\/static\/development/i,
  // next dev's HMR socket — never present in the production bundle.
  /WebSocket connection to .*_next\/hmr/i,
  // React's dev-only hydration timing warning from next dev's overlay.
  /Warning: Extra attributes from the server/i,
];

export interface PageProblems {
  console: string[];
  requests: string[];
  pageErrors: string[];
}

/**
 * Record console errors, uncaught exceptions and failed/4xx/5xx requests for a
 * page. Attach once per test, assert at the end.
 */
export function watchProblems(page: Page): PageProblems {
  const problems: PageProblems = { console: [], requests: [], pageErrors: [] };

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    if (msg.type() === "error") problems.console.push(text);
  });

  page.on("pageerror", (err) => problems.pageErrors.push(err.message));

  page.on("requestfailed", (req: Request) => {
    const failure = req.failure()?.errorText || "";
    // Aborts are usually the app cancelling its own in-flight request.
    if (/ERR_ABORTED|net::ERR_ABORTED/.test(failure)) return;
    problems.requests.push(`${req.method()} ${req.url()} — ${failure}`);
  });

  page.on("response", (res) => {
    const status = res.status();
    const url = res.url();
    if (status < 400) return;
    // Deliberate negative tests set this flag.
    if ((page as unknown as { __expectErrors?: boolean }).__expectErrors) return;
    problems.requests.push(`${status} ${res.request().method()} ${url}`);
  });

  return problems;
}

/** Assert a page produced no console errors, exceptions or failed requests. */
export function expectClean(problems: PageProblems, where: string) {
  const all = [
    ...problems.pageErrors.map((e) => `uncaught: ${e}`),
    ...problems.console.map((e) => `console.error: ${e}`),
    ...problems.requests.map((e) => `request: ${e}`),
  ];
  expect(all, `${where} produced browser problems`).toEqual([]);
}

/** Let the SPA finish hydrating (the shell shows a spinner until then). */
export async function waitForApp(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  await page.waitForFunction(() => !document.body.innerText.includes("WebSetu\nLoading"), null, { timeout: 15_000 })
    .catch(() => {});
  // The shell renders a spinner-only loading screen until the store hydrates.
  await page.waitForFunction(
    () => {
      const text = document.body.innerText.trim();
      return text.length > 40 || document.querySelectorAll("main, header, section, form").length > 0;
    },
    null,
    { timeout: 20_000 },
  );
}

/**
 * The visible tab panel. Radix keeps the inactive panel mounted, so unscoped
 * label lookups match the login and register fields at once.
 */
export function activePanel(page: Page) {
  return page.locator('[role="tabpanel"]:not([hidden])');
}

/** Log in through the real form and land on the dashboard or admin view. */
export async function login(page: Page, who: { email: string; password: string }) {
  // Signing in through the form means starting signed out. `createCustomer`
  // registers over the page's own request context, so its Set-Cookie lands in
  // this jar — and /login now sends an already-signed-in visitor straight to
  // their dashboard, leaving no form to fill.
  await page.context().clearCookies();
  await page.goto("/login");
  await waitForApp(page);

  // The login page is server-rendered now, so its markup arrives before the
  // JavaScript that makes it work. waitForApp is satisfied by that markup, which
  // means filling the form here can race hydration: the fields exist, Radix has
  // not wired up the tab panel yet, and the click lands on nothing.
  // Scoping to the active tab panel used to be necessary because Radix keeps the
  // register panel mounted alongside the login one. The login page is server-
  // rendered now, so the panel wrapper is not present until hydration finishes —
  // waiting on the fields themselves is both simpler and what a person does.
  const email = page.getByLabel(/^email$/i).first();
  await email.waitFor({ state: "visible", timeout: 20_000 });
  await email.fill(who.email);
  await page.getByLabel(/^password$/i).first().fill(who.password);
  await page.getByRole("button", { name: /^log in$/i }).first().click();

  // Surface the app's own error instead of a bare timeout — a 429 from the
  // login limiter looks identical to a broken login otherwise.
  const stillOnForm = page.getByRole("button", { name: /^log in$/i });
  try {
    await expect(stillOnForm).toHaveCount(0, { timeout: 20_000 });
  } catch (err) {
    const alert = page.getByText(/could not log in/i);
    const detail = (await alert.count()) ? await alert.locator("..").innerText() : "(no message shown)";
    throw new Error(`login as ${who.email} did not complete — the app said: ${detail.replace(/\s+/g, " ")}`);
  }
}

/**
 * Create a customer straight through the API.
 *
 * Form-driven tests then log in as somebody nobody else is using: the login
 * route allows 8 attempts per account per 10 minutes (deliberately), and a
 * shared demo account runs that budget down across a suite.
 */
export async function createCustomer(page: Page, tag: string) {
  const email = `pw-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  const password = "PwTest!2345";
  const res = await page.request.post("/api/auth/register", {
    data: { name: `PW ${tag}`, email, password },
  });
  if (!res.ok()) throw new Error(`could not create a test customer: ${res.status()} ${await res.text()}`);
  return { email, password };
}

/** Register a brand new customer and return its credentials. */
export async function registerNew(page: Page, tag: string) {
  const email = `pw-${tag}-${Date.now()}@example.com`;
  const password = "PwTest!2345";
  await page.goto("/login");
  await waitForApp(page);
  await page.getByRole("tab", { name: /register/i }).click();
  const form = activePanel(page);
  await form.getByLabel(/full name/i).fill(`PW ${tag}`);
  await form.getByLabel(/^email$/i).fill(email);
  await form.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^create account$/i }).click();
  return { email, password };
}

/**
 * Drop the session so a test can switch identities quickly.
 *
 * This used to clear localStorage, which was where the token lived before the
 * move to an httpOnly cookie — so it cleared nothing and the "logged out" half
 * of any test using it was still logged in.
 */
export async function clearSession(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

/** Viewports used by the responsive pass. */
export const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-375", width: 375, height: 667 },
];

/** Horizontal overflow check — the page must never scroll sideways. */
export async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  expect(
    overflow.scroll,
    `${where}: page scrolls horizontally (${overflow.scroll}px content in ${overflow.client}px viewport)`,
  ).toBeLessThanOrEqual(overflow.client + 1);
}

/**
 * Create a customer that already has a business, and sign the page into it.
 *
 * CRUD tests need their own tenant: editing the seeded demo site would make the
 * public-site assertions depend on whatever the last test left behind.
 */
export async function createTenant(page: Page, tag: string) {
  const { email, password } = await createCustomer(page, tag);

  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  if (!login.ok()) throw new Error(`could not sign in the test tenant: ${login.status()}`);
  const token = (await login.json())?.data?.token as string;
  if (!token) throw new Error("login returned no token");

  const onboard = await page.request.post("/api/onboarding", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `PW ${tag} Electricals`,
      category: "Electrician",
      phone: "9876543210",
      city: "Pune",
      tagline: "Wiring done right",
      description: "A test tenant created by the Playwright audit.",
      services: [{ name: "House wiring", description: "Full home rewiring." }],
    },
  });
  if (!onboard.ok()) throw new Error(`could not create the test business: ${onboard.status()} ${await onboard.text()}`);

  // No init script to plant a token: `page.request` shares the browser
  // context's cookie jar, so the Set-Cookie from the login above has already
  // signed this page in. The old localStorage hand-off stopped meaning
  // anything when the session became an httpOnly cookie.
  return { email, password, token };
}

/** Open a dashboard tab by its sidebar label. */
export async function openTab(page: Page, label: string) {
  // The label may be followed by a badge count, so anchor on a word boundary.
  await page.getByRole("button", { name: new RegExp("^" + label + "\\b", "i") }).first().click();
  await expect(page.locator("main")).not.toBeEmpty();
}
