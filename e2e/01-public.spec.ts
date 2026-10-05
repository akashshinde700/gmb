import { test, expect } from "@playwright/test";
import {
  DEMO_SLUG, expectClean, expectNoHorizontalScroll, waitForApp, watchProblems,
} from "./helpers";

/**
 * Everything a visitor can reach without an account: the marketing site, the
 * platform blog, a published tenant website and the SEO surfaces.
 */

test.describe("Public routes", () => {
  test("landing page renders and is clean", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/");
    await waitForApp(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
    expectClean(problems, "landing page");
  });

  test("landing page has no dead in-page links", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    const hrefs = await page.locator("a[href^='#']").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") || ""),
    );
    const targets = hrefs.filter((h) => h.length > 1 && !h.startsWith("#"));
    for (const href of targets) {
      const id = href.slice(1);
      const found = await page.evaluate((anchorId) => !!document.getElementById(anchorId), id);
      expect(found, `anchor ${href} points at nothing on the page`).toBe(true);
    }
  });

  test("the platform blog index loads", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/blog");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expectClean(problems, "/blog");
  });

  test("a published tenant site renders server-side", async ({ page }) => {
    const problems = watchProblems(page);
    const res = await page.goto(`/s/${DEMO_SLUG}`);
    expect(res?.status(), "published site must answer 200").toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("header")).toBeVisible();

    // Structured data is the whole point of the SEO work — assert it survives.
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.length, "tenant site must ship JSON-LD").toBeGreaterThan(0);
    expect(ld.join(" ")).toContain("LocalBusiness");

    expectClean(problems, `/s/${DEMO_SLUG}`);
  });

  test("an unknown tenant slug 404s instead of erroring", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    const res = await page.goto("/s/definitely-not-a-real-business-xyz");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  });

  test("sitemap and robots are served", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("<urlset");
    expect(xml, "the published demo site should be listed").toContain(DEMO_SLUG);

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect((await robots.text()).toLowerCase()).toContain("sitemap");
  });

  test("security headers are present on the app shell", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"] || headers["content-security-policy"]).toBeTruthy();
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["x-powered-by"], "the framework version must not be advertised").toBeFalsy();
  });
});

test.describe("Tenant site navigation", () => {
  /**
   * Regression: the site header's section links used to be plain #hash anchors.
   * Clicking one used to replace the route and threw the visitor onto the
   * route and threw the visitor onto the WebSetu landing page.
   */
  test("section links scroll within the site and keep the route", async ({ page }) => {
    await page.goto(`/s/${DEMO_SLUG}`);
    await waitForApp(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const nav = page.locator("header nav a[href^='#']");
    const count = await nav.count();
    expect(count, "the tenant header should offer section links").toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const link = nav.nth(i);
      const label = (await link.textContent())?.trim() || `link ${i}`;
      const href = (await link.getAttribute("href")) || "";
      await link.click();

      // The route must survive the click.
      await expect(page, `clicking "${label}" left the tenant route`).toHaveURL(
        new RegExp(`/s/${DEMO_SLUG}$`),
      );
      // And we must still be on the tenant site, not the WebSetu landing page.
      await expect(page.locator("body"), `clicking "${label}" showed the WebSetu landing page`)
        .not.toContainText("Start your free trial");

      if (href.length > 1 && href !== "#top") {
        const target = page.locator(href);
        if (await target.count()) await expect(target.first()).toBeInViewport({ timeout: 5000 });
      }
    }
  });

  test("the tenant site does not scroll sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/s/${DEMO_SLUG}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page, "tenant site @375");
  });
});
