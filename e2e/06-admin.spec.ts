import { test, expect } from "@playwright/test";
import { expectClean, expectNoHorizontalScroll, waitForApp, watchProblems } from "./helpers";
import { STATE } from "./global-setup";

/** The platform admin console: every tab, plus the flows that change money or access. */

test.use({ storageState: STATE.admin });

const TABS = [
  { label: "Overview", expect: /customers|revenue|businesses|websites/i },
  { label: "Customers", expect: /customer|business|plan/i },
  { label: "Plans", expect: /plan|price|₹/i },
  { label: "Templates", expect: /template/i },
  { label: "Coupons", expect: /coupon|code|discount/i },
  { label: "Platform Leads", expect: /lead|enquir|follow/i },
  { label: "Blog", expect: /post|blog/i },
  { label: "Appearance", expect: /palette|colou?r|theme/i },
];

test.describe("Admin console", () => {
  test("every admin tab opens with no errors", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/admin");
    await waitForApp(page);

    for (const tab of TABS) {
      await page.getByRole("button", { name: new RegExp("^" + tab.label + "\\b", "i") }).first().click();
      const main = page.locator("main");
      await expect(main, `"${tab.label}" did not open`).toContainText(tab.expect, { timeout: 15_000 });
      const text = (await main.innerText()).trim();
      expect(text.length, `"${tab.label}" rendered an empty panel`).toBeGreaterThan(40);
    }

    expectClean(problems, "admin tabs");
  });

  test("the admin can add a customer and the record persists", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/admin");
    await waitForApp(page);
    await page.getByRole("button", { name: /^customers\b/i }).first().click();

    const add = page.getByRole("button", { name: /add customer|new customer|create customer/i }).first();
    await expect(add, "the admin needs a way to create a customer").toBeVisible();
    await add.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const stamp = Date.now();
    const business = `PW Admin Co ${stamp}`;
    await dialog.getByLabel(/business name/i).first().fill(business);
    await dialog.getByLabel(/owner|full name|contact name/i).first().fill("Admin Created");
    await dialog.getByLabel(/^email/i).first().fill(`pw-admin-${stamp}@example.com`);
    await dialog.getByLabel(/^password/i).first().fill("AdminMade!2345");
    const phone = dialog.getByLabel(/phone/i).first();
    if (await phone.count()) await phone.fill("9876543210");
    const city = dialog.getByLabel(/^city/i).first();
    if (await city.count()) await city.fill("Pune");

    // Filling the business section makes the category required.
    await dialog.getByLabel(/^category/i).first().click();
    await page.getByRole("option").first().click();

    await dialog.getByRole("button", { name: /^create customer$/i }).click();

    // The generated password is shown once, in its own dialog.
    const credentials = page.getByRole("dialog").filter({ hasText: /customer created/i });
    await expect(credentials, "the admin must be shown the new login once").toBeVisible({
      timeout: 20_000,
    });
    await credentials.getByRole("button", { name: /^done$/i }).click();

    await expect(page.locator("main")).toContainText(business, { timeout: 15_000 });

    await page.reload();
    await waitForApp(page);
    await page.getByRole("button", { name: /^customers\b/i }).first().click();
    await expect(page.locator("main"), "the new customer must persist").toContainText(business, {
      timeout: 15_000,
    });

    expectClean(problems, "admin add customer");
  });

  test("a business without a category is refused with a clear message", async ({ page }) => {
    await page.goto("/admin");
    await waitForApp(page);
    await page.getByRole("button", { name: /^customers\b/i }).first().click();
    await page.getByRole("button", { name: /add customer|new customer/i }).first().click();

    const dialog = page.getByRole("dialog");
    const stamp = Date.now();
    await dialog.getByLabel(/full name/i).first().fill("No Category");
    await dialog.getByLabel(/^email/i).first().fill(`pw-nocat-${stamp}@example.com`);
    await dialog.getByLabel(/business name/i).first().fill(`PW No Category ${stamp}`);
    await dialog.getByRole("button", { name: /^create customer$/i }).click();

    await expect(dialog.getByText(/category/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog, "the form must stay open so the mistake can be fixed").toBeVisible();
  });

  test("customer search filters the list and recovers when cleared", async ({ page }) => {
    await page.goto("/admin");
    await waitForApp(page);
    await page.getByRole("button", { name: /^customers\b/i }).first().click();

    const search = page.getByPlaceholder(/search/i).first();
    test.skip(!(await search.count()), "no customer search on this build");

    await expect(page.locator("main")).toContainText(/sharma|cafe|electric/i, { timeout: 15_000 });

    await search.fill("zzz-definitely-no-such-customer");
    await expect(
      page.locator("main"),
      "a search with no matches needs an empty state, not a blank panel",
    ).toContainText(/no customers|nothing|no results|no matches/i, { timeout: 15_000 });

    await search.fill("");
    await expect(page.locator("main")).toContainText(/sharma|cafe|electric/i, { timeout: 15_000 });
  });

  test("a palette can be added and removed from the library", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/admin");
    await waitForApp(page);
    await page.getByRole("button", { name: /^appearance\b/i }).first().click();

    const add = page.getByRole("button", { name: /add palette|new palette/i }).first();
    test.skip(!(await add.count()), "no palette editor on this build");
    await add.click();

    const dialog = page.getByRole("dialog");
    const name = `PW Palette ${Date.now()}`;
    await dialog.getByLabel(/name/i).first().fill(name);
    await dialog.getByRole("button", { name: /save|add|create/i }).last().click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("main")).toContainText(name, { timeout: 15_000 });

    expectClean(problems, "admin palettes");
  });

  test("the admin console works on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await waitForApp(page);

    const menu = page.getByRole("button", { name: /open navigation menu|menu/i }).first();
    await expect(menu).toBeVisible();
    await menu.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: /^plans\b/i }).first().click();
    await expect(page.locator("main")).toContainText(/plan/i, { timeout: 15_000 });

    await expectNoHorizontalScroll(page, "admin @390");
  });

  test("the admin can log out", async ({ page }) => {
    await page.goto("/admin");
    await waitForApp(page);
    await page.getByRole("button", { name: /log ?out/i }).first().click();
    // first(): the landing page offers "Log in" twice — in the main navigation
    // and again in the account links in the footer — so an unscoped locator is
    // a strict-mode violation rather than a failed logout.
    await expect(page.getByRole("button", { name: /^log in$/i }).first()).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * Opening a customer's account from the admin console.
 *
 * This flow has now broken three separate ways, each of them invisible to a
 * test that only checked the API: the token moved to an httpOnly cookie and the
 * client kept planting it in localStorage; the "return to admin" banner was put
 * inside the Customers tab and vanished the moment the admin clicked any other
 * tab; and window.open() was called with "noopener", which makes it return null,
 * so nothing was left holding the new tab and it sat on about:blank.
 *
 * So this drives the real buttons, in a real browser, and follows the new tab.
 */
test.describe("Opening a customer account", () => {
  test("opens the customer's dashboard in a new tab and offers a way back", async ({ page, context }) => {
    await page.goto("/admin/customers");
    await waitForApp(page);

    // Whichever customer is at the top of the list: the endpoint returns only
    // CUSTOMER rows, newest first, so the first one is always a valid target
    // and the test does not depend on a particular seeded account still being
    // on the first page of a table the rest of the suite keeps adding to.
    const actions = page.getByRole("button", { name: /^actions for /i }).first();
    await expect(actions).toBeVisible({ timeout: 15_000 });
    await actions.click();

    const opened = context.waitForEvent("page");
    await page.getByRole("menuitem", { name: /log in as customer/i }).click();

    // The tab has to actually arrive somewhere. It used to stay on about:blank.
    const customerTab = await opened;
    await customerTab.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await expect(customerTab.locator("body")).not.toBeEmpty();

    // One cookie jar: the admin tab is inside the customer's session too, and
    // has to say so rather than keep looking like an admin console.
    await expect(page.getByText(/support visit/i)).toBeVisible({ timeout: 20_000 });

    // And the way back has to work, from the admin tab, without a fresh login.
    await page.getByRole("button", { name: /return to admin/i }).click();
    await page.waitForURL(/\/admin/, { timeout: 20_000 });
    await expect(page.getByText(/support visit/i)).toHaveCount(0);
    await expect(page.locator("body")).toContainText(/customers|plans|overview/i);

    await customerTab.close();
  });
});

/**
 * The customer list is bigger than one page.
 *
 * These exist because the list was rendered from a single unparameterised
 * `GET /api/admin/customers`, which answers with at most 100 rows, and the
 * search box filtered those rows in the browser. With 788 accounts in the
 * database the screen reported "Showing 100 of 100 customers" and searching
 * for the 101st found nothing — the account was real, logged in fine, and was
 * invisible to support.
 */
test.describe("Customers list at scale", () => {
  /** Ask the API directly how many customers there are. */
  async function totalCustomers(page: import("@playwright/test").Page): Promise<number> {
    return page.evaluate(async () => {
      const res = await fetch("/api/admin/customers?take=1", { credentials: "same-origin" });
      const body = await res.json();
      return body.meta.total as number;
    });
  }

  test("the count on screen is the real total, not the size of one page", async ({ page }) => {
    await page.goto("/admin/customers");
    await waitForApp(page);

    const total = await totalCustomers(page);
    const summary = page.getByText(/Showing \d+–\d+ of \d+/);
    await expect(summary).toBeVisible({ timeout: 15_000 });

    // The number after "of" must be the database total. The bug made it the
    // number of rows that happened to be fetched.
    await expect(summary).toContainText(`of ${total}`);
  });

  test("paging forward shows different customers", async ({ page }) => {
    await page.goto("/admin/customers");
    await waitForApp(page);
    const total = await totalCustomers(page);
    test.skip(total <= 50, "needs more than one page of customers");

    const firstEmail = async () =>
      (await page.locator("table tbody tr").first().innerText()).trim();

    const pageOne = await firstEmail();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible({ timeout: 15_000 });

    const pageTwo = await firstEmail();
    expect(pageTwo, "page 2 showed the same first row as page 1").not.toBe(pageOne);

    // And back again.
    await page.getByRole("button", { name: /^Previous/ }).click();
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible({ timeout: 15_000 });
  });

  test("search finds a customer who is not on the first page", async ({ page }) => {
    await page.goto("/admin/customers");
    await waitForApp(page);
    const total = await totalCustomers(page);
    test.skip(total <= 50, "needs more than one page of customers");

    // Take a customer from deep in the list — one the browser has never loaded.
    const deep = await page.evaluate(async (skip) => {
      const res = await fetch(`/api/admin/customers?take=1&skip=${skip}`, { credentials: "same-origin" });
      const body = await res.json();
      return body.data[0] as { email: string } | undefined;
    }, Math.max(50, Math.floor(total / 2)));

    expect(deep?.email, "could not read a deep customer to search for").toBeTruthy();

    await page.getByLabel("Search customers").fill(deep!.email);

    // The search runs in SQL, so this row arrives from the server.
    await expect(page.locator("table tbody")).toContainText(deep!.email, { timeout: 15_000 });
    await expect(page.getByText(/Showing 1–1 of 1 matching customer\b/)).toBeVisible();
  });
});

/**
 * The size-independent guard.
 *
 * The two tests above need more than one page of customers to say anything, and
 * they skip on a small database — which is most of the time. This one runs
 * always, because it asserts the thing that actually broke: that typing in the
 * search box asks the SERVER, rather than filtering rows already in the browser.
 * Client-side filtering is invisible until the list outgrows one page, and by
 * then it is a support problem, not a test failure.
 */
test("searching asks the server rather than filtering in the browser", async ({ page }) => {
  await page.goto("/admin/customers");
  await waitForApp(page);
  await expect(page.getByText(/Showing \d+–\d+ of \d+/)).toBeVisible({ timeout: 15_000 });

  const searches: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (url.includes("/api/admin/customers") && url.includes("q=")) searches.push(url);
  });

  await page.getByLabel("Search customers").fill("sharma");

  // Debounced at 350ms, so allow for the settle before asserting.
  await expect(() => expect(searches.length).toBeGreaterThan(0)).toPass({ timeout: 10_000 });

  expect(searches[searches.length - 1], "the search term never reached the server").toContain("q=sharma");

  // And it must page, not ask for everything at once.
  expect(searches[searches.length - 1], "the request did not carry a page size").toMatch(/take=\d+/);
});

/**
 * The database backup download.
 *
 * The deploy scripts no longer keep a copy on the server, so this button is the
 * only backup that exists. If it silently stops working, nobody finds out until
 * the day they need the file.
 */
test.describe("Database backup", () => {
  test("the button downloads a real, complete SQLite database", async ({ page }) => {
    await page.goto("/admin");
    await waitForApp(page);

    // The endpoint allows 6 downloads per admin per hour — a deliberate cap on
    // siphoning the whole customer database through a stolen session. Running
    // the suite repeatedly exhausts it, and a 429 is that cap working, not a
    // broken feature. So wait for either outcome rather than only the download:
    // probing the budget first is not an option, because any request that
    // reaches the handler spends one.
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
    const throttled = page
      .getByText(/Too many requests\. Please wait \d+s/)
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    await page.getByRole("button", { name: /Download backup/i }).click();
    const download = await Promise.race([
      downloadPromise,
      throttled.then((hit) => (hit ? null : downloadPromise)),
    ]);

    if (download === null) {
      test.skip(true, "hourly backup-download limit reached; the cap is doing its job");
      return;
    }

    expect(download.suggestedFilename(), "not named as a gzipped database").toMatch(
      /^websetu-\d{8}-\d{6}\.db\.gz$/,
    );

    const path = await download.path();
    const { gunzipSync } = await import("node:zlib");
    const { readFileSync } = await import("node:fs");
    const raw = gunzipSync(readFileSync(path!));

    // A real SQLite file starts with this exact string. A JSON error page or an
    // empty body would not, and neither would a truncated download.
    expect(raw.subarray(0, 15).toString("latin1"), "not a SQLite database").toBe("SQLite format 3");
    expect(raw.length, "database is implausibly small").toBeGreaterThan(50_000);

    // The snapshot must contain the tables that matter, not just a valid header.
    const text = raw.toString("latin1");
    for (const table of ["User", "Business", "Payment", "Lead"]) {
      expect(text, `the backup has no ${table} table`).toContain(`CREATE TABLE "${table}"`);
    }
  });

  test("a customer cannot download the database", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE.customer });
    const res = await ctx.request.get("/api/admin/backup");
    expect(res.status(), "a customer was allowed to download the whole database").toBe(403);
    await ctx.close();
  });

  test("a signed-out visitor cannot download the database", async ({ browser }) => {
    // `storageState: undefined` is load-bearing. browser.newContext() inherits
    // the context options from `use`, and this file sets
    // `test.use({ storageState: STATE.admin })` at the top — so a plain
    // newContext() here is an ADMIN context, and this test passed with a 200
    // while claiming to prove anonymous access was refused.
    const ctx = await browser.newContext({ storageState: undefined });
    const res = await ctx.request.get("/api/admin/backup");
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});
