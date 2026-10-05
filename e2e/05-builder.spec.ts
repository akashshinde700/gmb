import { test, expect } from "@playwright/test";
import { createTenant, expectClean, openTab, waitForApp, watchProblems } from "./helpers";

/**
 * The website builder: editing a section, the design-change allowance, and
 * publishing. These are the flows a customer uses most, and the ones that have
 * silently lost work before.
 */

test.describe("Website builder", () => {
  test("a section edit saves and survives a reload", async ({ page }) => {
    const problems = watchProblems(page);
    await createTenant(page, "builder");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Website Builder");

    // Open the hero section editor.
    await page.getByRole("button", { name: /edit hero|hero/i }).first().click();

    const heading = page.getByLabel(/^heading/i).first();
    await expect(heading).toBeVisible();
    const value = `Fresh headline ${Date.now()}`;
    await heading.fill(value);

    // Regression: the background image field used to be dropped on save.
    // A real asset from this app — an unreachable URL would fail the network check.
    const imageUrl = "/images/hero-business.jpg";
    const image = page.getByPlaceholder(/paste image URL/i).first();
    const hasImageField = (await image.count()) > 0;
    if (hasImageField) await image.fill(imageUrl);

    await page.getByRole("button", { name: /save section|^save$/i }).first().click();
    await expect(page.getByText(/section saved|saved/i).first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await waitForApp(page);
    await openTab(page, "Website Builder");
    await page.getByRole("button", { name: /edit hero|hero/i }).first().click();

    await expect(page.getByLabel(/^heading/i).first()).toHaveValue(value);
    if (hasImageField) {
      await expect(
        page.getByPlaceholder(/paste image URL/i).first(),
        "the hero background image must be saved with the section",
      ).toHaveValue(imageUrl);
    }
    expectClean(problems, "builder section edit");
  });

  test("the design allowance is shown and stops at five changes", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await createTenant(page, "design");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Website Builder");

    const theme = page.getByRole("button", { name: /theme.*branding/i }).first();
    await expect(theme).toBeVisible();
    await theme.click();

    // A trial account gets five changes, and the panel says so.
    await expect(page.getByText(/of 5 (free )?design changes left|5 of 5 left/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const palettes = page.getByRole("button", { name: /apply .* palette/i });
    const available = await palettes.count();
    test.skip(available < 2, "needs at least two palettes to spend the allowance");

    // Spend the allowance. Once it runs out the controls lock, so stop as soon
    // as the app says so rather than clicking into a disabled button.
    const exhausted = page.getByText(/used all 5 free design changes|no changes left/i).first();
    for (let i = 0; i < 8; i++) {
      if (await exhausted.isVisible().catch(() => false)) break;
      const target = palettes.nth(i % available);
      if (!(await target.isEnabled())) break;
      await target.click();
      // The colour save is debounced; give it time to reach the server.
      await expect
        .poll(async () => (await exhausted.isVisible().catch(() => false)) || (await target.isEnabled()), {
          timeout: 5_000,
        })
        .toBeTruthy();
      await page.waitForTimeout(1_100);
    }

    await expect(exhausted, "the customer must be told when the allowance runs out").toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: /upgrade your plan/i }).first(),
      "and offered a way to lift the limit",
    ).toBeVisible();
  });

  test("an incomplete site is refused with a message that says what is missing", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await createTenant(page, "incomplete");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Website Builder");

    await page.getByRole("button", { name: /^publish$/i }).first().click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.count()) await confirm.getByRole("button", { name: /publish now/i }).click();

    // The tenant helper leaves the address blank, so publishing must be refused
    // — and the refusal has to name the missing field, not just fail.
    await expect(page.getByText(/address/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("a complete site publishes and the live page serves its content", async ({ page }) => {
    const problems = watchProblems(page);
    await createTenant(page, "publish");
    await page.goto("/dashboard");
    await waitForApp(page);

    // Fill in what publishing requires.
    await openTab(page, "Business Profile");
    await page.getByLabel(/^address/i).first().fill("12 MG Road");
    await page.getByLabel(/^city/i).first().fill("Pune");
    await page.getByRole("button", { name: /save|update/i }).first().click();
    await expect(page.getByText(/saved|updated/i).first()).toBeVisible({ timeout: 15_000 });

    await openTab(page, "Website Builder");
    await page.getByRole("button", { name: /^publish$/i }).first().click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.count()) await confirm.getByRole("button", { name: /publish now/i }).click();

    await expect(page.getByText(/published|live/i).first()).toBeVisible({ timeout: 25_000 });
    expectClean(problems, "publishing");
  });

  test("the builder preview does not nest a second main landmark", async ({ page }) => {
    await createTenant(page, "landmark");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Website Builder");

    await expect(page.locator("main")).toHaveCount(1);
  });
});
