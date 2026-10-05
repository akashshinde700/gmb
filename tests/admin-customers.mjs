/**
 * Admin customer lifecycle: provisioning, password reset, impersonation,
 * subscription operations and dedicated plans — plus the RBAC around them.
 *
 *   BASE_URL=http://127.0.0.1:3210 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/admin-customers.mjs
 *
 * Start a fresh server: the suite registers accounts and trips rate limiters.
 */

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3210").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "root@test.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Adminpass123";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n== ${title}`);
}

async function call(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log(`Admin customer lifecycle → ${BASE}\n`);
  const stamp = Date.now();

  const login = await call("POST", "/api/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.json?.data?.token;
  if (!admin) {
    console.error(`could not log in as ${ADMIN_EMAIL}: ${login.status} ${login.json?.error || ""}`);
    process.exit(2);
  }
  check("admin logs in", !!admin);

  /* ------------------------------------------------------ provisioning --- */
  section("Creating customers");

  const anon = await call("POST", "/api/admin/customers", { body: { name: "X", email: `x-${stamp}@example.com` } });
  check("anonymous cannot create a customer", anon.status === 401, `got ${anon.status}`);

  const badEmail = await call("POST", "/api/admin/customers", {
    token: admin, body: { name: "Bad Email", email: "not-an-email" },
  });
  check("an invalid email is rejected", badEmail.status === 400, `got ${badEmail.status}`);

  const loginOnly = await call("POST", "/api/admin/customers", {
    token: admin, body: { name: "Login Only", email: `login-${stamp}@example.com` },
  });
  check("a login-only account is created", loginOnly.status === 201, `got ${loginOnly.status}: ${loginOnly.json?.error || ""}`);
  check("a password is generated and returned once", (loginOnly.json?.data?.password?.length ?? 0) >= 8);
  check("no business is created when none was asked for", loginOnly.json?.data?.businessId === null);

  const generated = loginOnly.json?.data?.password;
  const canLogIn = await call("POST", "/api/auth/login", {
    body: { email: `login-${stamp}@example.com`, password: generated },
  });
  check("the customer can log in with the generated password", canLogIn.status === 200, `got ${canLogIn.status}`);

  const plans = await call("GET", "/api/admin/plans", { token: admin });
  const plan = plans.json?.data?.find((p) => !p.customForBusinessId);
  check("a standard plan exists to assign", !!plan);

  const full = await call("POST", "/api/admin/customers", {
    token: admin,
    body: {
      name: "Full Setup", email: `full-${stamp}@example.com`,
      businessName: `Provisioned Co ${stamp}`, category: "Electrician",
      phone: "+91 90000 33333", city: "Pune", planId: plan.id, trialDays: 14,
    },
  });
  check("a fully provisioned customer is created", full.status === 201, `got ${full.status}: ${full.json?.error || ""}`);
  const businessId = full.json?.data?.businessId;
  const customerId = full.json?.data?.id;
  check("the business is created with it", !!businessId);
  check("a site slug is assigned", !!full.json?.data?.slug);

  const dupe = await call("POST", "/api/admin/customers", {
    token: admin, body: { name: "Dupe", email: `full-${stamp}@example.com` },
  });
  check("a duplicate email is refused", dupe.status === 409, `got ${dupe.status}`);

  const noCategory = await call("POST", "/api/admin/customers", {
    token: admin, body: { name: "No Cat", email: `nocat-${stamp}@example.com`, businessName: "Something" },
  });
  check("a business without a category is refused", noCategory.status === 400, `got ${noCategory.status}`);

  // The provisioned tenant must be usable immediately.
  const asCustomer = await call("POST", "/api/auth/login", {
    body: { email: `full-${stamp}@example.com`, password: full.json.data.password },
  });
  const customerToken = asCustomer.json?.data?.token;
  check("the provisioned customer can log in", !!customerToken);
  const me = await call("GET", "/api/auth/me", { token: customerToken });
  check("their dashboard has a business", !!me.json?.data?.business);
  check("their website was generated", !!me.json?.data?.business?.website?.sections?.length);
  check("a trial subscription is running", me.json?.data?.business?.subscription?.status === "TRIALING");

  /* ------------------------------------------------- password + access --- */
  section("Password reset and impersonation");

  const custReset = await call("POST", `/api/admin/customers/${customerId}/password`, { token: customerToken });
  check("a customer cannot reset another account's password", custReset.status === 403, `got ${custReset.status}`);

  const reset = await call("POST", `/api/admin/customers/${customerId}/password`, { token: admin });
  check("admin issues a new password", reset.status === 200 && (reset.json?.data?.password?.length ?? 0) >= 8);

  const oldPassword = await call("POST", "/api/auth/login", {
    body: { email: `full-${stamp}@example.com`, password: full.json.data.password },
  });
  check("the previous password stops working", oldPassword.status === 401, `got ${oldPassword.status}`);
  const newPassword = await call("POST", "/api/auth/login", {
    body: { email: `full-${stamp}@example.com`, password: reset.json.data.password },
  });
  check("the new password works", newPassword.status === 200, `got ${newPassword.status}`);

  const impersonate = await call("POST", `/api/admin/customers/${customerId}/impersonate`, { token: admin });
  check("admin can open a customer session", impersonate.status === 200 && !!impersonate.json?.data?.token);

  const asImpersonated = await call("GET", "/api/auth/me", { token: impersonate.json.data.token });
  check("the issued token is that customer", asImpersonated.json?.data?.user?.id === customerId);
  check("the issued token carries no admin rights", asImpersonated.json?.data?.user?.role === "CUSTOMER");
  const adminProbe = await call("GET", "/api/admin/stats", { token: impersonate.json.data.token });
  check("the impersonation token is refused by admin endpoints", adminProbe.status === 403, `got ${adminProbe.status}`);

  const custImpersonate = await call("POST", `/api/admin/customers/${customerId}/impersonate`, { token: newPassword.json.data.token });
  check("a customer cannot impersonate anyone", custImpersonate.status === 403, `got ${custImpersonate.status}`);

  /* ------------------------------------------------------ subscription --- */
  section("Subscription operations");

  const custSub = await call("PATCH", `/api/admin/businesses/${businessId}/subscription`, {
    token: newPassword.json.data.token, body: { markPaid: true },
  });
  check("a customer cannot run subscription operations", custSub.status === 403, `got ${custSub.status}`);

  const before = await call("GET", "/api/admin/customers", { token: admin });
  const beforeRow = before.json?.data?.find((r) => r.id === customerId);
  const trialBefore = beforeRow?.subscription?.trialEndsAt;

  const extend = await call("PATCH", `/api/admin/businesses/${businessId}/subscription`, {
    token: admin, body: { extendTrialDays: 7 },
  });
  check("trial extension succeeds", extend.status === 200, `got ${extend.status}: ${extend.json?.error || ""}`);
  check("the trial end moves later",
    new Date(extend.json?.data?.subscription?.trialEndsAt) > new Date(trialBefore),
    `${trialBefore} -> ${extend.json?.data?.subscription?.trialEndsAt}`);

  const badExtend = await call("PATCH", `/api/admin/businesses/${businessId}/subscription`, {
    token: admin, body: { extendTrialDays: 5000 },
  });
  check("an absurd trial extension is refused", badExtend.status === 400, `got ${badExtend.status}`);

  const paid = await call("PATCH", `/api/admin/businesses/${businessId}/subscription`, {
    token: admin, body: { markPaid: true, method: "UPI", note: "Bank transfer" },
  });
  check("marking paid activates the subscription", paid.json?.data?.subscription?.status === "ACTIVE",
    paid.json?.data?.subscription?.status);
  check("marking paid charges the plan price", paid.json?.data?.subscription?.amount === plan.priceMonthly,
    `${paid.json?.data?.subscription?.amount} vs ${plan.priceMonthly}`);
  check("the trial is cleared once paid", paid.json?.data?.subscription?.trialEndsAt === null);

  const history = await call("GET", "/api/subscription", { token: newPassword.json.data.token });
  check("an offline payment lands in the customer's invoice history",
    history.json?.data?.payments?.some((p) => p.description?.includes("Bank transfer")));

  const badStatus = await call("PATCH", `/api/admin/businesses/${businessId}/subscription`, {
    token: admin, body: { status: "MADE_UP" },
  });
  check("an invalid subscription status is refused", badStatus.status === 400, `got ${badStatus.status}`);

  /* ----------------------------------------------------- dedicated plan -- */
  section("Dedicated plans");

  const custom = await call("POST", `/api/admin/businesses/${businessId}/custom-plan`, { token: admin });
  check("a dedicated plan is created", custom.status === 201, `got ${custom.status}: ${custom.json?.error || ""}`);
  const customPlan = custom.json?.data?.plan;
  check("it is named after the customer", (customPlan?.name || "").startsWith("Custom —"), customPlan?.name);
  check("it copies the current plan's limits", customPlan?.maxPages === plan.maxPages);

  const again = await call("POST", `/api/admin/businesses/${businessId}/custom-plan`, { token: admin });
  check("asking twice does not create a second one", again.json?.data?.created === false);

  const publicPlans = await call("GET", "/api/plans");
  check("dedicated plans stay out of public pricing",
    !publicPlans.json?.data?.plans?.some((p) => p.id === customPlan.id));

  const adminPlans = await call("GET", "/api/admin/plans", { token: admin });
  check("admins still see it in the plan library",
    adminPlans.json?.data?.some((p) => p.id === customPlan.id && p.customForBusinessId === businessId));

  const tune = await call("PUT", `/api/admin/plans/${customPlan.id}`, {
    token: admin, body: { maxPages: 99, maxPalettes: 2 },
  });
  check("its limits can be tuned for that customer", tune.json?.data?.maxPages === 99);

  const paletteView = await call("GET", "/api/palettes?scope=BUSINESS", { token: newPassword.json.data.token });
  check("the customer's palette allowance follows the dedicated plan",
    paletteView.json?.data?.palettes?.length === 2, `${paletteView.json?.data?.palettes?.length}`);

  // A dedicated plan must not be assignable to a different customer.
  const other = await call("POST", "/api/admin/customers", {
    token: admin,
    body: {
      name: "Other Co", email: `other-${stamp}@example.com`,
      businessName: `Other Co ${stamp}`, category: "Retail", planId: plan.id,
    },
  });
  const otherBusiness = other.json?.data?.businessId;
  const steal = await call("PATCH", `/api/admin/businesses/${otherBusiness}/subscription`, {
    token: admin, body: { planId: customPlan.id },
  });
  check("another customer cannot be put on that dedicated plan", steal.status === 400, `got ${steal.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("\nsuite crashed:", e);
  process.exit(2);
});
