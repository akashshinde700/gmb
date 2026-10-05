import { expect, test } from "@playwright/test";
import { DEMO_SLUG, expectClean, waitForApp, watchProblems } from "./helpers";
import { STATE } from "./global-setup";

/**
 * The console's URLs.
 *
 * Every section used to live at "/" behind a hash, so nothing could be
 * bookmarked, refresh lost your place, and Back did not return to the previous
 * tab. These tests pin down the behaviour that replaced it — they are the ones
 * that fail if the routing ever regresses into component state.
 */


// Signed in as the demo customer through the session global setup saved once.
// These tests used to call login() individually, which meant seven trips
// through the real form in one file — past the eight-attempts-per-account limit
// the login route deliberately enforces, so the last tests in the file failed
// with a 429 that had nothing to do with routing.
test.use({ storageState: STATE.customer });

test.describe("console routing", () => {
  test("a dashboard tab has its own URL and survives a refresh", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/dashboard");

    // Sidebar items are buttons, matching how 03-dashboard-nav targets them.
    await page.getByRole("button", { name: /^leads/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/leads$/);

    // The point of the exercise: reloading lands on the same section rather
    // than bouncing back to the overview.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard\/leads$/);
    expectClean(problems, "dashboard leads after reload");
  });

  test("Back returns to the previous tab, Forward goes again", async ({ page }) => {
    await page.goto("/dashboard/leads");
    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/\/dashboard\/settings$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/leads$/);

    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });

  test("a deep link is bookmarkable and opens directly", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    await expect(page).toHaveURL(/\/dashboard\/analytics$/);
    await expect(page.locator("body")).not.toContainText(/redirecting/i);
  });

  test("signing in returns to the page that was asked for", async ({ page }) => {
    // Arriving signed-out at a deep link should not dump the visitor on the
    // overview after login. The describe-level session has to go for this one.
    await page.context().clearCookies();
    await page.goto("/dashboard/subscription");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fsubscription$/);
  });

  test("emailed hash links still work", async ({ page }) => {
    // /#/dashboard went out in lead alerts and subscription notices before the
    // console had real URLs. Those messages cannot be recalled.
    await page.goto("/#/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

    await page.goto("/#/login");
    // Already signed in, so /login sends them onward rather than showing a form.
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 20_000 });
  });

  test("an unknown tab is a 404, not a silent fallback to Overview", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    const res = await page.goto("/dashboard/not-a-tab");
    expect(res?.status()).toBe(404);
  });

  test("the owner preview has its own guarded URL", async ({ page }) => {
    await page.goto(`/preview/${DEMO_SLUG}`);
    await expect(page).toHaveURL(new RegExp(`/preview/${DEMO_SLUG}$`));
  });
});

/**
 * The link an owner sends to a customer.
 *
 * A customer published their site, clicked "View Website", copied the address
 * bar and shared it — and every recipient got a login screen, because that
 * button opened /preview/<slug>, which is the owner-only view. The public site
 * is /s/<slug>. This pins the difference down, because the failure is invisible
 * to the one person who cannot reproduce it: the owner, who is always signed in.
 */
test.describe("the owner's shareable link", () => {
  test("a published site's View Website points at the public URL, not the preview", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForApp(page);

    const link = page.getByRole("link", { name: /view website/i }).first();
    const href = await link.getAttribute("href");
    expect(href, "View Website must be a real link, not a preview push").toBeTruthy();
    expect(href!, `View Website pointed at ${href}`).toContain(`/s/${DEMO_SLUG}`);
    expect(href!, "the owner-only preview must never be what gets shared").not.toContain("/preview/");
  });

  test("that link opens for somebody who is not signed in", async ({ page, browser }) => {
    await page.goto("/dashboard");
    await waitForApp(page);
    const href = await page.getByRole("link", { name: /view website/i }).first().getAttribute("href");

    // A brand new context: no cookies, nobody signed in. This is the recipient.
    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(href!);
    await expect(visitorPage).not.toHaveURL(/\/login/);
    await expect(visitorPage.locator("body")).toContainText(/sharma/i);
    await visitor.close();
  });
});
