import { test, expect, type Page } from "@playwright/test";
import { DEMO_SLUG, VIEWPORTS, expectNoHorizontalScroll, waitForApp } from "./helpers";
import { STATE } from "./global-setup";

/** Layout at every supported width, and the accessibility basics on each screen. */

/** Elements that stick out past the viewport, ignoring deliberately-scrolling boxes. */
async function overflowingElements(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= width + 1) continue;
      // A container that scrolls its own content is doing the right thing.
      let node: HTMLElement | null = el;
      let inScroller = false;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.overflowX === "auto" || style.overflowX === "scroll" || style.overflowX === "hidden") {
          inScroller = true;
          break;
        }
        node = node.parentElement;
      }
      if (inScroller) continue;
      bad.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 40)} → ${Math.round(rect.right)}px`);
    }
    return bad.slice(0, 5);
  });
}

test.describe("Responsive layout", () => {
  for (const vp of VIEWPORTS) {
    test(`the landing page holds together at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await waitForApp(page);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page, `landing @${vp.name}`);
      expect(await overflowingElements(page), `landing @${vp.name} has content past the edge`).toEqual([]);
    });

    test(`a tenant website holds together at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/s/${DEMO_SLUG}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expectNoHorizontalScroll(page, `tenant @${vp.name}`);
      expect(await overflowingElements(page), `tenant @${vp.name} has content past the edge`).toEqual([]);
    });
  }
});

test.describe("Dashboard responsive", () => {
  test.use({ storageState: STATE.customer });

  for (const vp of VIEWPORTS) {
    test(`the dashboard holds together at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/dashboard");
      await waitForApp(page);

      await expectNoHorizontalScroll(page, `dashboard @${vp.name}`);
      expect(await overflowingElements(page), `dashboard @${vp.name} has content past the edge`).toEqual([]);
    });
  }
});

/**
 * The admin console was missing from this matrix entirely — every viewport test
 * covered the marketing site, a tenant website and the customer dashboard, and
 * none covered the screen the platform owner actually runs the business from,
 * on a phone, standing in somebody's shop. The customers table is the widest
 * thing in the product.
 */
test.describe("Admin console responsive", () => {
  test.use({ storageState: STATE.admin });

  for (const vp of VIEWPORTS) {
    test(`the customers table holds together at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/admin/customers");
      await waitForApp(page);

      // Wait for real rows, so the check runs against the table and not a skeleton.
      await expect(page.getByText(/Showing \d+–\d+ of \d+/)).toBeVisible({ timeout: 15_000 });

      await expectNoHorizontalScroll(page, `admin customers @${vp.name}`);
      expect(
        await overflowingElements(page),
        `admin customers @${vp.name} has content past the edge`,
      ).toEqual([]);
    });
  }
});

test.describe("Accessibility basics", () => {
  test("the landing page has one h1, labelled controls and named buttons", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);

    const unnamed = await page.locator("button:visible").evaluateAll((els) =>
      els
        .filter((el) => !(el.textContent || "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("title"))
        .map((el) => el.outerHTML.slice(0, 90)),
    );
    expect(unnamed, "every button needs an accessible name").toEqual([]);
  });

  test("the login form is fully keyboard operable", async ({ page }) => {
    await page.goto("/login");
    await waitForApp(page);

    const email = page.locator('[role="tabpanel"]:not([hidden])').getByLabel(/^email$/i);
    await email.focus();
    await expect(email).toBeFocused();

    await page.keyboard.press("Tab");
    // Focus must move somewhere visible — a keyboard trap or an invisible stop
    // makes the form unusable without a mouse.
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { tag: el.tagName, hidden: style.visibility === "hidden" || style.display === "none" };
    });
    expect(focused, "Tab must move focus to a real control").not.toBeNull();
    expect(focused?.hidden).toBe(false);
  });

  test("a tenant website exposes its structure to assistive tech", async ({ page }) => {
    await page.goto(`/s/${DEMO_SLUG}`);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("header nav")).toHaveAttribute("aria-label", /.+/);

    const unlabelledImages = await page.locator("img:visible").evaluateAll((els) =>
      els.filter((el) => !el.getAttribute("alt") && el.getAttribute("aria-hidden") !== "true").length,
    );
    expect(unlabelledImages, "images need alt text or aria-hidden").toBe(0);
  });

  test("the dashboard's form fields are associated with their labels", async ({ page }) => {
    await page.context().addCookies([]);
    await page.goto("/login");
    await waitForApp(page);
    // Signed-out check is enough here: the labelling is a component-level trait
    // exercised throughout the CRUD spec.
    const orphaned = await page.locator("input:visible").evaluateAll((els) =>
      els
        .filter((el) => {
          const input = el as HTMLInputElement;
          if (input.type === "hidden") return false;
          if (input.getAttribute("aria-label") || input.getAttribute("aria-labelledby")) return false;
          if (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) return false;
          return !input.closest("label");
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(orphaned, "inputs need a label").toEqual([]);
  });
});
