import { test, expect } from "@playwright/test";
import { expectClean, expectNoHorizontalScroll, waitForApp, watchProblems } from "./helpers";
import { STATE } from "./global-setup";

/**
 * Every dashboard destination, clicked the way a customer clicks it.
 *
 * The bar is not "the click did something" — each item must open its own panel,
 * with no console errors and no failed API calls behind it.
 */

test.use({ storageState: STATE.customer });

const TABS = [
  { label: "Overview", expect: /overview|welcome|website health|quick actions/i },
  { label: "Website Builder", expect: /sections|theme|publish|save draft/i },
  { label: "Business Profile", expect: /business name|contact|address|phone/i },
  { label: "SEO", expect: /seo title|meta description|keywords|search appearance/i },
  { label: "Services", expect: /service/i },
  { label: "Products", expect: /product/i },
  { label: "Gallery", expect: /gallery|image|photo/i },
  { label: "Testimonials", expect: /testimonial|review/i },
  { label: "FAQs", expect: /question|faq/i },
  { label: "Blog", expect: /post|blog/i },
  { label: "Leads", expect: /lead|enquir/i },
  { label: "Analytics", expect: /visit|analytics|traffic/i },
  { label: "Subscription", expect: /plan|subscription|invoice|billing/i },
  { label: "Settings", expect: /settings|account|password|notification/i },
];

test.describe("Dashboard navigation", () => {
  test("every sidebar item opens its own panel", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/dashboard");
    await waitForApp(page);

    for (const tab of TABS) {
      // Built with a plain string: in a template literal "\b" is a backspace
      // escape, not a word boundary.
      const link = page.getByRole("button", { name: new RegExp("^" + tab.label + "\\b", "i") }).first();
      await expect(link, `"${tab.label}" is missing from the sidebar`).toBeVisible();
      await link.click();

      const main = page.locator("main");
      await expect(main, `"${tab.label}" did not open its panel`).toContainText(tab.expect, {
        timeout: 15_000,
      });
      // A tab that renders nothing at all is a dead link with extra steps.
      //
      // Polled rather than read once: toContainText above is satisfied by the
      // heading and the breadcrumb, both of which are present while the panel
      // is still fetching its rows. A single innerText() read there catches
      // "Dashboard / Services / Services / Add Service" — 39 characters of a
      // panel that is about to fill with content — and calls it empty.
      await expect
        .poll(async () => (await main.innerText()).trim().length, {
          message: `"${tab.label}" rendered an empty panel`,
          timeout: 15_000,
        })
        .toBeGreaterThan(40);
      await expect(main, `"${tab.label}" is stuck loading`).not.toContainText(/^loading\.\.\.$/i);
    }

    expectClean(problems, "dashboard tabs");
  });

  test("the dashboard survives back, forward and a direct deep link", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForApp(page);
    await page.getByRole("button", { name: /^services/i }).first().click();
    await expect(page.locator("main")).toContainText(/service/i);

    await page.goto("/");
    await waitForApp(page);
    await expect(page.locator("body")).toContainText(/bring your business online|pricing|features/i);

    await page.goBack();
    await waitForApp(page);
    await expect(page.locator("body"), "going back must return to the dashboard").not.toContainText(
      /bring your business online today/i,
    );

    await page.goForward();
    await waitForApp(page);
    await expect(page.locator("body")).toContainText(/bring your business online|pricing|features/i);

    // Deep link straight into the dashboard.
    await page.goto("/dashboard");
    await waitForApp(page);
    await expect(page.getByRole("button", { name: /^log in$/i })).toHaveCount(0);
  });

  test("the mobile sidebar opens, navigates and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await waitForApp(page);

    const menu = page.getByRole("button", { name: /open navigation|menu/i }).first();
    await expect(menu, "a phone needs a way into the navigation").toBeVisible();
    await menu.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The Leads item carries an unread badge, so its accessible name is
    // "Leads 3" rather than exactly "Leads".
    await dialog.getByRole("button", { name: /^leads/i }).first().click();

    await expect(dialog, "the drawer should close after navigating").toBeHidden({ timeout: 10_000 });
    await expect(page.locator("main")).toContainText(/lead|enquir/i);
    await expectNoHorizontalScroll(page, "dashboard @390");
  });

  test("the preview link opens the customer's own site, not the WebSetu landing page", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForApp(page);
    await page.getByRole("button", { name: /^overview$/i }).first().click();

    const view = page.getByRole("button", { name: /view website|view live site|preview/i }).first();
    if (!(await view.count())) test.skip(true, "no preview action on this account");

    // A PUBLISHED site opens its real public URL in a new tab, so the owner
    // keeps the dashboard they were working in. A draft still pushes this tab
    // to the owner-only preview. Handle both rather than assuming one.
    const popup = page.context().waitForEvent("page", { timeout: 4000 }).catch(() => null);
    await view.click();
    const opened = (await popup) ?? page;

    await expect(opened).toHaveURL(/\/(preview|s)\//, { timeout: 15_000 });
    await expect(opened.locator("body")).not.toContainText(/bring your business online today/i);
    if (opened !== page) await opened.close();
  });
});
