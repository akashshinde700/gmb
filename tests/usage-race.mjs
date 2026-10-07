/**
 * Concurrency check for the metered allowances: AI generations and design
 * changes.
 *
 * Both counters used to be read, compared and then written in a second
 * statement, so requests arriving together could each pass the check and spend
 * more than the plan allows — silently, with nothing in the logs. That is the
 * same shape the coupon claim in billing.ts already avoids, and both claims are
 * now conditional single-statement updates. This suite proves it end to end:
 * N simultaneous calls against an allowance of 2 must produce exactly 2
 * successes, never 3.
 *
 *   # shell 1 — the model stub this suite runs needs the app pointed at it,
 *   # otherwise generations fall back to the deterministic template (which is
 *   # free by design) and the AI half of the check is reported as skipped.
 *   OLLAMA_URL=http://127.0.0.1:11434 npm run dev
 *   # shell 2
 *   BASE_URL=http://127.0.0.1:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/usage-race.mjs
 *
 * The design-change half needs no provider. Plan limits are set through the
 * admin API and restored before the script exits.
 */

import { createServer } from "node:http";

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3210").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "root@test.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Adminpass123";
const TENANTS = Number(process.env.TENANTS || 6);
const ALLOWANCE = Number(process.env.ALLOWANCE || 2);
// The port the app was started with OLLAMA_URL pointed at.
const STUB_PORT = Number(process.env.STUB_PORT || 11434);

/** Put this in the prompt to make the stub model fail: see the refund check. */
const FAIL_MARKER = "ZZREFUND";

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

/** A stub model: enough of the Ollama chat API for the route to believe it. */
function startModelStub() {
  const content = {
    heroHeading: "Stub headline for the concurrency check",
    heroSubheading: "Returned by the test's own model server.",
    about: "Stub about text.",
    services: [{ name: "Stub Service", description: "Stub", icon: "sparkles" }],
    industry: "general",
    imageQuery: "stub image",
  };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      // The marker makes the "model" fail on demand, which is how the suite
      // checks that a failed generation is not charged to the customer.
      if (raw.includes(FAIL_MARKER)) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "stub failure" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { role: "assistant", content: JSON.stringify(content) } }));
    });
  });
  return new Promise((resolve) => {
    server.once("error", () => resolve(null)); // port busy: assume one is already running
    server.listen(STUB_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function makeTenant(i, stamp) {
  const reg = await call("POST", "/api/auth/register", {
    body: { name: `Usage Racer ${i}`, email: `usage-${stamp}-${i}@example.com`, password: "Passw0rd123" },
  });
  const token = reg.json?.data?.token;
  if (!token) throw new Error(`registration failed for tenant ${i}: ${reg.status} ${reg.json?.error || ""}`);
  const onboard = await call("POST", "/api/onboarding", {
    token,
    body: {
      name: `Usage Racer Co ${stamp}-${i}`,
      category: "Retail",
      phone: `+91 90000 0000${i}`,
      city: "Pune",
      address: "1 Test Road",
    },
  });
  if (onboard.status !== 201) throw new Error(`onboarding failed for tenant ${i}: ${onboard.status} ${onboard.json?.error || ""}`);
  return token;
}

async function main() {
  console.log(`Usage-race check → ${BASE} (allowance ${ALLOWANCE}, ${TENANTS} concurrent)\n`);

  const stub = await startModelStub();
  if (stub) console.log(`  (model stub listening on 127.0.0.1:${STUB_PORT})\n`);

  const login = await call("POST", "/api/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.json?.data?.token;
  if (!admin) throw new Error(`admin login failed: ${login.status} ${login.json?.error || ""}`);

  const plansRes = await call("GET", "/api/admin/plans", { token: admin });
  const plan = plansRes.json?.data?.find((p) => p.slug === "standard") || plansRes.json?.data?.[0];
  if (!plan) throw new Error("no plan to meter");
  const original = { aiCredits: plan.aiCredits, maxThemeChanges: plan.maxThemeChanges };

  const stamp = Date.now();
  try {
    /* ------------------------------------------------ design changes -- */
    // Meter the plan, then let one tenant loose on it from several "tabs" at
    // once. The claim is what is under test: the limit must hold.
    await call("PUT", `/api/admin/plans/${plan.id}`, {
      token: admin,
      body: { maxThemeChanges: ALLOWANCE },
    });

    const themeToken = await makeTenant(0, stamp);

    // Every request must be a real change: saving the look a site already has is
    // free by design, and a request that happens to send the stored theme back
    // would pass without spending anything and make this check lie. Build the
    // combinations first, then drop the one that equals what is stored.
    const stored = (await call("GET", "/api/website", { token: themeToken })).json?.data?.theme ?? {};
    const combos = [];
    for (const font of ["modern", "classic", "elegant"]) {
      for (const radius of ["sharp", "rounded", "pill"]) {
        for (const cardStyle of ["flat", "shadow", "outline"]) combos.push({ font, radius, cardStyle });
      }
    }
    const themes = combos
      .filter((c) => c.font !== stored.font || c.radius !== stored.radius || c.cardStyle !== stored.cardStyle)
      .slice(0, TENANTS);
    if (themes.length < TENANTS) throw new Error("not enough distinct themes to race with");

    console.log("  design changes");
    const themeResults = await Promise.all(
      themes.map((theme) => call("PUT", "/api/website", { token: themeToken, body: { theme } })),
    );
    const themeWon = themeResults.filter((r) => r.status === 200);
    const themeLost = themeResults.filter((r) => r.status === 402);
    console.log(`\n  ${themeWon.length} changes accepted, ${themeLost.length} refused`);

    check(`at most ${ALLOWANCE} design changes were accepted`, themeWon.length === ALLOWANCE, `${themeWon.length} accepted`);
    check("the rest were refused with 402", themeLost.length === TENANTS - ALLOWANCE);
    check("the refusal explains the limit", themeLost.every((r) => /design changes/i.test(r.json?.error || "")),
      themeLost.map((r) => r.json?.error).join(" | "));
    check("no request errored", themeResults.every((r) => r.status === 200 || r.status === 402),
      themeResults.map((r) => r.status).join(","));

    // Read the meter back after the burst: each response above is a snapshot
    // taken while its siblings were still in flight, so only this is the settled
    // state. It is read from a PUT of whatever is stored *now* — re-saving the
    // current look is free, so this read costs nothing (and failing to notice
    // that it is free would itself be a bug worth catching).
    const nowStored = (await call("GET", "/api/website", { token: themeToken })).json?.data?.theme ?? {};
    const settledRes = await call("PUT", "/api/website", { token: themeToken, body: { theme: nowStored } });
    const settled = settledRes.json?.data?.appearance;
    check("re-saving the same look still costs nothing", settledRes.status === 200, `status=${settledRes.status}`);
    check("the meter counts exactly what was accepted",
      settled?.used === ALLOWANCE && settled?.remaining === 0 && settled?.canChange === false,
      `used=${settled?.used} remaining=${settled?.remaining} canChange=${settled?.canChange}`);

    /* -------------------------------------------------- AI credits -- */
    console.log("\n  AI generations");
    await call("PUT", `/api/admin/plans/${plan.id}`, { token: admin, body: { aiCredits: ALLOWANCE } });
    const aiToken = await makeTenant(1, stamp);

    const aiBody = { name: "Usage Racer Co", category: "Retail", city: "Pune", tone: "professional" };
    const probe = await call("POST", "/api/ai/generate", { token: aiToken, body: aiBody });
    if (probe.status !== 200 || probe.json?.data?.generated !== true) {
      // No provider configured on the server: every call is served the
      // deterministic template and no credit is charged (that is the free-path
      // fix), so there is no counter to race. Say so rather than pretend.
      console.log("  skipped — the server has no model provider configured");
      console.log(`    (start it with OLLAMA_URL=http://127.0.0.1:${STUB_PORT} to run this half)`);
      check("an unconfigured provider charges nothing", probe.status === 200 && probe.json?.data?.generated === false,
        `status=${probe.status} generated=${probe.json?.data?.generated}`);

      const customers = await call("GET", `/api/admin/customers?q=usage-${stamp}-1@example.com`, { token: admin });
      check("no AI credit was consumed without a model", (customers.json?.data?.[0]?.usage?.aiUsed ?? -1) === 0,
        `aiUsed=${customers.json?.data?.[0]?.usage?.aiUsed}`);
    } else {
      // The probe above spent one of the two credits; reset the meter by moving
      // to a fresh tenant so the race starts from a known zero.
      await call("PUT", `/api/admin/plans/${plan.id}`, { token: admin, body: { aiCredits: ALLOWANCE } });
      const raceToken = await makeTenant(2, stamp);

      const aiResults = await Promise.all(
        Array.from({ length: TENANTS }, (_, i) =>
          call("POST", "/api/ai/generate", { token: raceToken, body: { ...aiBody, city: `Pune ${i}` } }),
        ),
      );
      const aiWon = aiResults.filter((r) => r.status === 200 && r.json?.data?.generated === true);
      const aiLost = aiResults.filter((r) => r.status === 402);
      console.log(`\n  ${aiWon.length} generations served, ${aiLost.length} refused`);

      check(`at most ${ALLOWANCE} generations were served`, aiWon.length === ALLOWANCE, `${aiWon.length} served`);
      check("the rest were refused with 402", aiLost.length === TENANTS - ALLOWANCE);
      check("no request errored", aiResults.every((r) => r.status === 200 || r.status === 402),
        aiResults.map((r) => r.status).join(","));

      const customers = await call("GET", `/api/admin/customers?q=usage-${stamp}-2@example.com`, { token: admin });
      check("the meter shows exactly what was spent",
        (customers.json?.data?.[0]?.usage?.aiUsed ?? -1) === ALLOWANCE,
        `aiUsed=${customers.json?.data?.[0]?.usage?.aiUsed}`);

      /* ------------------------------- a failed generation is free -- */
      // The provider is reachable but broken: the customer is served template
      // copy. Charging a credit for that would bill them for copy they could
      // have had with no model configured at all — and the meter must show the
      // truth afterwards, which is the part a "reserve first" fix gets wrong.
      console.log("\n  a failed generation");
      const refundToken = await makeTenant(3, stamp);
      const failedCall = await call("POST", "/api/ai/generate", {
        token: refundToken,
        body: { ...aiBody, city: `Pune ${FAIL_MARKER}` },
      });
      check("the customer still gets content", failedCall.status === 200 && !!failedCall.json?.data?.content,
        `status=${failedCall.status}`);
      check("and is told it is not model-written", failedCall.json?.data?.generated === false,
        `generated=${failedCall.json?.data?.generated}`);

      const refunded = await call("GET", `/api/admin/customers?q=usage-${stamp}-3@example.com`, { token: admin });
      check("the credit is given back",
        (refunded.json?.data?.[0]?.usage?.aiUsed ?? -1) === 0,
        `aiUsed=${refunded.json?.data?.[0]?.usage?.aiUsed}`);
    }
  } finally {
    // Put the plan back the way it was found, whatever happened above.
    await call("PUT", `/api/admin/plans/${plan.id}`, { token: admin, body: original }).catch(() => {});
    if (stub) stub.close();
  }

  console.log(failed ? `\n${failed} checks failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("check crashed:", e.message);
  process.exit(2);
});
