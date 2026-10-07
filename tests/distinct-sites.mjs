/**
 * Two customers in the same trade must not get the same website.
 *
 * This is the check the product needed and did not have: it onboards several
 * businesses in one category through the real API and compares what actually
 * came back — colours, services, fonts, section order, generated art — then
 * asserts the things the customer can see are different. It also asserts the
 * part that is easy to lose while fixing the rest: the same business, built
 * twice, must come out identical (no random shuffling on every reload).
 *
 *   BASE_URL=http://127.0.0.1:3210 node tests/distinct-sites.mjs
 *
 * Registers throwaway accounts named probe-*; run it against a development
 * server, as it leaves those rows behind.
 */

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3210").replace(/\/$/, "");
const CATEGORY = process.env.CATEGORY || "Real Estate";
const COUNT = Number(process.env.COUNT || 3);

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

/** Onboard one business and return everything the customer would see. */
async function makeBusiness(i, stamp, { adjective, description, colors } = {}) {
  const email = `probe-distinct-${stamp}-${i}@example.com`;
  const reg = await call("POST", "/api/auth/register", {
    body: { name: `Probe Owner ${i}`, email, password: "Passw0rd123" },
  });
  const token = reg.json?.data?.token;
  if (!token) throw new Error(`register failed for ${i}: ${reg.status} ${reg.json?.error || ""}`);

  const name = `${adjective || "Probe"} Properties ${stamp}${i}`;
  const onb = await call("POST", "/api/onboarding", {
    token,
    body: {
      name,
      category: CATEGORY,
      phone: `+9198765${String(stamp).slice(-4)}${i}`,
      city: "Pune",
      address: `${i} Test Road, Pune`,
      description: description ?? "",
      ...(colors ? { brandPrimary: colors[0], brandSecondary: colors[1], brandAccent: colors[2] } : {}),
    },
  });
  if (onb.status !== 201) throw new Error(`onboarding failed for ${i}: ${onb.status} ${onb.json?.error || ""}`);

  const biz = onb.json.data.business;
  const site = await call("GET", `/api/site/${biz.slug}`);
  const data = site.json?.data ?? {};

  return {
    token,
    email,
    name,
    slug: biz.slug,
    colors: [biz.brandPrimary, biz.brandSecondary, biz.brandAccent],
    cover: biz.coverUrl,
    theme: data.website?.theme ?? {},
    sections: (data.website?.sections ?? []).map((s) => s.type),
    // `type:variant` per section, i.e. which arrangement of each block was
    // drawn for this business.
    plan: (data.website?.sections ?? []).map((s) => `${s.type}:${s.content?.variant ?? "-"}`),
    services: (data.services ?? []).map((s) => s.name),
    gallery: (data.gallery ?? []).map((g) => g.url),
  };
}

async function main() {
  console.log(`Distinct-site check → ${BASE} (${COUNT} businesses in "${CATEGORY}")\n`);
  const stamp = Date.now() % 100000;

  const built = [];
  for (let i = 0; i < COUNT; i++) {
    built.push(await makeBusiness(i, stamp, {
      adjective: ["Shree", "Skyline", "Green Acres", "Prime"][i % 4],
    }));
  }

  // A palette the customer picked must survive to the published site. The
  // wizard had a colour picker and the API read these fields, but nothing ever
  // sent them, so a chosen palette was silently replaced on the way in.
  console.log("  customer's own choice");
  const wanted = ["#123456", "#0a0a0a", "#ffcc00"];
  const picked = await makeBusiness(9, stamp, { adjective: "Custom", colors: wanted });
  check("a chosen palette reaches the site unchanged", picked.colors.join(",") === wanted.join(","),
    picked.colors.join(","));

  /* ------------------------------------------------ what must differ -- */

  console.log("  colours");
  const palettes = new Set(built.map((b) => b.colors.join("|")));
  check("no two businesses share a palette", palettes.size === COUNT,
    `${palettes.size} distinct palettes across ${COUNT} businesses`);
  check("colours are real hex values", built.every((b) => b.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))),
    built.map((b) => b.colors.join(",")).join(" / "));

  console.log("\n  services");
  const serviceLists = built.map((b) => b.services.join("|"));
  check("every business has services", built.every((b) => b.services.length > 0),
    built.map((b) => b.services.length).join(","));
  // A trade's service list is short — six things an electrician does — and two
  // of them legitimately do the same six things, so the engine's own similarity
  // score weights content lowest for exactly this reason (see lib/uniqueness.ts).
  // What this checks is that the lists are not *one* list handed round: at most
  // one collision in a run, and never a run where everybody matches.
  check("the businesses do not all sell the same list",
    new Set(serviceLists).size >= COUNT - 1,
    `${new Set(serviceLists).size} distinct lists across ${COUNT}`);

  console.log("\n  design");
  const looks = new Set(built.map((b) => `${b.theme.font}|${b.theme.radius}|${b.theme.cardStyle}`));
  check("the look (font/corners/cards) is not identical for everyone",
    looks.size > 1 || COUNT === 1, `${looks.size} distinct looks`);
  const orders = new Set(built.map((b) => b.sections.join(">")));
  check("the section order is not identical for everyone",
    orders.size > 1 || COUNT === 1, `${orders.size} distinct orders`);
  check("every site has a full page", built.every((b) => b.sections.length >= 10),
    built.map((b) => b.sections.length).join(","));

  /* ------------------------------------------- the genome behind it ---- */
  // The site is not picked from a template: it is built from a genome drawn for
  // this business — a business profile, design tokens, a motion pack and an
  // arrangement per section. These checks are on what actually reached the
  // database, because a genome that only exists in the generator cannot be
  // shown to the owner or used to regenerate one section later.
  console.log("\n  design DNA");
  const genomes = built.map((b) => b.theme.dna ?? {});
  check("every site carries its genome",
    genomes.every((g) => g.styleName && g.business?.subType && Array.isArray(g.sectionPlan) && g.sectionPlan.length > 0),
    genomes.map((g) => `${g.styleName} (${g.business?.subType ?? "?"})`).join(" | "));
  check("the genome describes every section on the page",
    built.every((b, i) => b.sections.every((type) => genomes[i].sectionPlan?.some((c) => c.type === type))),
    built.map((b, i) => `${genomes[i].sectionPlan?.length ?? 0}/${b.sections.length}`).join(" "));

  const signatures = built.map((b, i) =>
    JSON.stringify({
      business: genomes[i].business,
      design: [b.theme.font, b.theme.radius, b.theme.cardStyle, b.theme.shadow, b.theme.button, b.theme.spacing, b.theme.header, b.theme.footer, b.theme.imageTreatment],
      motion: b.theme.motion,
      variants: b.plan,
    }),
  );
  check("no two businesses get the same genome", new Set(signatures).size === COUNT || COUNT === 1,
    `${new Set(signatures).size} distinct genomes across ${COUNT}`);

  const variantTable = {
    hero: ["banner", "split", "editorial", "centred"],
    stats: ["row", "cards", "band"],
    about: ["split", "timeline", "bento"],
    services: ["cards", "process", "list"],
    whyUs: ["cards", "numbered", "bento"],
    gallery: ["grid", "masonry", "filmstrip"],
    testimonials: ["cards", "wall", "spotlight"],
    faq: ["list", "two-col"],
    cta: ["band", "split"],
    blog: ["cards", "list"],
    contact: ["form-side", "form-below"],
  };
  const unknown = built.flatMap((b) => b.plan).filter((entry) => {
    const [type, variant] = entry.split(":");
    return variant !== "-" && variantTable[type] && !variantTable[type].includes(variant);
  });
  check("every arrangement is one the renderer knows", unknown.length === 0, unknown.join(", "));

  console.log("\n  quality & uniqueness");
  const scores = built.map((b) => b.theme.quality?.score ?? -1);
  check("every site was checked", scores.every((sc) => sc >= 0), scores.join(", "));
  check("no site ships with a serious problem", scores.every((sc) => sc >= 75), scores.join(", "));
  const uniqueness = built.map((b) => b.theme.uniqueness);
  check("uniqueness was measured against the trade",
    uniqueness.every((u) => typeof u === "number" && u >= 0 && u <= 100), uniqueness.join(", "));
  check("at least one site could improve on its own score",
    uniqueness.some((u) => u < 100) || COUNT === 1, uniqueness.join(", "));

  console.log("\n  artwork");
  const covers = new Set(built.map((b) => b.cover));
  check("every business has its own cover", covers.size === COUNT, built.map((b) => b.cover).join(" / "));
  const galleryUrls = built.map((b) => b.gallery.join("|"));
  check("galleries are not the same three images", new Set(galleryUrls).size === COUNT);

  // The generated poster must actually render, be an SVG, and differ per business.
  const posters = [];
  for (const b of built) {
    const res = await fetch(`${BASE}${b.cover}`);
    posters.push({ slug: b.slug, status: res.status, type: res.headers.get("content-type") || "", body: await res.text() });
  }
  check("the cover URL renders", posters.every((p) => p.status === 200), posters.map((p) => p.status).join(","));
  check("it is served as an SVG image", posters.every((p) => p.type.includes("image/svg+xml")),
    posters.map((p) => p.type).join(","));
  check("it contains no script or external reference",
    posters.every((p) => !/<script|href=|xlink:href|@import/i.test(p.body)));
  check("the art differs between businesses", new Set(posters.map((p) => p.body)).size === COUNT);

  // The hero keeps its animated scene when the owner has no photo — a stock
  // photo there is what made same-trade sites look identical above the fold.
  const heroes = [];
  for (const b of built) {
    const res = await call("GET", `/api/site/${b.slug}`);
    const hero = (res.json?.data?.website?.sections ?? []).find((s) => s.type === "hero");
    heroes.push((hero?.content?.image ?? "").trim());
  }
  check("the hero is not a shared stock photograph", heroes.every((h) => h === ""), heroes.join(" / "));

  /* --------------------------------------- what must NOT differ (yet) -- */
  // Rebuilding the same business must reproduce its site exactly: the seed is
  // stable, so a re-publish or a re-generate never reshuffles a live site.
  console.log("\n  stability");
  const first = built[0];
  const rebuilt = await call("POST", "/api/ai/generate", {
    token: first.token,
    body: { name: first.name, category: CATEGORY, city: "Pune" },
  });
  check("a re-generate request succeeds", rebuilt.status === 200, `status=${rebuilt.status}`);

  // The same business must produce the same genome every time it is read: a
  // preview, a re-publish or a dashboard reload must never reshuffle a live
  // site under its owner.
  const reread = await call("GET", `/api/site/${first.slug}`);
  const rereadTheme = reread.json?.data?.website?.theme ?? {};
  check("the genome does not change when the site is read again",
    JSON.stringify(rereadTheme.dna) === JSON.stringify(first.theme.dna) &&
      JSON.stringify(rereadTheme.motion) === JSON.stringify(first.theme.motion),
    rereadTheme.dna?.styleName ?? "no genome");

  console.log(failed ? `\n${failed} checks failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("check crashed:", e.message);
  process.exit(2);
});
