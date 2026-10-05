import { test, expect } from "@playwright/test";
import {
  DEMO, activePanel, clearSession, createCustomer, expectClean, login, waitForApp, watchProblems,
} from "./helpers";
import { STATE } from "./global-setup";

/** Authentication, session handling and role-based access. */

test.describe("Login form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await waitForApp(page);
  });

  test("renders both tabs with labelled fields", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /login/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /register/i })).toBeVisible();
    await expect(activePanel(page).getByLabel(/^email$/i)).toBeVisible();
    await expect(activePanel(page).getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible();
  });

  test("does not advertise demo credentials", async ({ page }) => {
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("demo@websetu.in");
    expect(body).not.toContain("demo1234");
    expect(body).not.toContain("admin1234");
  });

  test("password can be revealed and hidden again", async ({ page }) => {
    const password = activePanel(page).getByLabel(/^password$/i);
    await password.fill("secret-value");
    await expect(password).toHaveAttribute("type", "password");

    const toggle = page.getByRole("button", { name: /show password|reveal/i });
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("empty submission is refused without calling the API", async ({ page }) => {
    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/auth/login")) calls++;
    });
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible();
    expect(calls, "an empty form must not reach the server").toBe(0);
  });

  test("a malformed email is rejected", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await activePanel(page).getByLabel(/^email$/i).fill("not-an-email");
    await activePanel(page).getByLabel(/^password$/i).fill("whatever123");
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page.getByText(/valid email|could not log in|invalid/i).first()).toBeVisible();
  });

  test("wrong credentials show a message and keep the user on the form", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await activePanel(page).getByLabel(/^email$/i).fill(DEMO.email);
    await activePanel(page).getByLabel(/^password$/i).fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: /^log in$/i }).click();

    await expect(page.getByText(/could not log in/i)).toBeVisible();
    // The message must not reveal which half was wrong.
    const alert = await page.getByText(/could not log in/i).locator("..").innerText();
    expect(alert.toLowerCase()).not.toContain("no account");
    expect(alert.toLowerCase()).not.toContain("user not found");
    await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible();
  });

  test("registration validates a short password", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await page.getByRole("tab", { name: /register/i }).click();
    await activePanel(page).getByLabel(/full name/i).fill("Shorty");
    await activePanel(page).getByLabel(/^email$/i).fill(`pw-short-${Date.now()}@example.com`);
    await activePanel(page).getByLabel(/^password$/i).fill("abc");
    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText(/8 characters|too short|at least/i).first()).toBeVisible();
  });

  test("registering an existing email is refused", async ({ page }) => {
    (page as unknown as { __expectErrors: boolean }).__expectErrors = true;
    await page.getByRole("tab", { name: /register/i }).click();
    await activePanel(page).getByLabel(/full name/i).fill("Duplicate");
    await activePanel(page).getByLabel(/^email$/i).fill(DEMO.email);
    await activePanel(page).getByLabel(/^password$/i).fill("ProperPassword123");
    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText(/already|exists|registered/i).first()).toBeVisible();
  });
});

test.describe("Sessions and access control", () => {
  test("a customer logs in, reaches the dashboard and survives a refresh", async ({ page }) => {
    const problems = watchProblems(page);
    const customer = await createCustomer(page, "refresh");
    await login(page, customer);

    // A signed-in customer is routed away from the form, not merely shown a
    // page that happens to say "welcome".
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
    await expect(page.getByRole("button", { name: /^log in$/i })).toHaveCount(0);

    await page.reload();
    await waitForApp(page);
    await expect(page, "the session must survive a refresh").toHaveURL(/\/(dashboard|onboarding)/);
    await expect(page.getByRole("button", { name: /^log in$/i })).toHaveCount(0);
    expectClean(problems, "customer dashboard");
  });

  test("logging out clears the session and protected routes fall back to login", async ({ page }) => {
    const customer = await createCustomer(page, "logout");
    await login(page, customer);

    // A brand new account lands in the onboarding wizard, which must also offer
    // a way out — not only the finished dashboard.
    await page.getByRole("button", { name: /log ?out|sign out/i }).first().click();

    // first(): the landing page offers "Log in" in both the main navigation and
    // the account links in the footer.
    await expect(page.getByRole("button", { name: /^log in$/i }).first()).toBeVisible({ timeout: 15_000 });

    // The session is an httpOnly cookie, so this is where logging out has to
    // land. The old version of this check read localStorage — the token's home
    // before that move — and so passed no matter what logout did.
    const cookies = await page.context().cookies();
    const session = cookies.filter((c) => c.name === "websetu_session" && c.value);
    expect(session, "logout must clear the session cookie").toEqual([]);
  });

  test("an anonymous visitor asking for the dashboard gets the login form", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForApp(page);
    await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible();
  });

  test("rapid double submit does not create two sessions", async ({ page }) => {
    const customer = await createCustomer(page, "double");
    // Registering signs the new account in — the response's Set-Cookie lands in
    // this page's jar — and /login sends a signed-in visitor to their dashboard
    // rather than showing a form. The login helper clears cookies for the same
    // reason; this test drives the form itself, so it has to do it here.
    await page.context().clearCookies();
    await page.goto("/login");
    await waitForApp(page);
    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/auth/login") && r.method() === "POST") calls++;
    });
    // Not scoped to the tab panel: the login page is server-rendered now, so its
    // fields arrive before Radix has wired up the panel wrapper, and waiting on
    // the wrapper times out on markup that is already usable.
    const email = page.getByLabel(/^email$/i).first();
    await email.waitFor({ state: "visible", timeout: 20_000 });
    await email.fill(customer.email);
    await page.getByLabel(/^password$/i).first().fill(customer.password);
    const button = page.getByRole("button", { name: /^log in$/i });
    await button.click();
    await button.click({ force: true, timeout: 2000 }).catch(() => {
      /* the button is expected to disappear or disable */
    });
    await expect(page.getByRole("button", { name: /^log in$/i })).toHaveCount(0, { timeout: 20_000 });
    expect(calls, "the login button must be guarded against double submission").toBeLessThanOrEqual(1);
    await clearSession(page);
  });
});

/** Signed in as a customer via the session saved in global setup. */
test.describe("Customer session", () => {
  test.use({ storageState: STATE.customer });

  test("a customer cannot open the admin console", async ({ page }) => {
    await page.goto("/admin");
    await waitForApp(page);
    // The guard sends a signed-in non-admin to their own dashboard rather than
    // to a 403 or a login form: they are logged in, just not as an admin. What
    // matters is that they never reach the admin console.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).not.toContainText(/platform revenue|all customers/i);
  });

  test("a customer's token is refused by the admin API", async ({ page, request }) => {
    await page.goto("/dashboard");
    await waitForApp(page);
    const cookies = await page.context().cookies();
    const token = cookies.find((c) => c.name === "websetu_session")?.value ?? "";
    expect(token, "the customer session token should be readable for this check").not.toBe("");

    const res = await request.get("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
    expect([401, 403], `admin API answered ${res.status()} to a customer token`).toContain(res.status());
  });
});

/** Signed in as the platform admin. */
test.describe("Admin session", () => {
  test.use({ storageState: STATE.admin });

  test("the admin console loads for an admin session", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/admin");
    await waitForApp(page);
    await expect(page.getByRole("button", { name: /^log in$/i })).toHaveCount(0);
    await expect(page.locator("body")).toContainText(/customers|plans|overview/i);
    expectClean(problems, "admin console");
  });
});
