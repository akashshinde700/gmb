import { test, expect } from "@playwright/test";
import { createTenant, openTab, waitForApp } from "./helpers";
import { STATE } from "./global-setup";

/**
 * How the app behaves when things go wrong: the server errors, the network
 * fails, the input is hostile. Nothing here may produce a blank screen, a
 * permanent spinner, or a stack trace shown to the customer.
 */

test.describe("Server and network failures", () => {
  test.use({ storageState: STATE.customer });

  test("a 500 from the API is reported, not swallowed into a blank page", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await page.route("**/api/content/services**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"boom"}' }),
    );

    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Services");

    const main = page.locator("main");
    await expect(main, "a failed load must not leave a blank panel").not.toHaveText(/^\s*$/);
    await expect(main, "and must not spin forever").not.toContainText(/^loading/i, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/stack|at Object\.|node_modules/i);
  });

  test("a dropped connection does not break the dashboard", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await page.goto("/dashboard");
    await waitForApp(page);

    await page.route("**/api/**", (route) => route.abort("failed"));
    await openTab(page, "Products");

    await expect(page.locator("main")).not.toHaveText(/^\s*$/);
    await expect(page.locator("body")).not.toContainText(/unhandled|cannot read propert/i);
  });

  test("a slow API shows a loading state rather than freezing", async ({ page }) => {
    await page.route("**/api/content/gallery**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });

    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Gallery");

    // The page must stay interactive while the request is in flight.
    await expect(page.getByRole("button", { name: /^overview\b/i }).first()).toBeEnabled();
    await expect(page.locator("main")).toContainText(/gallery|image|photo/i, { timeout: 20_000 });
  });

  test("an expired session sends the customer back to login instead of an error", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await page.goto("/dashboard");
    await waitForApp(page);

    // Corrupt the session cookie, which is where the session actually lives.
    // This used to write a "websetu_token" localStorage entry — the old home of
    // the token — so it corrupted nothing, the real session stayed valid, and
    // the test asserted the expired-session behaviour of a session that had not
    // expired.
    const url = new URL(page.url());
    await page.context().addCookies([
      {
        name: "websetu_session",
        value: "clearly.not.a.valid.token",
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    await page.reload();
    await waitForApp(page);

    await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/unhandled|500|stack/i);
  });
});

test.describe("Edge-case input", () => {
  test("very long, unicode and script-like input is stored safely", async ({ page }) => {
    await createTenant(page, "edge");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Services");

    const long = "अत्यंत लंबा नाम ".repeat(20);
    const tricky = `<script>alert('xss')</script> ${long}`;

    await page.getByRole("button", { name: /add service/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^service name/i).first().fill(tricky);
    await dialog.getByRole("button", { name: /^add$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The markup must be shown as text, never executed.
    let alerted = false;
    page.on("dialog", async (d) => {
      alerted = true;
      await d.dismiss();
    });
    await expect(page.locator("main")).toContainText(/alert\('xss'\)|अत्यंत/, { timeout: 15_000 });
    expect(alerted, "stored markup must never run").toBe(false);

    // And the layout must survive an absurdly long name.
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, "a long name must not stretch the page").toBeLessThanOrEqual(overflow.client + 1);
  });

  test("rapid double submit creates only one record", async ({ page }) => {
    await createTenant(page, "double");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Services");

    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/content/services")) posts++;
    });

    const name = `Double click ${Date.now()}`;
    await page.getByRole("button", { name: /add service/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^service name/i).first().fill(name);

    const save = dialog.getByRole("button", { name: /^add$/i });
    await save.click();
    await save.click({ force: true, timeout: 1500 }).catch(() => {
      /* the dialog is expected to close or the button to disable */
    });

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await page.reload();
    await waitForApp(page);
    await openTab(page, "Services");

    const rows = await page.locator("main").innerText();
    const occurrences = rows.split(name).length - 1;
    expect(occurrences, "a double click must not create two services").toBe(1);
    expect(posts, "and must not send two POSTs").toBeLessThanOrEqual(1);
  });

  test("an unknown hash route falls back to the marketing page", async ({ page }) => {
    await page.goto("/#/not-a-real-route");
    await waitForApp(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/unhandled|404 error|cannot read/i);
  });

  test("an unknown server route returns a real 404 page", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    const res = await page.goto("/definitely/not/a/page");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(/stack|node_modules/i);
  });
});
