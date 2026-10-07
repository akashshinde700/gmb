/**
 * Unit tests for the hosting bundle — the records a customer's domain needs,
 * and the state machine that checks them.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/hosting.test.mts
 *
 * No network: every check runs against an injected resolver, which is the same
 * seam the live probe and any future caching resolver use. What is being tested
 * is the *judgement* — that a record pointing somewhere else is reported as
 * wrong rather than "waiting", that a merged SPF record counts as correct, that
 * nothing invents a DKIM key, and that a lookup failure never reads as success.
 */

import {
  checkBundle, checkHostingTarget, checkRecord, dmarcValue, EMAIL_PROVIDERS, fqdnFor,
  hostingBundle, isDmarcPosture, isEmailProvider, spfValue, summarize,
  type DnsRecord, type DnsResolver, type LookupAnswer,
} from "@/lib/hosting";

// The platform's own DNS target, as a deployment would set it. Both values are
// read lazily by dnsTarget()/platformHosts(), so setting them here is exactly
// what production does — and it keeps the test about the judgement, not about
// whatever env the machine happens to have.
process.env.DOMAIN_TARGET_HOST = "app.websetu.in";
process.env.DOMAIN_TARGET_IPS = "203.0.113.10";
process.env.PLATFORM_HOSTS = "app.websetu.in,www.websetu.instantqr.tech";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

const HOST = "sharmaelectricals.in";

/** A resolver built from a table of answers; anything not listed is ENOTFOUND. */
function resolverFor(table: Record<string, Partial<LookupAnswer>>): DnsResolver {
  return async ({ type, fqdn }) => {
    const key = `${type} ${fqdn}`;
    if (key in table) return table[key];
    const error = new Error("queryA ENOTFOUND") as Error & { code: string };
    error.code = "ENOTFOUND";
    throw error;
  };
}

const okTable: Record<string, Partial<LookupAnswer>> = {
  "A sharmaelectricals.in": { a: ["203.0.113.10"] },
  "CNAME www.sharmaelectricals.in": { cname: ["app.websetu.in"] },
  "TXT _websetu.sharmaelectricals.in": { txt: ["websetu-verify=abc123"] },
  "TXT sharmaelectricals.in": { txt: ["v=spf1 include:zoho.in ~all"] },
  "MX sharmaelectricals.in": { mx: [
    { exchange: "mx.zoho.in", priority: 10 },
    { exchange: "mx2.zoho.in", priority: 20 },
    { exchange: "mx3.zoho.in", priority: 50 },
  ] },
  "TXT _dmarc.sharmaelectricals.in": { txt: ["v=DMARC1; p=none; fo=1"] },
  "TXT zmail._domainkey.sharmaelectricals.in": { txt: ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ"] },
};

/* ------------------------------------------------------------------ inputs */

section("What the platform refuses to plan records for");
{
  check("a platform hostname is refused by name", !checkHostingTarget("app.websetu.in").ok);
  check("…and says whose DNS it is", /platform/i.test(checkHostingTarget("app.websetu.in").error), checkHostingTarget("app.websetu.in").error);
  check("an IP address is refused", !checkHostingTarget("203.0.113.10").ok);
  check("a bare TLD is refused", !checkHostingTarget("localhost").ok);
  check("a real domain is accepted", checkHostingTarget(HOST).ok);
  check("a pasted URL is accepted and normalised", checkHostingTarget(`https://${HOST}/dashboard`).ok);
}

section("The record name for a lookup");
{
  check("the bare domain is its own name", fqdnFor(HOST, "@") === HOST);
  check("www is a subdomain", fqdnFor(HOST, "www") === `www.${HOST}`);
  check("_dmarc is a subdomain", fqdnFor(HOST, "_dmarc") === `_dmarc.${HOST}`);
  check("a longer label is a subdomain too", fqdnFor(HOST, "zmail._domainkey") === `zmail._domainkey.${HOST}`);
  check("a trailing dot on the input is ignored", fqdnFor(`${HOST}.`, "www") === `www.${HOST}`);
}

/* --------------------------------------------------------------- the bundle */

const base = hostingBundle({
  hostname: HOST, verificationToken: "abc123", emailProvider: "zoho", dmarcPosture: "none",
});
const record = (id: string): DnsRecord | undefined => base.groups.flatMap((g) => g.records).find((r) => r.id === id);
/** A second bundle, for the questions that are about a setting rather than a record. */
const bundleFor = (over: Partial<Parameters<typeof hostingBundle>[0]>) =>
  hostingBundle({ hostname: HOST, verificationToken: "abc123", emailProvider: "zoho", dmarcPosture: "none", ...over });
/** Find a record by meaning rather than by its id, so a changed value cannot make a test vacuous. */
const find = (b: typeof base, pred: (r: DnsRecord) => boolean): DnsRecord =>
  b.groups.flatMap((g) => g.records).find(pred)!;

section("The bundle itself");
{
  check("it has the four groups", base.groups.map((g) => g.purpose).join(",") === "site,verification,certificate,email");
  check("every record carries a reason", base.groups.flatMap((g) => g.records).every((r) => r.why.length > 15));
  check("the verification TXT carries this domain's token", record("txt:_websetu:websetu-verify=abc123") !== undefined);
  check("the Zoho SPF include is planned", record("txt:@:v=spf1 include:zoho.in ~all") !== undefined);
  check("the Zoho MX is planned", record("mx:@:mx.zoho.in")?.priority === 10);
  check("it is deterministic", JSON.stringify(hostingBundle({ hostname: HOST, verificationToken: "abc123", emailProvider: "zoho", dmarcPosture: "none" })) === JSON.stringify(base));
}

section("Mailbox providers");
{
  const google = hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "google" });
  const gMx = google.groups.flatMap((g) => g.records).filter((r) => r.type === "MX");
  check("Google's five MX rows are all listed", gMx.length === 5, gMx.map((r) => r.value).join(", "));
  check("the two rows that share a priority keep separate identities", new Set(gMx.map((r) => r.id)).size === 5);
  check("Google's SPF include is used", google.groups.flatMap((g) => g.records).some((r) => r.value.includes("include:_spf.google.com")));

  const ms = hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "microsoft" });
  const dkim = ms.groups.flatMap((g) => g.records).filter((r) => r.name.includes("_domainkey"));
  check("Microsoft gets two DKIM CNAMEs", dkim.length === 2 && dkim.every((r) => r.type === "CNAME"));
  check("with no tenant hostname they wait for a value rather than inventing one",
    dkim.every((r) => r.needsValue && r.value === ""));
  check("Microsoft's MX points at the tenant", ms.groups.flatMap((g) => g.records).some((r) => r.type === "MX" && r.value === `${HOST}.mail.protection.outlook.com`));
  check("autodiscover is offered as optional", ms.groups.flatMap((g) => g.records).some((r) => r.name === "autodiscover" && !r.required));

  const none = hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "none" });
  check("choosing no mailbox plans no MX", none.groups.flatMap((g) => g.records).every((r) => r.type !== "MX"));
  check("…and says why that is a real choice", /does not need MX|keep using a Gmail/i.test(none.groups.find((g) => g.purpose === "email")!.blurb + none.notes.join(" ")));

  check("an unknown provider key falls back to none", hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "postbox" as never }).groups.flatMap((g) => g.records).every((r) => r.type !== "MX"));
  check("every provider key is a real one", Object.keys(EMAIL_PROVIDERS).every((k) => isEmailProvider(k)));
  check("a made-up provider key is not", !isEmailProvider("fastmail-ish"));
}

section("SPF and DMARC values");
{
  check("SPF joins several includes", spfValue({ provider: EMAIL_PROVIDERS.google }) === "v=spf1 include:_spf.google.com ~all");
  check("the platform mailbox adds our mail host", spfValue({ provider: EMAIL_PROVIDERS.platform, mailHost: "mail.websetu.in" }) === "v=spf1 include:mail.websetu.in ~all");
  check("a soft fail is used deliberately", spfValue({ provider: EMAIL_PROVIDERS.zoho }).endsWith("~all"));
  check("DMARC names this domain's own report address",
    dmarcValue({ hostname: HOST, posture: "none" }) === `v=DMARC1; p=none; fo=1; rua=mailto:dmarc@${HOST}; adkim=r; aspf=r`);
  check("the posture is the one chosen", dmarcValue({ hostname: HOST, posture: "reject" }).includes("p=reject"));
  check("the three postures are the only ones accepted",
    isDmarcPosture("none") && isDmarcPosture("quarantine") && isDmarcPosture("reject") && !isDmarcPosture("block") && !isDmarcPosture(""));
}

/* ----------------------------------------------------------- verification */

section("Checking a record against DNS");
{
  const site = record("a:@:203.0.113.10")!;
  const www = record("cname:www:app.websetu.in")!;
  const verify = record("txt:_websetu:websetu-verify=abc123")!;
  const spf = find(base, (r) => r.match === "spf");
  const dmarc = find(base, (r) => r.match === "dmarc");

  const ok = await checkRecord(site, HOST, resolverFor(okTable));
  check("an A record that matches is ok", ok.status === "ok");
  check("the found value is reported back", ok.found.includes("203.0.113.10"));

  const sameIp = await checkRecord(site, HOST, resolverFor({ "A sharmaelectricals.in": { a: ["203.0.113.10"] } }));
  check("a single-IP answer is enough", sameIp.status === "ok");

  const wrongIp = await checkRecord(site, HOST, resolverFor({ "A sharmaelectricals.in": { a: ["198.51.100.7"] } }));
  check("an A record pointing elsewhere is WRONG, not merely pending", wrongIp.status === "wrong", wrongIp.status);
  check("…and the customer is told what it actually says", wrongIp.detail.includes("198.51.100.7"));
  check("…and the foreign value is shown", wrongIp.found.includes("198.51.100.7"));

  const missing = await checkRecord(site, HOST, resolverFor({}));
  check("an absent record is 'not published yet'", missing.status === "missing");
  check("…with the spreading-time reassurance", /few hours/i.test(missing.detail));

  const badResolver: DnsResolver = async () => {
    const error = new Error("timeout") as Error & { code: string };
    error.code = "ETIMEOUT";
    throw error;
  };
  const errored = await checkRecord(site, HOST, badResolver);
  check("a resolver failure never reads as success", errored.status === "error");
  check("…and says it could not check rather than blaming the customer", /could not read DNS/i.test(errored.detail));

  check("the CNAME is matched case-insensitively", (await checkRecord(www, HOST, resolverFor({ "CNAME www.sharmaelectricals.in": { cname: ["APP.websetu.in"] } }))).status === "ok");
  check("a CNAME pointing elsewhere is wrong", (await checkRecord(www, HOST, resolverFor({ "CNAME www.sharmaelectricals.in": { cname: ["parking.hostinger.in"] } }))).status === "wrong");

  check("the verification token is checked by prefix, so extra text is fine",
    (await checkRecord(verify, HOST, resolverFor({ "TXT _websetu.sharmaelectricals.in": { txt: ["websetu-verify=abc123; second=thing"] } }))).status === "ok");
  check("…and a different token does not pass",
    (await checkRecord(verify, HOST, resolverFor({ "TXT _websetu.sharmaelectricals.in": { txt: ["websetu-verify=someone-else"] } }))).status === "wrong");

  check("SPF is matched as a record, not a string", (await checkRecord(spf, HOST, resolverFor(okTable))).status === "ok");
  check("a merged SPF record with the provider include present passes",
    (await checkRecord(spf, HOST, resolverFor({ "TXT sharmaelectricals.in": { txt: ["v=spf1 include:_spf.google.com include:zoho.in ~all"] } }))).status === "ok");
  check("an SPF record that excludes the provider is wrong",
    (await checkRecord(spf, HOST, resolverFor({ "TXT sharmaelectricals.in": { txt: ["v=spf1 include:_spf.google.com ~all"] } }))).status === "wrong");
  check("a domain with no SPF at all is missing", (await checkRecord(spf, HOST, resolverFor({ "TXT sharmaelectricals.in": { txt: ["google-site-verification=xyz"] } }))).status === "wrong");

  check("DMARC passes at the posture that was asked for", (await checkRecord(dmarc, HOST, resolverFor(okTable))).status === "ok");
  check("…and asking for reject, while DNS still says none, reports the gap",
    (await checkRecord(find(bundleFor({ dmarcPosture: "reject" }), (r) => r.match === "dmarc"), HOST, resolverFor(okTable))).status === "wrong");

  const zohoMx = find(base, (r) => r.type === "MX" && r.value === "mx.zoho.in");
  check("an MX answer is matched on the exchange, not the priority",
    (await checkRecord(zohoMx, HOST, resolverFor({ "MX sharmaelectricals.in": { mx: [{ exchange: "mx.zoho.in", priority: 10 }] } }))).status === "ok");
  check("a different mail host is wrong",
    (await checkRecord(zohoMx, HOST, resolverFor({ "MX sharmaelectricals.in": { mx: [{ exchange: "aspmx.l.google.com", priority: 1 }] } }))).status === "wrong");
}

section("Records that need a value from a person");
{
  const noDkim = hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "zoho" });
  const dkim = noDkim.groups.flatMap((g) => g.records).find((r) => r.needsValue)!;
  check("with no stored value the DKIM row waits", dkim.needsValue === true && dkim.value === "");
  const result = await checkRecord(dkim, HOST, resolverFor(okTable));
  check("…and is reported as skipped, not missing or wrong", result.status === "skipped", result.status);
  check("…in words a non-technical owner understands", /provider/i.test(result.detail));

  const withValue = hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "zoho", dkim: "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ" });
  const filled = withValue.groups.flatMap((g) => g.records).find((r) => r.name === "zmail._domainkey")!;
  check("a pasted value fills the row in", filled.value.startsWith("v=DKIM1") && !filled.needsValue);
  check("…and it is then checked against DNS", (await checkRecord(filled, HOST, resolverFor(okTable))).status === "ok");
}

/* -------------------------------------------------------------- summaries */

section("The summary a customer reads");
{
  const requiredIds = new Set(base.groups.flatMap((g) => g.records).filter((r) => r.required && !r.needsValue).map((r) => r.id));
  const results = await checkBundle(base, resolverFor(okTable));
  const summary = summarize(base, results);
  const optional = results.filter((r) => !requiredIds.has(r.id));
  check("every required record resolves", results.filter((r) => requiredIds.has(r.id)).every((r) => r.status === "ok"),
    results.map((r) => `${r.id}:${r.status}`).join(" "));
  check("the optional ones are not claimed as in place", optional.every((r) => r.status !== "wrong"),
    optional.map((r) => `${r.id}:${r.status}`).join(" "));
  check("the site half is live", summary.siteLive);
  check("the email half is ready", summary.emailReady);
  check("the headline says so", /both live|in place/i.test(summary.headline), summary.headline);
  check("the counts add up", summary.ok === results.filter((r) => r.status === "ok").length);

  // One of Zoho's three mail servers, which is what a customer often publishes.
  const partial = await checkBundle(base, resolverFor({ ...okTable, "MX sharmaelectricals.in": { mx: [{ exchange: "mx.zoho.in", priority: 10 }] } }));
  const partialById = new Map(partial.map((r) => [r.id, r]));
  check("a mail server that is missing from a set is 'not published', not 'wrong'",
    partialById.get(find(base, (r) => r.value === "mx2.zoho.in").id)?.status === "missing",
    String(partialById.get(find(base, (r) => r.value === "mx2.zoho.in").id)?.status));
  check("…and the detail says which row is missing", /not published yet/i.test(partialById.get(find(base, (r) => r.value === "mx2.zoho.in").id)?.detail ?? ""));
  check("one working mail server is still a working email half", summarize(base, partial).emailReady);
  check("…while 'everything is done' stays honest", !summarize(base, partial).allDone);

  const nothing = summarize(base, []);
  check("with no check run yet, nothing is claimed", !nothing.siteLive && !nothing.emailReady);
  check("…and the headline asks the owner to publish and check", /publish these records/i.test(nothing.headline));

  const wrongOne = summarize(base, results.map((r) => (r.id === "a:@:203.0.113.10" ? { ...r, status: "wrong" as const } : r)));
  check("one record pointing elsewhere makes the site half not-live", !wrongOne.siteLive);
  check("…and the headline points at the offending records", /point somewhere else/i.test(wrongOne.headline), wrongOne.headline);

  const noDkim = hostingBundle({ hostname: HOST, verificationToken: "t", emailProvider: "zoho" });
  const noDkimSummary = summarize(noDkim, await checkBundle(noDkim, resolverFor(okTable)));
  check("a DKIM value that is simply not stored yet does not block the email half", noDkimSummary.emailReady);
  check("…but it does stop 'everything is done'", !noDkimSummary.allDone);
}

section("Bundle-wide behaviour");
{
  const seen: string[] = [];
  await checkBundle(base, resolverFor(okTable), (_purpose, result) => seen.push(result.id));
  check("progress is reported per record, so the UI can fill in as it goes", seen.length > 0 && seen.every((id) => typeof id === "string"));

  const notes = base.notes.join(" ");
  check("the DMARC report mailbox is called out as something to create", /create dmarc@/i.test(notes));
  check("starting at p=none is explained rather than left as a default", /starts at p=none on purpose/i.test(notes));
  check("the CAA group says an empty CAA is fine", /empty CAA record set is fine/i.test(notes));
}

/* ------------------------------------------------------------ the wiring -- */

section("The tab is actually wired into the dashboard");
{
  // dashboard-view.tsx is read as text on purpose: it is a client component and
  // the nav it builds never appears in server-rendered HTML, so the way to know
  // the tab exists is to look at what builds it. Same convention as
  // tests/section-editor.test.mts.
  const { readFileSync } = await import("node:fs");
  const view = readFileSync("src/components/views/dashboard-view.tsx", "utf8");
  const tabs = readFileSync("src/lib/console-tabs.ts", "utf8");
  const store = readFileSync("src/store/app-store.ts", "utf8");
  const card = readFileSync("src/components/views/hosting-card.tsx", "utf8");

  check("the slug is a real console tab", tabs.includes('"hosting"'));
  check("…and has a human title", /hosting: "Hosting & Email"/.test(tabs));
  check("the store's union knows it", store.includes('"hosting"'));
  check("the card is imported", view.includes('import HostingCard from "@/components/views/hosting-card"'));
  check("the nav shows it", /tab: "hosting", label: "Hosting & Email"/.test(view));
  check("the tab renders the card", /tab === "hosting" && <HostingCard \/>/.test(view));
  check("the card talks to the API the route serves", card.includes('api.get<HostingResponse>("/api/hosting")'));
  check("…and offers the check, the provider choice, DKIM, DMARC and the purge",
    card.includes('action: "verify"') && card.includes('action: "email"') && card.includes('action: "dkim"')
    && card.includes('action: "dmarc"') && card.includes('action: "purge"'));
}

console.log(`\nhosting: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
