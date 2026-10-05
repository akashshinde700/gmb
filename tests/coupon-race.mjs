/**
 * Concurrency check for coupon redemption and the platform palette API.
 *
 * The old subscription route read a coupon's usedCount, compared it to maxUses,
 * and then incremented it in a separate statement — so N simultaneous checkouts
 * could all pass the check and over-redeem a coupon. This fires several
 * checkouts at the same instant against a coupon with a known cap.
 *
 *   BASE_URL=http://127.0.0.1:3210 COUPON=TEST10 CAP=2 node tests/coupon-race.mjs
 */

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3210").replace(/\/$/, "");
const COUPON = process.env.COUPON || "TEST10";
const CAP = Number(process.env.CAP || 2);
const TENANTS = Number(process.env.TENANTS || 5);

let failed = 0;
function check(name, condition, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failed++;
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

async function makeTenant(i, stamp) {
  const reg = await call("POST", "/api/auth/register", {
    body: { name: `Racer ${i}`, email: `race-${stamp}-${i}@example.com`, password: "Passw0rd123" },
  });
  const token = reg.json?.data?.token;
  if (!token) throw new Error(`registration failed for tenant ${i}: ${reg.status} ${reg.json?.error || ""}`);
  const onboard = await call("POST", "/api/onboarding", {
    token,
    body: {
      name: `Racer Co ${stamp}-${i}`, category: "Retail", phone: "+91 90000 0000" + i,
      city: "Pune", address: "1 Test Road",
    },
  });
  if (onboard.status !== 201) throw new Error(`onboarding failed for tenant ${i}: ${onboard.status}`);
  return token;
}

async function main() {
  console.log(`Coupon race check → ${BASE} (coupon ${COUPON}, cap ${CAP}, ${TENANTS} concurrent)\n`);
  const stamp = Date.now();

  const tokens = [];
  for (let i = 0; i < TENANTS; i++) tokens.push(await makeTenant(i, stamp));

  const plans = await call("GET", "/api/plans");
  const plan = plans.json?.data?.plans?.[0];
  check("a plan is available to buy", !!plan);
  if (!plan) process.exit(1);

  // All checkouts leave at the same moment.
  const results = await Promise.all(
    tokens.map((token) =>
      call("POST", "/api/subscription", { token, body: { planId: plan.id, cycle: "MONTHLY", couponCode: COUPON } }),
    ),
  );

  const discounted = results.filter((r) => r.status === 201 && r.json?.data?.payment?.couponCode === COUPON);
  const rejected = results.filter((r) => r.status !== 201);

  console.log(`\n  ${discounted.length} checkouts used the coupon, ${rejected.length} were rejected`);
  for (const r of rejected) console.log(`    rejected: ${r.status} ${r.json?.error || ""}`);

  check(`the coupon is redeemed at most ${CAP} times`, discounted.length <= CAP, `${discounted.length} redemptions`);
  check("every attempt got a definite answer (no 500s)", results.every((r) => r.status === 201 || r.status === 400 || r.status === 429),
    results.map((r) => r.status).join(","));
  check("rejections explain the limit",
    rejected.every((r) => /coupon|Too many/i.test(r.json?.error || "")),
    rejected.map((r) => r.json?.error).join(" | "));

  // Every successful checkout must still have produced a subscription+payment.
  for (const [i, r] of results.entries()) {
    if (r.status !== 201) continue;
    const history = await call("GET", "/api/subscription", { token: tokens[i] });
    check(`tenant ${i}: subscription and payment were written together`,
      history.json?.data?.subscription?.status === "ACTIVE" && history.json?.data?.payments?.length === 1,
      `sub=${history.json?.data?.subscription?.status} payments=${history.json?.data?.payments?.length}`);
  }

  /* ------------------------------------------------------ platform theme -- */
  console.log("\n  platform palette");
  const publicTheme = await call("GET", "/api/settings/theme");
  check("palette is readable without a session", publicTheme.status === 200 && !!publicTheme.json?.data?.theme?.primary);
  check("preset list is returned for the admin picker", Array.isArray(publicTheme.json?.data?.palettes));

  const asCustomer = await call("PUT", "/api/settings/theme", { token: tokens[0], body: { palette: "Teal Calm" } });
  check("a customer cannot change the platform palette", asCustomer.status === 403, `got ${asCustomer.status}`);

  const anon = await call("PUT", "/api/settings/theme", { body: { palette: "Teal Calm" } });
  check("an anonymous request cannot change it either", anon.status === 401, `got ${anon.status}`);

  console.log(failed ? `\n${failed} checks failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("check crashed:", e.message);
  process.exit(2);
});
