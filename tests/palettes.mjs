/**
 * Palette library checks: admin CRUD, plan-based allowances, per-customer
 * overrides, and the RBAC around all of it.
 *
 *   BASE_URL=http://127.0.0.1:3210 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/palettes.mjs
 *
 * Needs an existing ADMIN account and at least one plan. Start a fresh server:
 * the suite registers accounts and trips rate limiters.
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
  console.log(`Palette checks → ${BASE}\n`);
  const stamp = Date.now();

  const adminLogin = await call("POST", "/api/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = adminLogin.json?.data?.token;
  if (!admin) {
    console.error(`could not log in as ${ADMIN_EMAIL}: ${adminLogin.status} ${adminLogin.json?.error || ""}`);
    process.exit(2);
  }
  check("admin logs in", !!admin);

  /* ---------------------------------------------------------- library ---- */
  section("Palette library");

  const seeded = await call("GET", "/api/palettes");
  check("built-in palettes are seeded on first read", (seeded.json?.data?.palettes?.length ?? 0) > 0,
    `${seeded.json?.data?.palettes?.length} palettes`);
  check("every palette carries three colours",
    seeded.json?.data?.palettes?.every((p) => p.colors?.length === 3 && p.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))));

  const anonCreate = await call("POST", "/api/admin/palettes", { body: { name: "Anon", primary: "#111111", secondary: "#222222", accent: "#333333" } });
  check("anonymous cannot add a palette", anonCreate.status === 401, `got ${anonCreate.status}`);

  const badHex = await call("POST", "/api/admin/palettes", {
    token: admin, body: { name: `Bad ${stamp}`, primary: "red", secondary: "#222222", accent: "#333333" },
  });
  check("a non-hex colour is rejected", badHex.status === 400, `got ${badHex.status}`);

  const created = await call("POST", "/api/admin/palettes", {
    token: admin,
    body: {
      name: `Ocean Test ${stamp}`, mood: "Travel · Hotels",
      primary: "#0369a1", secondary: "#082f49", accent: "#f59e0b", scope: "BOTH",
    },
  });
  check("admin adds a palette", created.status === 201, `got ${created.status}: ${created.json?.error || ""}`);
  const paletteId = created.json?.data?.palette?.id;

  const dupe = await call("POST", "/api/admin/palettes", {
    token: admin, body: { name: `Ocean Test ${stamp}`, primary: "#0369a1", secondary: "#082f49", accent: "#f59e0b" },
  });
  check("duplicate palette names are refused", dupe.status === 409, `got ${dupe.status}`);

  const inPicker = await call("GET", "/api/palettes?scope=BUSINESS");
  check("the new palette reaches the customer picker",
    inPicker.json?.data?.palettes?.some((p) => p.id === paletteId));

  const edited = await call("PUT", `/api/admin/palettes/${paletteId}`, { token: admin, body: { mood: "Edited mood" } });
  check("admin edits a palette", edited.json?.data?.palette?.mood === "Edited mood");

  const retire = await call("PUT", `/api/admin/palettes/${paletteId}`, { token: admin, body: { active: false } });
  check("a palette can be retired", retire.json?.data?.palette?.active === false);
  const afterRetire = await call("GET", "/api/palettes?scope=BUSINESS");
  check("a retired palette disappears from the picker",
    !afterRetire.json?.data?.palettes?.some((p) => p.id === paletteId));
  await call("PUT", `/api/admin/palettes/${paletteId}`, { token: admin, body: { active: true } });

  /* ------------------------------------------------------ platform use --- */
  section("Platform palette");

  const applied = await call("PUT", "/api/settings/theme", { token: admin, body: { palette: `Ocean Test ${stamp}` } });
  check("admin applies a palette to the landing/login pages", applied.status === 200, `got ${applied.status}`);
  check("colours come from the stored palette, not the request",
    applied.json?.data?.theme?.primary === "#0369a1", applied.json?.data?.theme?.primary);

  const spoof = await call("PUT", "/api/settings/theme", {
    token: admin, body: { palette: `Ocean Test ${stamp}`, primary: "#ff0000" },
  });
  check("a palette name with mismatched colours is ignored",
    spoof.json?.data?.theme?.primary === "#0369a1", spoof.json?.data?.theme?.primary);

  const unknown = await call("PUT", "/api/settings/theme", { token: admin, body: { palette: "No Such Palette" } });
  check("an unknown palette name is refused", unknown.status === 400, `got ${unknown.status}`);

  // Editing the live palette must push the new colours to the live theme.
  await call("PUT", `/api/admin/palettes/${paletteId}`, { token: admin, body: { primary: "#1d4ed8" } });
  const afterEdit = await call("GET", "/api/settings/theme");
  check("editing the live palette updates the live theme",
    afterEdit.json?.data?.theme?.primary === "#1d4ed8", afterEdit.json?.data?.theme?.primary);

  /* ------------------------------------------------- plan + per customer -- */
  section("Plan allowance and per-customer overrides");

  const plans = await call("GET", "/api/admin/plans", { token: admin });
  const plan = plans.json?.data?.[0];
  check("a plan is available", !!plan);
  check("plans expose a palette allowance", typeof plan?.maxPalettes === "number", `${plan?.maxPalettes}`);

  const limited = await call("PUT", `/api/admin/plans/${plan.id}`, { token: admin, body: { maxPalettes: 3 } });
  check("admin limits a plan to 3 palettes", limited.json?.data?.maxPalettes === 3, `${limited.json?.data?.maxPalettes}`);

  // A customer on that plan
  const reg = await call("POST", "/api/auth/register", {
    body: { name: "Palette Customer", email: `pal-${stamp}@example.com`, password: "Passw0rd123" },
  });
  const customer = reg.json?.data?.token;
  check("customer registers", !!customer);

  const onboard = await call("POST", "/api/onboarding", {
    token: customer,
    body: { name: `Palette Co ${stamp}`, category: "Retail", phone: "+91 90000 55555", city: "Pune", address: "1 Road" },
  });
  check("customer onboards", onboard.status === 201, `got ${onboard.status}`);
  const businessId = onboard.json?.data?.business?.id;

  await call("POST", "/api/subscription", { token: customer, body: { planId: plan.id, cycle: "MONTHLY" } });

  const asCustomer = await call("GET", "/api/palettes?scope=BUSINESS", { token: customer });
  check("customer sees only their plan's allowance", asCustomer.json?.data?.palettes?.length === 3,
    `${asCustomer.json?.data?.palettes?.length}`);
  check("the response says how many exist in total", (asCustomer.json?.data?.total ?? 0) > 3);
  check("the allowance is attributed to the plan", asCustomer.json?.data?.source === "plan", asCustomer.json?.data?.source);

  const custPeek = await call("GET", `/api/admin/businesses/${businessId}/palettes`, { token: customer });
  check("a customer cannot open another account's palette settings", custPeek.status === 403, `got ${custPeek.status}`);

  const library = await call("GET", `/api/admin/businesses/${businessId}/palettes`, { token: admin });
  check("admin reads the customer's palette state", library.status === 200, `got ${library.status}`);
  check("admin sees the whole library to choose from", (library.json?.data?.library?.length ?? 0) > 3);

  const pick = library.json.data.library.slice(0, 5).map((p) => p.id);
  const override = await call("PUT", `/api/admin/businesses/${businessId}/palettes`, {
    token: admin, body: { paletteIds: pick },
  });
  check("admin pins 5 palettes for this customer", override.json?.data?.override?.length === 5,
    `${override.json?.data?.override?.length}`);

  const afterOverride = await call("GET", "/api/palettes?scope=BUSINESS", { token: customer });
  check("the override beats the plan limit", afterOverride.json?.data?.palettes?.length === 5,
    `${afterOverride.json?.data?.palettes?.length}`);
  check("the source is reported as an override", afterOverride.json?.data?.source === "override");

  const junk = await call("PUT", `/api/admin/businesses/${businessId}/palettes`, {
    token: admin, body: { paletteIds: ["not-a-real-id"] },
  });
  check("unknown palette ids are refused", junk.status === 400, `got ${junk.status}`);

  const cleared = await call("PUT", `/api/admin/businesses/${businessId}/palettes`, {
    token: admin, body: { paletteIds: [] },
  });
  check("clearing the override restores the plan allowance", cleared.json?.data?.source === "plan");
  const backToPlan = await call("GET", "/api/palettes?scope=BUSINESS", { token: customer });
  check("customer is back to 3 palettes", backToPlan.json?.data?.palettes?.length === 3,
    `${backToPlan.json?.data?.palettes?.length}`);

  // restore the plan so a rerun starts clean-ish
  await call("PUT", `/api/admin/plans/${plan.id}`, { token: admin, body: { maxPalettes: -1 } });
  const unlimited = await call("GET", "/api/palettes?scope=BUSINESS", { token: customer });
  check("-1 gives the customer the whole library",
    unlimited.json?.data?.palettes?.length === unlimited.json?.data?.total,
    `${unlimited.json?.data?.palettes?.length}/${unlimited.json?.data?.total}`);

  /* ------------------------------------------------------------ cleanup -- */
  const del = await call("DELETE", `/api/admin/palettes/${paletteId}`, { token: admin });
  check("a custom palette can be deleted", del.json?.data?.deleted === true);

  const builtIn = (await call("GET", "/api/admin/palettes", { token: admin })).json?.data?.palettes?.find((p) => p.builtIn);
  if (builtIn) {
    const retired = await call("DELETE", `/api/admin/palettes/${builtIn.id}`, { token: admin });
    check("a built-in palette is retired rather than deleted", retired.json?.data?.disabled === true);
    await call("PUT", `/api/admin/palettes/${builtIn.id}`, { token: admin, body: { active: true } });
  }

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
