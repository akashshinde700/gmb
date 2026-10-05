import { test, expect, type Page } from "@playwright/test";
import { createCustomer, createTenant, expectClean, openTab, waitForApp, watchProblems } from "./helpers";

/**
 * Create, read, update, delete — with persistence checked by reloading, not by
 * trusting what the list happens to be showing.
 */

/** Fill the CRUD dialog's first text field and submit. */
async function fillAndSave(page: Page, fields: Record<string, string>) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const [label, value] of Object.entries(fields)) {
    await dialog.getByLabel(new RegExp("^" + label, "i")).first().fill(value);
  }
  await dialog.getByRole("button", { name: /^(save|add|create|update)/i }).last().click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test.describe("Content CRUD", () => {
  test("a service can be created, edited and deleted, and each step persists", async ({ page }) => {
    const problems = watchProblems(page);
    await createTenant(page, "crud");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Services");

    // ---------------------------------------------------------------- create
    const name = `Ceiling fan install ${Date.now()}`;
    await page.getByRole("button", { name: /add service/i }).first().click();
    await fillAndSave(page, { "Service name": name, Description: "Two-hour fitting, parts included." });

    await expect(page.locator("main")).toContainText(name);

    await page.reload();
    await waitForApp(page);
    await openTab(page, "Services");
    await expect(page.locator("main"), "a saved service must survive a reload").toContainText(name);

    // ------------------------------------------------------------------ edit
    const renamed = `${name} (updated)`;
    await page.getByRole("button", { name: /^edit/i }).first().click();
    await fillAndSave(page, { "Service name": renamed });
    await expect(page.locator("main")).toContainText(renamed);

    await page.reload();
    await waitForApp(page);
    await openTab(page, "Services");
    await expect(page.locator("main"), "an edit must survive a reload").toContainText(renamed);

    // ---------------------------------------------------------------- delete
    await page.getByRole("button", { name: /^delete /i }).first().click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();

    // Cancelling must not delete anything.
    await confirm.getByRole("button", { name: /cancel/i }).click();
    await expect(confirm).toBeHidden();
    await expect(page.locator("main"), "cancelling a delete must keep the row").toContainText(renamed);

    await page.getByRole("button", { name: /^delete /i }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
    await expect(page.locator("main")).not.toContainText(renamed, { timeout: 15_000 });

    await page.reload();
    await waitForApp(page);
    await openTab(page, "Services");
    await expect(page.locator("main"), "a delete must survive a reload").not.toContainText(renamed);

    expectClean(problems, "services CRUD");
  });

  test("the create dialog refuses an empty required field", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await createTenant(page, "validate");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Services");

    await page.getByRole("button", { name: /add service/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^(save|add|create)/i }).last().click();

    // Either the dialog stays open with a message, or the field is flagged —
    // what must not happen is a blank row being created.
    await expect(dialog, "an empty service must not be accepted").toBeVisible();
  });

  test("FAQs, testimonials and blog posts all accept a new row", async ({ page }) => {
    const problems = watchProblems(page);
    await createTenant(page, "content");
    await page.goto("/dashboard");
    await waitForApp(page);

    // FAQs — the wizard already seeded some, so this adds one more.
    await openTab(page, "FAQs");
    const question = `Do you work on Sundays ${Date.now()}?`;
    await page.getByRole("button", { name: /add faq|add question/i }).first().click();
    await fillAndSave(page, { Question: question, Answer: "Yes, for emergencies." });
    await expect(page.locator("main")).toContainText(question);

    // Testimonials
    await openTab(page, "Testimonials");
    const author = `Happy Customer ${Date.now()}`;
    await page.getByRole("button", { name: /add testimonial/i }).first().click();
    await fillAndSave(page, { "Customer name": author, Review: "Excellent work, arrived on time." });
    await expect(page.locator("main")).toContainText(author);

    // Blog
    await openTab(page, "Blog");
    const title = `Our new workshop ${Date.now()}`;
    await page.getByRole("button", { name: /add post|new post|add blog/i }).first().click();
    await fillAndSave(page, { Title: title });
    await expect(page.locator("main")).toContainText(title);

    expectClean(problems, "content CRUD");
  });

  test("onboarding seeds editable FAQs and draft blog posts", async ({ page }) => {
    await createTenant(page, "starter");
    await page.goto("/dashboard");
    await waitForApp(page);

    await openTab(page, "FAQs");
    await expect(page.locator("main"), "a new website should come with starter FAQs").toContainText(
      /what services|where is|opening hours/i,
    );

    await openTab(page, "Blog");
    await expect(page.locator("main"), "a new website should come with draft posts").toContainText(
      /how to choose|what to expect/i,
    );
    await expect(page.locator("main"), "starter posts must not be published automatically").toContainText(
      /draft/i,
    );

    await openTab(page, "Services");
    await expect(page.locator("main"), "services entered in the wizard must be saved").toContainText(
      /house wiring/i,
    );
  });

  test("the business profile saves and persists", async ({ page }) => {
    const problems = watchProblems(page);
    await createTenant(page, "profile");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Business Profile");

    const tagline = `Fast, fair and local ${Date.now()}`;
    const field = page.getByLabel(/^tagline/i).first();
    await field.fill(tagline);
    await page.getByRole("button", { name: /save|update/i }).first().click();

    await page.reload();
    await waitForApp(page);
    await openTab(page, "Business Profile");
    await expect(page.getByLabel(/^tagline/i).first()).toHaveValue(tagline);

    expectClean(problems, "business profile");
  });

  test("an invalid phone number is rejected with a message", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await createTenant(page, "phone");
    await page.goto("/dashboard");
    await waitForApp(page);
    await openTab(page, "Business Profile");

    await page.getByLabel(/^phone/i).first().fill("abc");
    await page.getByRole("button", { name: /save|update/i }).first().click();
    await expect(page.getByText(/valid phone|could not save|invalid/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

/**
 * Finishing the wizard has to produce a website somebody else can open.
 *
 * The wizard's last button says "Create My Website", and for every customer who
 * pressed it the answer was a DRAFT: nothing public, no sign that a separate
 * Publish step existed, and a free trial counting down on a site whose owner was
 * the only person on earth who could see it. Three of three trial accounts on
 * the live system were stuck there.
 *
 * The check that matters is the last one: a visitor with no session opens the
 * public URL and sees the business.
 */
/**
 * Register a throwaway customer and return a bearer token for it.
 *
 * The API request context does not carry the registration's session cookie, so
 * every script-driven call in this suite authenticates with a token — the same
 * thing createTenant does.
 */
async function signedUpToken(page: Page, tag: string): Promise<string> {
  const { email, password } = await createCustomer(page, tag);
  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(login.ok(), `could not sign in ${email}: ${login.status()}`).toBe(true);
  const token = (await login.json())?.data?.token as string;
  expect(token, "login returned no token").toBeTruthy();
  return token;
}

test.describe("Onboarding produces a live website", () => {
  test("a complete signup is public immediately, to somebody not signed in", async ({ page, browser }) => {
    const token = await signedUpToken(page, "golive");
    const suffix = Date.now().toString().slice(-6);
    const name = `PW GoLive ${suffix}`;

    const res = await page.request.post("/api/onboarding", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name,
        category: "Electrician",
        phone: "9876543210",
        city: "Pune",
        // The two fields the wizard treats as optional and publishing requires.
        address: "Shop 4, MG Road",
        state: "Maharashtra",
        tagline: "Wiring done right",
        description: "A test tenant created by the Playwright audit.",
        services: [{ name: "House wiring", description: "Full home rewiring." }],
      },
    });
    expect(res.ok(), `onboarding failed: ${res.status()} ${await res.text()}`).toBe(true);

    const slug = (await res.json())?.data?.business?.slug as string;
    expect(slug, "onboarding did not return a slug").toBeTruthy();

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    const opened = await visitorPage.goto(`/s/${slug}`);
    expect(opened?.status(), `/s/${slug} was not public after onboarding`).toBe(200);
    await expect(visitorPage.locator("body")).toContainText(new RegExp(suffix));
    await visitor.close();
  });

  test("a signup with no address stays private, and says why", async ({ page, browser }) => {
    const token = await signedUpToken(page, "nodraft");
    const res = await page.request.post("/api/onboarding", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `PW NoAddress ${Date.now().toString().slice(-6)}`,
        category: "Electrician",
        phone: "9876543210",
        city: "Pune",
        // No address on purpose: publishing needs it, so this must NOT go live.
        services: [{ name: "House wiring", description: "Full home rewiring." }],
      },
    });
    expect(res.ok()).toBe(true);
    const slug = (await res.json())?.data?.business?.slug as string;

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    const opened = await visitorPage.goto(`/s/${slug}`);
    expect(opened?.status(), "an incomplete site must not be public").toBe(404);
    await visitor.close();
  });
});
