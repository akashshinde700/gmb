/**
 * Platform surfaces added last: enquiry follow-ups, the WebSetu blog, the
 * server-rendered tenant site at /s/[slug], usage counters and the sitemap.
 *
 *   BASE_URL=http://127.0.0.1:3210 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/platform.mjs
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

async function page(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, html: await res.text() };
}

async function main() {
  console.log(`Platform surfaces → ${BASE}\n`);
  const stamp = Date.now();

  const login = await call("POST", "/api/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.json?.data?.token;
  if (!admin) {
    console.error(`could not log in as ${ADMIN_EMAIL}: ${login.status} ${login.json?.error || ""}`);
    process.exit(2);
  }
  check("admin logs in", !!admin);

  /* ------------------------------------------------------- follow-ups ---- */
  section("Enquiry follow-ups");

  const enquiry = await call("POST", "/api/platform-lead", {
    body: { name: `Follow Up ${stamp}`, email: `lead-${stamp}@example.com`, message: "Interested in a demo" },
  });
  check("a public enquiry is captured", enquiry.status === 201, `got ${enquiry.status}`);
  const leadId = enquiry.json?.data?.id;

  const listed = await call("GET", "/api/admin/platform-leads", { token: admin });
  const leadRow = listed.json?.data?.find((l) => l.id === leadId);
  check("the enquiry appears for the admin", !!leadRow);
  check("it starts with no follow-ups", leadRow?.followUpCount === 0, `${leadRow?.followUpCount}`);
  check("it starts as NEW", leadRow?.status === "NEW", leadRow?.status);

  const anon = await call("POST", `/api/admin/platform-leads/${leadId}/follow-ups`, { body: { note: "sneaky" } });
  check("anonymous cannot add a follow-up", anon.status === 401, `got ${anon.status}`);

  const empty = await call("POST", `/api/admin/platform-leads/${leadId}/follow-ups`, { token: admin, body: { note: "" } });
  check("an empty note is refused", empty.status === 400, `got ${empty.status}`);

  const note = await call("POST", `/api/admin/platform-leads/${leadId}/follow-ups`, {
    token: admin, body: { note: "Called — wants a callback on Friday." },
  });
  check("a follow-up is recorded", note.status === 201, `got ${note.status}: ${note.json?.error || ""}`);
  check("it records who wrote it", note.json?.data?.followUp?.actor === ADMIN_EMAIL, note.json?.data?.followUp?.actor);
  check("the first note moves a NEW lead to CONTACTED", note.json?.data?.status === "CONTACTED", note.json?.data?.status);

  const afterNote = await call("GET", "/api/admin/platform-leads", { token: admin });
  check("the status change stuck",
    afterNote.json?.data?.find((l) => l.id === leadId)?.status === "CONTACTED");
  check("the follow-up count is reported",
    afterNote.json?.data?.find((l) => l.id === leadId)?.followUpCount === 1);

  const trail = await call("GET", `/api/admin/platform-leads/${leadId}/follow-ups`, { token: admin });
  check("the trail can be read back", trail.json?.data?.followUps?.length === 1);

  const noteId = trail.json.data.followUps[0].id;
  const removed = await call("DELETE", `/api/admin/platform-leads/${leadId}/follow-ups?noteId=${noteId}`, { token: admin });
  check("a follow-up can be deleted", removed.json?.data?.deleted === noteId);

  const missing = await call("GET", "/api/admin/platform-leads/does-not-exist/follow-ups", { token: admin });
  check("an unknown lead returns 404", missing.status === 404, `got ${missing.status}`);

  /* -------------------------------------------------------------- blog --- */
  section("Platform blog");

  const anonPost = await call("POST", "/api/admin/posts", { body: { title: "Sneaky", content: "x".repeat(30) } });
  check("anonymous cannot write a post", anonPost.status === 401, `got ${anonPost.status}`);

  const shortTitle = await call("POST", "/api/admin/posts", { token: admin, body: { title: "ab", content: "x".repeat(30) } });
  check("a too-short title is refused", shortTitle.status === 400, `got ${shortTitle.status}`);

  const draft = await call("POST", "/api/admin/posts", {
    token: admin,
    body: {
      title: `Local SEO basics ${stamp}`,
      excerpt: "What actually moves the needle on Google for a local shop.",
      content: "Claim your Google Business Profile first.\n\nThen keep your hours accurate.",
      author: "Akash",
    },
  });
  check("a draft post is created", draft.status === 201, `got ${draft.status}: ${draft.json?.error || ""}`);
  const post = draft.json?.data?.post;
  check("a draft has no publish date", post?.publishedAt === null);

  const publicList = await call("GET", "/api/posts");
  check("drafts stay out of the public list", !publicList.json?.data?.some((p) => p.id === post.id));

  const draftPage = await page(`/blog/${post.slug}`);
  check("a draft is not readable by direct URL", draftPage.status === 404, `got ${draftPage.status}`);

  const published = await call("PUT", `/api/admin/posts/${post.id}`, { token: admin, body: { published: true } });
  check("publishing stamps the date", !!published.json?.data?.post?.publishedAt);

  const nowPublic = await call("GET", "/api/posts");
  check("a published post reaches the public list", nowPublic.json?.data?.some((p) => p.id === post.id));

  const postPage = await page(`/blog/${post.slug}`);
  check("the post renders server-side", postPage.status === 200, `got ${postPage.status}`);
  check("the title is in the served HTML", postPage.html.includes(`Local SEO basics ${stamp}`));
  check("BlogPosting structured data is emitted", postPage.html.includes('"@type":"BlogPosting"'));
  check("the post has a canonical URL", postPage.html.includes('rel="canonical"'));

  const blogIndex = await page("/blog");
  check("the blog index renders", blogIndex.status === 200, `got ${blogIndex.status}`);

  const unpublished = await call("PUT", `/api/admin/posts/${post.id}`, { token: admin, body: { published: false } });
  check("unpublishing clears the date", unpublished.json?.data?.post?.publishedAt === null);
  check("and hides it again", (await page(`/blog/${post.slug}`)).status === 404);

  await call("PUT", `/api/admin/posts/${post.id}`, { token: admin, body: { published: true } });

  /* -------------------------------------------- server-rendered tenant --- */
  section("Server-rendered tenant site");

  const reg = await call("POST", "/api/admin/customers", {
    token: admin,
    body: {
      name: "SSR Owner", email: `ssr-${stamp}@example.com`,
      businessName: `SSR Traders ${stamp}`, category: "Electrician",
      phone: "+91 90000 77777", city: "Pune", address: "9 Market Road",
    },
  });
  check("a tenant is provisioned", reg.status === 201, `got ${reg.status}`);
  const slug = reg.json?.data?.slug;
  const owner = (await call("POST", "/api/auth/login", {
    body: { email: `ssr-${stamp}@example.com`, password: reg.json.data.password },
  })).json?.data?.token;

  const draftSite = await page(`/s/${slug}`);
  check("an unpublished site is not served publicly", draftSite.status === 404, `got ${draftSite.status}`);

  await call("PUT", "/api/website", { token: owner, body: { seoTitle: `SSR Traders ${stamp} — Electrician in Pune` } });
  const publish = await call("POST", "/api/website/publish", { token: owner, body: {} });
  check("the owner publishes", publish.status === 200, `got ${publish.status}: ${publish.json?.error || ""}`);

  const live = await page(`/s/${slug}`);
  check("the published site is server-rendered", live.status === 200, `got ${live.status}`);
  check("the business name is in the HTML a crawler receives", live.html.includes(`SSR Traders ${stamp}`));
  check("the SEO title becomes the page title", live.html.includes(`SSR Traders ${stamp} — Electrician in Pune`));
  check("LocalBusiness structured data is emitted", live.html.includes('"@type":"LocalBusiness"'));
  check("the page declares a canonical URL", live.html.includes(`/s/${slug}`));
  check("GSTIN is not exposed in the HTML", !/gstin[^,]{0,4}:[^,]{0,4}[0-9]/i.test(live.html));

  const unknownSite = await page(`/s/no-such-business-${stamp}`);
  check("an unknown slug is a 404", unknownSite.status === 404, `got ${unknownSite.status}`);

  /* ------------------------------------------------------------ usage ---- */
  section("Usage counters and sitemap");

  await call("POST", "/api/content/services", { token: owner, body: { name: "Wiring" } });
  await call("POST", "/api/content/services", { token: owner, body: { name: "Repairs" } });
  await call("POST", "/api/leads", { body: { slug, name: "Passerby", phone: "+91 98888 12345" } });

  const customers = await call("GET", "/api/admin/customers", { token: admin });
  const row = customers.json?.data?.find((r) => r.business?.slug === slug);
  check("the customer row carries usage counts", !!row?.usage);
  check("services are counted", row?.usage?.services === 2, `${row?.usage?.services}`);
  check("leads are counted", row?.usage?.leads === 1, `${row?.usage?.leads}`);
  check("a renewal or trial date is available",
    !!(row?.subscription?.trialEndsAt || row?.subscription?.renewsAt));

  const sitemap = await page("/sitemap.xml");
  check("the sitemap renders", sitemap.status === 200, `got ${sitemap.status}`);
  check("it lists the published tenant site", sitemap.html.includes(`/s/${slug}`));
  check("it lists the blog", sitemap.html.includes("/blog"));

  const robots = await page("/robots.txt");
  check("robots points at the sitemap", robots.html.includes("Sitemap:"), robots.html.slice(0, 80));

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
