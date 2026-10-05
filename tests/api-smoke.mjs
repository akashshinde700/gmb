/**
 * WebSetu API smoke suite — auth, RBAC, tenant isolation, validation, uploads,
 * money paths and the public endpoints.
 *
 * Runs against an already-running server; no test framework required.
 *
 *   BASE_URL=http://127.0.0.1:3210 node tests/api-smoke.mjs
 *
 * It only creates its own accounts and data, so it is safe against a scratch
 * database. Do not point it at production: it registers users and writes leads.
 *
 * Rate limit counters live in the server process, and the suite deliberately
 * trips the login limiter, so start a fresh server for each full run.
 */

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3210").replace(/\/$/, "");

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

async function call(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response (an HTML error page) stays null on purpose */
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function uploadPng(token, bytes) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "pixel.png");
  const res = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const stamp = Date.now();
const userA = { name: "Tenant A", email: `a-${stamp}@example.com`, password: "Passw0rd123" };
const userB = { name: "Tenant B", email: `b-${stamp}@example.com`, password: "Passw0rd123" };

async function main() {
  console.log(`WebSetu API smoke suite → ${BASE}\n`);

  /* ------------------------------------------------------------ auth ---- */
  section("Authentication");

  const weak = await call("POST", "/api/auth/register", {
    body: { name: "Weak", email: `weak-${stamp}@example.com`, password: "short" },
  });
  check("register rejects a password under 8 chars", weak.status === 400, `got ${weak.status}`);

  const noDigit = await call("POST", "/api/auth/register", {
    body: { name: "Weak", email: `weak2-${stamp}@example.com`, password: "onlyletters" },
  });
  check("register requires a letter and a number", noDigit.status === 400, `got ${noDigit.status}`);

  const regA = await call("POST", "/api/auth/register", { body: userA });
  check("register creates an account", regA.status === 200 && !!regA.json?.data?.token, `got ${regA.status}`);
  const tokenA = regA.json?.data?.token;
  check("registration cannot self-assign ADMIN", regA.json?.data?.user?.role === "CUSTOMER");

  const escalate = await call("POST", "/api/auth/register", {
    body: { name: "Escalate", email: `esc-${stamp}@example.com`, password: "Passw0rd123", role: "ADMIN" },
  });
  check("a client-supplied role is ignored", escalate.json?.data?.user?.role === "CUSTOMER");

  const regB = await call("POST", "/api/auth/register", { body: userB });
  const tokenB = regB.json?.data?.token;
  check("second tenant registers", !!tokenB);

  const dupe = await call("POST", "/api/auth/register", { body: userA });
  check("duplicate email is refused with 409", dupe.status === 409, `got ${dupe.status}`);

  const badLogin = await call("POST", "/api/auth/login", { body: { email: userA.email, password: "Wrongpass1" } });
  check("wrong password returns 401", badLogin.status === 401, `got ${badLogin.status}`);
  check("login failure does not reveal whether the email exists",
    badLogin.json?.error === "Invalid email or password", badLogin.json?.error);

  const goodLogin = await call("POST", "/api/auth/login", { body: { email: userA.email, password: userA.password } });
  check("correct password logs in", goodLogin.status === 200 && !!goodLogin.json?.data?.token);

  const noAuth = await call("GET", "/api/auth/me");
  check("protected route without a token returns 401", noAuth.status === 401, `got ${noAuth.status}`);

  const forged = await call("GET", "/api/auth/me", { token: "eyJ1aWQiOiJhZG1pbiJ9.not-a-signature" });
  check("forged token is rejected", forged.status === 401, `got ${forged.status}`);

  const malformed = await call("POST", "/api/auth/login", { raw: "{not json" });
  check("malformed JSON returns 400, not a 500 HTML page", malformed.status === 400, `got ${malformed.status}`);
  check("error responses stay JSON", malformed.json?.ok === false);

  /* ------------------------------------------------------- onboarding --- */
  section("Onboarding & tenant setup");

  const badOnboard = await call("POST", "/api/onboarding", { token: tokenA, body: { name: "X" } });
  check("onboarding validates the business name", badOnboard.status === 400, `got ${badOnboard.status}`);

  const onboardA = await call("POST", "/api/onboarding", {
    token: tokenA,
    body: {
      name: `Alpha Traders ${stamp}`, category: "Electrician", phone: "+91 90000 11111",
      city: "Pune", address: "12 MG Road", description: "Alpha electrical services for homes.",
    },
  });
  check("onboarding creates the business", onboardA.status === 201, `got ${onboardA.status}: ${onboardA.json?.error || ""}`);
  const slugA = onboardA.json?.data?.business?.slug;
  check("website is generated with the business", !!onboardA.json?.data?.business?.website);
  check("a trial subscription is started", onboardA.json?.data?.business?.subscription?.status === "TRIALING");

  const onboardTwice = await call("POST", "/api/onboarding", {
    token: tokenA, body: { name: "Duplicate", category: "Electrician", phone: "+91 90000 11111" },
  });
  check("a second onboarding for the same user is refused", onboardTwice.status === 409, `got ${onboardTwice.status}`);

  const onboardB = await call("POST", "/api/onboarding", {
    token: tokenB,
    body: {
      name: `Beta Foods ${stamp}`, category: "Restaurant", phone: "+91 90000 22222",
      city: "Nashik", address: "5 Station Road",
    },
  });
  const slugB = onboardB.json?.data?.business?.slug;
  check("second tenant onboards", onboardB.status === 201, `got ${onboardB.status}`);

  /* -------------------------------------------------- tenant isolation -- */
  section("Tenant isolation (IDOR)");

  const svcA = await call("POST", "/api/content/services", {
    token: tokenA, body: { name: "Wiring", description: "Full house wiring" },
  });
  check("tenant A creates a service", svcA.status === 201, `got ${svcA.status}`);
  const svcAId = svcA.json?.data?.id;

  const readCross = await call("GET", "/api/content/services", { token: tokenB });
  check("tenant B's list does not contain tenant A's row",
    Array.isArray(readCross.json?.data) && !readCross.json.data.some((r) => r.id === svcAId));

  const editCross = await call("PUT", `/api/content/services/${svcAId}`, {
    token: tokenB, body: { name: "Hijacked" },
  });
  check("tenant B cannot edit tenant A's row", editCross.status === 404, `got ${editCross.status}`);

  const deleteCross = await call("DELETE", `/api/content/services/${svcAId}`, { token: tokenB });
  check("tenant B cannot delete tenant A's row", deleteCross.status === 404, `got ${deleteCross.status}`);

  const stillThere = await call("GET", "/api/content/services", { token: tokenA });
  check("tenant A's row survived both attempts",
    stillThere.json?.data?.some((r) => r.id === svcAId && r.name === "Wiring"));

  const badType = await call("GET", "/api/content/notathing", { token: tokenA });
  check("unknown content type returns 404", badType.status === 404, `got ${badType.status}`);

  /* --------------------------------------------------------------- RBAC - */
  section("RBAC");

  const adminRoutes = [
    ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/customers"],
    ["GET", "/api/admin/plans"],
    ["GET", "/api/admin/templates"],
    ["GET", "/api/admin/coupons"],
    ["GET", "/api/admin/platform-leads"],
  ];
  for (const [method, path] of adminRoutes) {
    const asCustomer = await call(method, path, { token: tokenA });
    check(`customer is blocked from ${path}`, asCustomer.status === 403, `got ${asCustomer.status}`);
    const anonymous = await call(method, path);
    check(`anonymous is blocked from ${path}`, anonymous.status === 401, `got ${anonymous.status}`);
  }

  const adminWrite = await call("PATCH", `/api/admin/businesses/someid`, {
    token: tokenA, body: { status: "PUBLISHED" },
  });
  check("customer cannot change a business status", adminWrite.status === 403, `got ${adminWrite.status}`);

  /* ---------------------------------------------------------- uploads --- */
  section("Uploads");

  const anonUpload = await uploadPng(null, PNG);
  check("upload requires a session", anonUpload.status === 401, `got ${anonUpload.status}`);

  const okUpload = await uploadPng(tokenA, PNG);
  check("authenticated PNG upload succeeds", okUpload.status === 201, `got ${okUpload.status}: ${okUpload.json?.error || ""}`);
  const uploadedUrl = okUpload.json?.data?.url;
  check("upload returns a served URL", typeof uploadedUrl === "string" && uploadedUrl.startsWith("/api/uploads/"));

  if (uploadedUrl) {
    const fetched = await call("GET", uploadedUrl);
    check("uploaded file is served back", fetched.status === 200, `got ${fetched.status}`);
    check("served file has an image content type",
      (fetched.headers.get("content-type") || "").startsWith("image/"));
    check("served file is marked nosniff", fetched.headers.get("x-content-type-options") === "nosniff");
  }

  const svgForm = new FormData();
  svgForm.append("file", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/png" }), "x.png");
  const svgRes = await fetch(`${BASE}/api/upload`, {
    method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: svgForm,
  });
  check("a non-image disguised as PNG is rejected", svgRes.status === 415, `got ${svgRes.status}`);

  const traversal = await call("GET", "/api/uploads/..%2F..%2Fpackage.json");
  check("path traversal on the file route is refused", traversal.status === 404, `got ${traversal.status}`);

  /* -------------------------------------------------------- validation -- */
  section("Validation");

  const badPhone = await call("PUT", "/api/business", { token: tokenA, body: { phone: "abc" } });
  check("invalid phone is rejected", badPhone.status === 400, `got ${badPhone.status}`);

  const badEmail = await call("PUT", "/api/business", { token: tokenA, body: { email: "not-an-email" } });
  check("invalid email is rejected", badEmail.status === 400, `got ${badEmail.status}`);

  const badColor = await call("PUT", "/api/business", { token: tokenA, body: { brandPrimary: "red; drop table" } });
  check("invalid brand colour is rejected", badColor.status === 400, `got ${badColor.status}`);

  const xssLogo = await call("PUT", "/api/business", {
    token: tokenA, body: { logoUrl: "javascript:alert(document.cookie)" },
  });
  check("javascript: URL is stripped rather than stored",
    xssLogo.status === 200 && xssLogo.json?.data?.logoUrl === "", JSON.stringify(xssLogo.json?.data?.logoUrl));

  const badTheme = await call("PUT", "/api/website", { token: tokenA, body: { theme: { font: "comic-sans" } } });
  check("unknown theme value is rejected", badTheme.status === 400, `got ${badTheme.status}`);

  const badSection = await call("PUT", "/api/website", {
    token: tokenA, body: { sections: [{ id: "x", type: "definitely-not-a-section", visible: true, content: {} }] },
  });
  check("unknown section type is rejected", badSection.status === 400, `got ${badSection.status}`);

  const badRating = await call("POST", "/api/content/testimonials", {
    token: tokenA, body: { name: "R", content: "Great", rating: 99 },
  });
  check("out-of-range rating is clamped, not stored raw",
    badRating.status === 201 && badRating.json?.data?.rating === 5, `rating=${badRating.json?.data?.rating}`);

  const badPrice = await call("POST", "/api/content/products", {
    token: tokenA, body: { name: "P", price: 100, salePrice: 500 },
  });
  check("sale price above list price is rejected", badPrice.status === 400, `got ${badPrice.status}`);

  const badLeadStatus = await call("GET", "/api/leads?status=NOPE", { token: tokenA });
  check("invalid lead status filter is rejected", badLeadStatus.status === 400, `got ${badLeadStatus.status}`);

  /* ----------------------------------------------------------- publish -- */
  section("Publish workflow");

  // Tenant B was onboarded with everything publish needs, so it publishes; the
  // "missing field" path is exercised with a business stripped of its phone.
  await call("PUT", "/api/business", { token: tokenB, body: { phone: "" } });
  const publishEarly = await call("POST", "/api/website/publish", { token: tokenB, body: {} });
  check("publish is blocked while a required field is missing", publishEarly.status === 422,
    `got ${publishEarly.status}: ${publishEarly.json?.error || ""}`);
  check("the publish error names the missing field",
    (publishEarly.json?.error || "").toLowerCase().includes("phone"), publishEarly.json?.error);

  // Leave B unpublished for the visibility checks below.
  const unpublishB = await call("POST", "/api/website/publish", { token: tokenB, body: { unpublish: true } });
  check("unpublish returns the site to DRAFT", unpublishB.json?.data?.businessStatus === "DRAFT",
    unpublishB.json?.data?.businessStatus);

  await call("PUT", "/api/business", {
    token: tokenA, body: { phone: "+91 90000 11111", address: "12 MG Road", city: "Pune" },
  });
  await call("PUT", "/api/website", { token: tokenA, body: { seoTitle: "Alpha Traders — Electrician in Pune" } });
  const publish = await call("POST", "/api/website/publish", { token: tokenA, body: {} });
  check("publish succeeds once the site is complete", publish.status === 200, `got ${publish.status}: ${publish.json?.error || ""}`);
  check("publish returns a health score", typeof publish.json?.data?.health?.score === "number");
  check("health score counts business hours",
    publish.json?.data?.health?.checks?.find((c) => c.key === "hours")?.pass === true,
    "hours check should pass — onboarding sets a default week");

  /* ------------------------------------------------------- public site -- */
  section("Public site & leads");

  const site = await call("GET", `/api/site/${slugA}`);
  check("published site is publicly readable", site.status === 200, `got ${site.status}`);
  check("GSTIN is not exposed publicly", site.json?.data?.business?.gstin === "");

  const draftSite = await call("GET", `/api/site/${slugB}`);
  check("unpublished site is hidden from the public", draftSite.status === 404, `got ${draftSite.status}`);

  const ownerPreview = await call("GET", `/api/site/${slugB}`, { token: tokenB });
  check("the owner can still preview their unpublished site", ownerPreview.status === 200, `got ${ownerPreview.status}`);

  const otherPreview = await call("GET", `/api/site/${slugB}`, { token: tokenA });
  check("another tenant cannot preview it", otherPreview.status === 404, `got ${otherPreview.status}`);

  const lead = await call("POST", "/api/leads", {
    body: { slug: slugA, name: "Walk-in Customer", phone: "+91 98888 77777", message: "Need a quote" },
  });
  check("public enquiry is accepted on a published site", lead.status === 201, `got ${lead.status}: ${lead.json?.error || ""}`);

  // Service/product "Enquire" buttons carry the item name onto the lead.
  const subjectLead = await call("POST", "/api/leads", {
    body: {
      slug: slugA, name: "Subject Customer", phone: "+91 98888 66666",
      message: "How much?", serviceName: "Wiring",
    },
  });
  check("an enquiry records what it is about", subjectLead.status === 201, `got ${subjectLead.status}`);

  const honeypot = await call("POST", "/api/leads", {
    body: { slug: slugA, name: "Bot", phone: "+91 98888 77777", website: "http://spam.example" },
  });
  check("honeypot submission is accepted but discarded", honeypot.status === 201 && honeypot.json?.data?.id === "");

  const leadBadPhone = await call("POST", "/api/leads", { body: { slug: slugA, name: "X", phone: "12" } });
  check("enquiry with an invalid phone is rejected", leadBadPhone.status === 400, `got ${leadBadPhone.status}`);

  const leadUnpublished = await call("POST", "/api/leads", {
    body: { slug: slugB, name: "X", phone: "+91 98888 77777" },
  });
  check("enquiry to an unpublished site is refused", leadUnpublished.status === 403, `got ${leadUnpublished.status}`);

  const leadsA = await call("GET", "/api/leads", { token: tokenA });
  check("owner sees the new lead", leadsA.json?.data?.some((l) => l.name === "Walk-in Customer"));
  check("the owner sees which service was asked about",
    leadsA.json?.data?.find((l) => l.name === "Subject Customer")?.serviceName === "Wiring",
    leadsA.json?.data?.find((l) => l.name === "Subject Customer")?.serviceName);
  check("bot submission never became a lead", !leadsA.json?.data?.some((l) => l.name === "Bot"));
  check("lead list reports a total for paging", typeof leadsA.json?.meta?.total === "number");

  const leadsB = await call("GET", "/api/leads", { token: tokenB });
  check("the other tenant sees none of those leads",
    Array.isArray(leadsB.json?.data) && !leadsB.json.data.some((l) => l.name === "Walk-in Customer"));

  const leadId = leadsA.json?.data?.find((l) => l.name === "Walk-in Customer")?.id;
  if (leadId) {
    const crossPatch = await call("PATCH", `/api/leads/${leadId}`, { token: tokenB, body: { status: "SPAM" } });
    check("another tenant cannot change that lead", crossPatch.status === 404, `got ${crossPatch.status}`);
    const badStatus = await call("PATCH", `/api/leads/${leadId}`, { token: tokenA, body: { status: "MADE_UP" } });
    check("invalid lead status is rejected", badStatus.status === 400, `got ${badStatus.status}`);
  }

  const track = await call("POST", "/api/analytics/event", { body: { slug: slugA, type: "VISIT", path: "/" } });
  check("analytics event is recorded for a published site", track.json?.data?.tracked === true);
  const badTrack = await call("POST", "/api/analytics/event", { body: { slug: slugA, type: "DROP TABLE" } });
  check("unknown analytics event type is ignored", badTrack.json?.data?.tracked === false);

  const summary = await call("GET", "/api/analytics/summary", { token: tokenA });
  check("analytics summary returns 14 days", summary.json?.data?.daily?.length === 14, `got ${summary.json?.data?.daily?.length}`);
  check("analytics summary counted the visit", (summary.json?.data?.visits ?? 0) >= 1);

  /* ------------------------------------------------------------ money --- */
  section("Subscription & coupons");

  const anonCoupon = await call("POST", "/api/coupons/validate", { body: { code: "LAUNCH50", amount: 999 } });
  check("coupon validation requires a session", anonCoupon.status === 401, `got ${anonCoupon.status}`);

  const plans = await call("GET", "/api/plans");
  check("public plan list is available", plans.status === 200 && Array.isArray(plans.json?.data?.plans));
  const paidPlan = plans.json?.data?.plans?.[0];

  if (paidPlan) {
    const state = await call("GET", "/api/subscription", { token: tokenA });
    const liveGateway = state.json?.data?.gateway === "razorpay";
    const gstRate = state.json?.data?.gstRate;
    // 0 is a legitimate value: a supplier who is not GST registered must not
    // charge tax, so the assertion is that the rate is reported at all — not
    // that it is non-zero.
    check("GST rate is reported to the dashboard",
      typeof gstRate === "number" && gstRate >= 0 && gstRate <= 50,
      `got ${gstRate}`);

    if (liveGateway) {
      // A real gateway is configured, so the simulated path must be shut: it
      // would otherwise activate a paid plan without taking any money.
      const sub = await call("POST", "/api/subscription", {
        token: tokenA, body: { planId: paidPlan.id, cycle: "MONTHLY" },
      });
      check("simulated checkout is refused when a gateway is live", sub.status === 409,
        `got ${sub.status}`);
      check("the deployment does not advertise mock payments",
        state.json?.data?.mockPayments === false);

      const order = await call("POST", "/api/subscription/order", {
        token: tokenA, body: { planId: paidPlan.id, cycle: "MONTHLY" },
      });
      check("a real order is created", order.status === 201 && !!order.json?.data?.orderId,
        `got ${order.status}: ${order.json?.error || ""}`);
      const q = order.json?.data?.quote;
      check("the quote taxes the plan price and adds it to the total",
        q && q.taxableAmount === paidPlan.priceMonthly &&
          q.taxAmount === Math.round(q.taxableAmount * (gstRate / 100)) &&
          q.amount === q.taxableAmount + q.taxAmount,
        JSON.stringify(q));
      check("the order is charged in paise, matching the quote",
        order.json?.data?.amount === Math.round(q.amount * 100),
        `${order.json?.data?.amount} vs ${q && q.amount * 100}`);

      const forged = await call("POST", "/api/subscription/verify", {
        token: tokenA,
        body: {
          razorpay_order_id: order.json.data.orderId,
          razorpay_payment_id: "pay_forged",
          razorpay_signature: "not-a-real-signature",
        },
      });
      check("a forged payment signature is refused", forged.status === 400, `got ${forged.status}`);

      const unsigned = await call("POST", "/api/webhooks/razorpay", {
        body: { event: "payment.captured" },
      });
      check("an unsigned webhook is refused", unsigned.status === 401, `got ${unsigned.status}`);
    } else {
      const badPlan = await call("POST", "/api/subscription", { token: tokenA, body: { planId: "does-not-exist" } });
      check("unknown plan id is rejected", badPlan.status === 400, `got ${badPlan.status}`);

      const sub = await call("POST", "/api/subscription", {
        token: tokenA, body: { planId: paidPlan.id, cycle: "MONTHLY" },
      });
      check("subscription activates", sub.status === 201, `got ${sub.status}: ${sub.json?.error || ""}`);
      check("payment record is created with the invoice", !!sub.json?.data?.payment?.invoiceNo);
      check("mock payments are reported as simulated", sub.json?.data?.simulated === true);
      check("the charge is the plan price plus GST",
        sub.json?.data?.payment?.amount ===
          paidPlan.priceMonthly + Math.round(paidPlan.priceMonthly * (gstRate / 100)),
        `${sub.json?.data?.payment?.amount} vs ${paidPlan.priceMonthly} + GST`);

      const history = await call("GET", "/api/subscription", { token: tokenA });
      check("payment history lists exactly one payment", history.json?.data?.payments?.length === 1,
        `got ${history.json?.data?.payments?.length}`);
    }
  }

  /* ------------------------------------------------------------ account - */
  section("Account & password");

  const account = await call("GET", "/api/account", { token: tokenA });
  check("account returns notification preferences", typeof account.json?.data?.prefs?.leadAlerts === "boolean");

  const savePref = await call("PATCH", "/api/account", { token: tokenA, body: { prefs: { weekly: false } } });
  check("preference is saved", savePref.json?.data?.prefs?.weekly === false);
  const reread = await call("GET", "/api/account", { token: tokenA });
  check("preference survives a reload", reread.json?.data?.prefs?.weekly === false);

  const wrongCurrent = await call("PUT", "/api/account", {
    token: tokenA, body: { currentPassword: "Nope12345", newPassword: "Brandnew123" },
  });
  check("password change needs the current password", wrongCurrent.status === 401, `got ${wrongCurrent.status}`);

  const weakNew = await call("PUT", "/api/account", {
    token: tokenA, body: { currentPassword: userA.password, newPassword: "short" },
  });
  check("weak new password is rejected", weakNew.status === 400, `got ${weakNew.status}`);

  const changed = await call("PUT", "/api/account", {
    token: tokenA, body: { currentPassword: userA.password, newPassword: "Brandnew123" },
  });
  check("password change succeeds", changed.status === 200, `got ${changed.status}`);
  const loginNew = await call("POST", "/api/auth/login", { body: { email: userA.email, password: "Brandnew123" } });
  check("the new password works", loginNew.status === 200, `got ${loginNew.status}`);
  const loginOld = await call("POST", "/api/auth/login", { body: { email: userA.email, password: userA.password } });
  check("the old password no longer works", loginOld.status === 401, `got ${loginOld.status}`);

  /* -------------------------------------------------------- rate limits - */
  section("Rate limiting");

  let sawLimit = false;
  for (let i = 0; i < 12; i++) {
    const attempt = await call("POST", "/api/auth/login", {
      body: { email: `bruteforce-${stamp}@example.com`, password: `guess-${i}` },
    });
    if (attempt.status === 429) {
      sawLimit = true;
      break;
    }
  }
  check("repeated failed logins are throttled with 429", sawLimit);

  /* --------------------------------------------------------- headers ---- */
  section("Security headers");

  const root = await call("GET", "/");
  check("nosniff header is set", root.headers.get("x-content-type-options") === "nosniff");
  check("frame options header is set", !!root.headers.get("x-frame-options"));
  check("referrer policy header is set", !!root.headers.get("referrer-policy"));
  check("Next version header is hidden", !root.headers.get("x-powered-by"));

  /* ---------------------------------------------------------- summary --- */
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
