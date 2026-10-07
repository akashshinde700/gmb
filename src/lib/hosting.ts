// WebSetu — the hosting bundle: everything a customer's domain has to point at,
// in one place, checked against real DNS.
//
// A domain on this platform is not one record. It is four jobs at once, and a
// customer who does only the first one has a site that loads on their laptop,
// no email they can send from, and a certificate that may or may not be issued
// next week:
//
//   site          an A record on the bare domain, a CNAME on www
//   certificate   a CAA that does not contradict the certificate authority
//   verification  the TXT token that proves the domain is theirs (lib/domains.ts)
//   email         MX, SPF, DKIM and DMARC, so mail from the domain is signed,
//                 authorised, and not silently filed as spam
//
// The email half is the part hosting bundles sell and the part business owners
// get wrong most often — an SPF record that excludes the provider they actually
// send through, or no DMARC at all, is why a quotation lands in the spam folder.
// So this module plans the whole set for the mailbox provider the owner chose,
// says in plain English what each record does, and then *verifies* each one
// against DNS and reports what it actually found.
//
// Two rules, both deliberate:
//
//   · Nothing is invented. A DKIM key belongs to the mail server that will sign
//     the mail, so when the provider supplies it (Google, Zoho, Microsoft) the
//     record says "paste the value from your provider" instead of inventing a
//     key that would break the signature. When we are the mail host and no key
//     is configured on the server, the record says exactly that.
//   · A record that resolves to something else is reported as *wrong* with the
//     value found, never quietly as "waiting" — the customer's usual problem is
//     a record that exists and points somewhere else.
//
// Verification takes an injectable resolver so the whole state machine can be
// tested without a network, and so the platform can swap in a resolver with its
// own caching later.

import { promises as dns } from "node:dns";
import { dnsTarget, txtRecordName, txtRecordValue, checkHostname, platformHosts } from "@/lib/domains";

/* ------------------------------------------------------------------ types */

export type RecordPurpose = "site" | "certificate" | "verification" | "email";
export type RecordType = "A" | "CNAME" | "TXT" | "MX" | "CAA";

export interface DnsRecord {
  /** Stable key — the UI and the stored status map both hang off this. */
  id: string;
  purpose: RecordPurpose;
  type: RecordType;
  /** Relative label: "@", "www", "_dmarc", "selector1._domainkey". */
  name: string;
  /** What the record should say. Empty when the owner has to paste it. */
  value: string;
  /** MX only. */
  priority?: number;
  ttl: string;
  /** One plain sentence: what this record is for. */
  why: string;
  required: boolean;
  /**
   * True when the value comes from somewhere we cannot read: the owner's
   * mailbox provider console, or our own mail server's configuration.
   */
  needsValue?: boolean;
  /**
   * How `value` is compared against what DNS answers.
   *
   * "spf" and "dmarc" are their own modes because those two records are legal
   * to *merge*: an owner who already sends through their provider's webmail has
   * an SPF record with extra includes in it, and a strict comparison would call
   * a perfectly good record wrong. The mode asks for what matters — that it is
   * an SPF/DMARC record at all, and that it carries the parts we planned.
   */
  match?: "exact" | "prefix" | "contains" | "spf" | "dmarc";
  /**
   * True when this record shares its DNS name with its siblings — the rows of an
   * MX set, for instance. DNS answers per *name*, not per record, so when a
   * customer has published one of Zoho's three mail servers the other two are
   * "not published", not "wrong". Calling them wrong sends an owner hunting for a
   * mistake when their mail already works. An answer that contains none of the
   * set is still wrong — that is a different mail provider, not a partial list —
   * which is why `checkRecord` needs the siblings to tell the two apart.
   */
  shareable?: boolean;
}

export interface DnsGroup {
  purpose: RecordPurpose;
  title: string;
  /** What this group of records achieves, in one sentence. */
  blurb: string;
  records: DnsRecord[];
}

export interface BundleInput {
  hostname: string;
  /** The domain row's TXT token — see lib/domain-rules.ts. */
  verificationToken: string;
  /** Which mailbox provider the business uses. */
  emailProvider: EmailProviderKey;
  /**
   * DKIM value the owner pasted from their provider (or ours). Absent means the
   * record is shown with `needsValue` and is not checked.
   */
  dkim?: string;
  /** DMARC enforcement ladder; owners start at "none" and tighten later. */
  dmarcPosture?: DmarcPosture;
}

export interface HostingBundle {
  hostname: string;
  /** Where the site records point. Empty when the platform has no target set. */
  target: { host: string; ips: string[] };
  groups: DnsGroup[];
  /** Things that are true of the platform, not of this domain. */
  notes: string[];
}

/* --------------------------------------------------------------- providers */

export type EmailProviderKey = "platform" | "google" | "zoho" | "microsoft" | "none";
export type DmarcPosture = "none" | "quarantine" | "reject";

export interface EmailProvider {
  key: EmailProviderKey;
  label: string;
  /** One line the picker shows under the name. */
  blurb: string;
  /** MX rows: [priority, exchange]. `{domain}` is replaced with the hostname. */
  mx: readonly (readonly [number, string])[];
  /** Domains that must appear in the SPF include list. */
  spf: readonly string[];
  /**
   * How the provider's DKIM is published. A TXT with "paste the value" is the
   * common case; Microsoft publishes two CNAMEs instead.
   */
  dkim:
    | { kind: "txt"; name: string; hint: string }
    | { kind: "cname"; records: readonly { name: string; target: string }[]; hint: string };
  /** Extra record the provider wants (webmail, autodiscover…), optional. */
  extra?: readonly { name: string; type: RecordType; value: string; priority?: number; why: string }[];
  /** True for "no mailbox at this domain". */
  disabled?: boolean;
}

/**
 * The mailbox providers an Indian small business actually chooses between: our
 * own mailbox, Google Workspace, Zoho (cheapest and the usual pick here), and
 * Microsoft 365. "None" is a real choice — plenty of owners keep using a Gmail
 * address and only need the website half of the bundle.
 *
 * The MX and SPF values below are the providers' published settings, not
 * guesses: Google's five MX rows, Zoho's three (India data centre), Microsoft's
 * per-tenant exchange, our own mail host from the deployment's environment.
 */
export const EMAIL_PROVIDERS: Record<EmailProviderKey, EmailProvider> = {
  platform: {
    key: "platform",
    label: "WebSetu mailbox",
    blurb: "A mailbox on our mail server — the same server that sends your lead alerts.",
    mx: [[10, "mail.{domain}"]],
    spf: [],
    dkim: { kind: "txt", name: "mail._domainkey", hint: "Taken from the mail server's configuration by our team." },
    extra: [
      { name: "mail", type: "CNAME", value: "", priority: undefined, why: "Points mail.<your-domain> at our mail host — the name the MX row above delivers to." },
    ],
  },
  google: {
    key: "google",
    label: "Google Workspace",
    blurb: "Gmail on your own domain — the usual pick when the owner already lives in Gmail.",
    mx: [
      [1, "aspmx.l.google.com"],
      [5, "alt1.aspmx.l.google.com"],
      [5, "alt2.aspmx.l.google.com"],
      [10, "alt3.aspmx.l.google.com"],
      [10, "alt4.aspmx.l.google.com"],
    ],
    spf: ["_spf.google.com"],
    dkim: {
      kind: "txt",
      name: "google._domainkey",
      hint: "Google Admin console → Apps → Google Workspace → Gmail → Authenticate email. It gives you a TXT value.",
    },
  },
  zoho: {
    key: "zoho",
    label: "Zoho Mail",
    blurb: "The economical one, and the one businesses in India pick most often.",
    mx: [
      [10, "mx.zoho.in"],
      [20, "mx2.zoho.in"],
      [50, "mx3.zoho.in"],
    ],
    spf: ["zoho.in"],
    dkim: {
      kind: "txt",
      name: "zmail._domainkey",
      hint: "Zoho Mail admin → Email authentication → DKIM. It gives you a TXT value with a selector.",
    },
  },
  microsoft: {
    key: "microsoft",
    label: "Microsoft 365",
    blurb: "Outlook on your own domain, with the Office apps.",
    mx: [[0, "{domain}.mail.protection.outlook.com"]],
    spf: ["spf.protection.outlook.com"],
    dkim: {
      kind: "cname",
      records: [
        { name: "selector1._domainkey", target: "selector1-{domain-dashed}._domainkey.{tenant}" },
        { name: "selector2._domainkey", target: "selector2-{domain-dashed}._domainkey.{tenant}" },
      ],
      hint: "Microsoft 365 admin → Settings → Domains → DNS records. It shows your tenant hostname for each selector.",
    },
    extra: [
      { name: "autodiscover", type: "CNAME", value: "autodiscover.outlook.com", why: "Lets Outlook and phones set the mailbox up by typing only the address." },
    ],
  },
  none: {
    key: "none",
    label: "No business mailbox yet",
    blurb: "Website only. Enquiries still reach you by phone, WhatsApp and the dashboard.",
    mx: [],
    spf: [],
    dkim: { kind: "txt", name: "mail._domainkey", hint: "" },
    disabled: true,
  },
};

export const EMAIL_PROVIDER_KEYS = Object.keys(EMAIL_PROVIDERS) as EmailProviderKey[];

export function isEmailProvider(value: unknown): value is EmailProviderKey {
  return typeof value === "string" && (EMAIL_PROVIDER_KEYS as string[]).includes(value);
}

export function isDmarcPosture(value: unknown): value is DmarcPosture {
  return value === "none" || value === "quarantine" || value === "reject";
}

/* ------------------------------------------------------------------ values */

const DMARC_ORDER: DmarcPosture[] = ["none", "quarantine", "reject"];

/** What the SPF record should say, given provider and (optionally) our mail host. */
export function spfValue(input: { provider: EmailProvider; mailHost?: string }): string {
  const includes = [
    ...input.provider.spf,
    ...(input.provider.key === "platform" && input.mailHost ? [input.mailHost] : []),
  ];
  // "~all" rather than "-all": a soft fail tells receivers to be suspicious
  // without discarding mail that a salesperson sent through their provider's
  // webmail on a phone, which is exactly the mail a small business cannot lose.
  return includes.length ? `v=spf1 ${includes.map((i) => `include:${i}`).join(" ")} ~all` : "";
}

export function dmarcValue(input: { hostname: string; posture: DmarcPosture }): string {
  // fo=1 asks for a report whenever *either* SPF or DKIM fails, which is what
  // makes the first week's reports useful; rua points at the domain itself so
  // reports never leave the customer's own namespace.
  return `v=DMARC1; p=${input.posture}; fo=1; rua=mailto:dmarc@${input.hostname}; adkim=r; aspf=r`;
}

/** The mail host our own mail server publishes records for. */
export function mailHost(): string {
  return (process.env.MAIL_HOST || "").trim().toLowerCase();
}

/**
 * The certificate authority that will issue this domain's certificate.
 *
 * Only used to build an optional CAA record, and only from configuration —
 * naming a CA we do not use would block the certificate instead of protecting
 * it, so with nothing configured the whole CAA group is left out and the note
 * explains why an empty CAA is fine.
 */
export function certificateAuthority(): string {
  return (process.env.SSL_ISSUER_CA || "").trim() || "letsencrypt.org";
}

/* --------------------------------------------------------------- the bundle */

function record(name: string, type: RecordType, value: string, why: string, extra: Partial<DnsRecord> = {}): DnsRecord {
  return {
    // Keyed by what the record says, not by its position: Google publishes two
    // MX rows at priority 5, and a position-based key would have merged them
    // into one row the customer could only see half of.
    id: `${type}:${name}:${value || extra.priority || ""}`.toLowerCase(),
    purpose: "site",
    type,
    name,
    value,
    ttl: "Auto",
    why,
    required: true,
    ...extra,
  };
}

/**
 * Every DNS record this domain needs, grouped by what it achieves.
 *
 * Pure and deterministic: same input, same list, in the same order — the panel
 * is read by a person with a registrar's DNS page open in the next tab, so the
 * order only ever changes when the records do.
 */
export function hostingBundle(input: BundleInput): HostingBundle {
  const hostname = input.hostname.trim().toLowerCase().replace(/\.$/, "");
  const provider = EMAIL_PROVIDERS[input.emailProvider] ?? EMAIL_PROVIDERS.none;
  const posture: DmarcPosture = input.dmarcPosture ?? "none";
  const target = dnsTarget();
  const notes: string[] = [];

  const site: DnsRecord[] = [];
  if (target.ips.length) {
    for (const ip of target.ips) {
      site.push(record("@", "A", ip, "Points your bare domain at our server.", {
        purpose: "site", match: "exact", ttl: "1 hour",
      }));
    }
  }
  if (target.host) {
    site.push(record("www", "CNAME", target.host, "Points www at the platform; this is the record that survives us moving servers.", {
      purpose: "site", match: "exact", ttl: "1 hour",
    }));
  }
  if (!site.length) {
    notes.push("The platform has no DNS target configured yet, so there are no site records to publish. Ask us to finish the server setup.");
  }

  const token = (input.verificationToken || "").trim();
  const verification: DnsRecord[] = [
    record("_websetu", "TXT", token ? txtRecordValue(token) : "", "Proves the domain is yours before we serve it — the full name is " + (hostname ? txtRecordName(hostname) : "_websetu.your-domain").toString() + ".", {
      purpose: "verification", match: "prefix", ttl: "Auto", needsValue: !token,
    }),
  ];
  if (!hostname) {
    notes.push("Add a domain first — there is nothing to publish records for yet.");
  }

  const certificate: DnsRecord[] = [
    record("@", "CAA", `0 issue "${certificateAuthority()}"`, "Allows our certificate authority to issue for this domain. Skip it if your DNS already has CAA records; a conflicting CAA blocks the certificate.", {
      purpose: "certificate", match: "contains", required: false, ttl: "1 hour",
    }),
    record("@", "CAA", `0 issuewild "${certificateAuthority()}"`, "The same permission for wildcard names — only needed if you add sub-domains.", {
      purpose: "certificate", match: "contains", required: false, ttl: "1 hour",
    }),
  ];
  notes.push("An empty CAA record set is fine — your certificate is issued anyway. Only add these if you want to name us explicitly.");

  const email: DnsRecord[] = [];
  if (provider.disabled) {
    notes.push("No business mailbox selected. Pick one and the MX, SPF, DKIM and DMARC records appear here — that is the half that keeps your quotations out of spam.");
  } else {
    for (const [priority, exchange] of provider.mx) {
      email.push(record("@", "MX", exchange.replaceAll("{domain}", hostname), "Tells the internet where to deliver mail for your domain.", {
        purpose: "email", priority, match: "exact", required: true, shareable: true,
      }));
    }

    // SPF. Only one SPF record may exist per domain, so the note says to merge
    // rather than add a second one — two SPF records make receivers ignore both.
    const spf = spfValue({ provider, mailHost: provider.key === "platform" ? mailHost() || undefined : undefined });
    if (spf) {
      email.push(record("@", "TXT", spf, "Lists the servers allowed to send mail as your domain. If you already have an SPF record, merge the include: parts into it — a domain with two SPF records has none.", {
        purpose: "email", match: "spf", required: true,
      }));
    } else if (provider.key === "platform") {
      notes.push("Our mail host is not configured on this deployment yet, so the SPF include for the WebSetu mailbox cannot be written. The MX row still points at mail.<your-domain>, which is where our mail server should live.");
    }

    // DKIM.
    if (provider.dkim.kind === "txt") {
      const stored = (input.dkim || "").trim().replace(/^"|"$/g, "");
      email.push(record(provider.dkim.name, "TXT", stored, stored
        ? "Signs your outgoing mail, so receivers can prove it really came from you. This is the value you pasted."
        : provider.dkim.hint || "Signs your outgoing mail so receivers can prove it came from you.", {
        purpose: "email", match: "contains", required: false, needsValue: !stored,
      }));
    } else {
      const tenant = tenantHost();
      for (const row of provider.dkim.records) {
        const value = tenant
          ? row.target.replaceAll("{domain-dashed}", hostname.replaceAll(".", "-")).replaceAll("{tenant}", tenant)
          : "";
        email.push(record(row.name, "CNAME", value, value
          ? "Signs your outgoing mail, so receivers can prove it really came from you."
          : "Points into your Microsoft tenant to sign your mail. Paste the tenant hostname below.", {
          purpose: "email", match: "exact", required: false, needsValue: !value,
        }));
      }
      if (!tenant) {
        notes.push(`Paste your Microsoft tenant hostname (the …onmicrosoft.com one) in the DKIM box and these two CNAMEs fill themselves in. ${provider.dkim.hint}`);
      }
    }

    for (const extra of provider.extra ?? []) {
      const value = extra.value || (extra.name === "mail" ? mailHost() : "");
      const isMxTarget = provider.key === "platform" && extra.name === "mail";
      email.push(record(extra.name, extra.type, value, value ? extra.why : `${extra.why} Ask us for the mail host, or point it at your own mail server.`, {
        purpose: "email",
        priority: extra.priority,
        match: "exact",
        // For our own mailbox this record is the one the MX row above depends
        // on: mail goes nowhere without it.
        required: isMxTarget,
        needsValue: !value,
      }));
    }

    email.push(record("_dmarc", "TXT", dmarcValue({ hostname, posture }), dmarcWhy(posture), {
      purpose: "email", match: "dmarc", required: false,
    }));
    if (posture === "none") {
      notes.push("DMARC starts at p=none on purpose: it reports without blocking anything. After a week or two of clean reports, tighten it to quarantine and then reject in this panel.");
    }
    notes.push("The dmarc report address is a mailbox at your own domain. Create dmarc@ or change the rua value — reports sent to a mailbox that does not exist are simply lost.");
  }

  const groups: DnsGroup[] = [
    {
      purpose: "site", title: "Your website",
      blurb: "These two records are what make the domain open your site.",
      records: site,
    },
    {
      purpose: "verification", title: "Proof of ownership",
      blurb: "One TXT record, so nobody else can point your domain at their site.",
      records: verification,
    },
    {
      purpose: "certificate", title: "HTTPS certificate",
      blurb: "Optional CAA records; HTTPS is issued for a verified domain either way.",
      records: certificate,
    },
    {
      purpose: "email", title: `Business email — ${provider.label}`,
      blurb: provider.disabled
        ? "Nothing to publish yet — a website does not need MX records."
        : "Mail delivery, and the three records that keep your mail out of the spam folder.",
      records: email,
    },
  ];

  return { hostname, target, groups, notes };
}

/** The tenant hostname for Microsoft DKIM CNAMEs, from configuration. */
function tenantHost(): string {
  return (process.env.MAIL_TENANT_HOST || "").trim().toLowerCase();
}

function dmarcWhy(posture: DmarcPosture): string {
  const next = DMARC_ORDER[DMARC_ORDER.indexOf(posture) + 1];
  const base =
    posture === "none"
      ? "Tells receivers to report forged mail from your domain without blocking anything yet."
      : posture === "quarantine"
        ? "Sends mail that fails authentication to the spam folder instead of the inbox."
        : "Rejects mail that fails authentication outright. The strongest setting — move here only after a week of clean reports.";
  return next ? `${base} ${next} is the next step up when the reports come back clean.` : base;
}

/* ----------------------------------------------------------- verification */

export interface LookupAnswer {
  cname: string[];
  a: string[];
  txt: string[];
  mx: { exchange: string; priority: number }[];
  caa: { tag: string; value: string }[];
}

/** Injectable so tests (and a caching deployment) can replace node's resolver. */
export interface DnsResolver {
  (record: { type: RecordType; fqdn: string }): Promise<Partial<LookupAnswer>>;
}

export type RecordStatus = "ok" | "wrong" | "missing" | "skipped" | "error";

export interface RecordResult {
  id: string;
  status: RecordStatus;
  /** What DNS actually answered, flattened for display. */
  found: string[];
  /** One line for the customer. */
  detail: string;
}

/** The FQDN a record lives at: "@" is the domain itself, everything else is a label under it. */
export function fqdnFor(hostname: string, name: string): string {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (!name || name === "@") return host;
  const label = name.replace(/\.$/, "").toLowerCase();
  return label.endsWith(host) ? label : `${label}.${host}`;
}

function flatten(answer: Partial<LookupAnswer>): string[] {
  return [
    ...(answer.cname ?? []),
    ...(answer.a ?? []),
    ...(answer.txt ?? []).map((t) => (t.length > 120 ? `${t.slice(0, 117)}…` : t)),
    ...(answer.mx ?? []).map((m) => `${m.priority} ${m.exchange}`),
    ...(answer.caa ?? []).map((c) => `${c.tag}:${c.value}`),
  ];
}

function matches(record: DnsRecord, answer: Partial<LookupAnswer>): boolean {
  const want = record.value.trim().toLowerCase();
  const txts = (answer.txt ?? []).map((t) => t.trim().toLowerCase());
  const cnames = (answer.cname ?? []).map((c) => c.trim().toLowerCase().replace(/\.$/, ""));
  const as = (answer.a ?? []).map((a) => a.trim());
  const mxs = answer.mx ?? [];
  const caas = answer.caa ?? [];

  switch (record.type) {
    case "A":
      return as.includes(want);
    case "CNAME":
      return cnames.length > 0 && cnames.some((c) => c === want || want.endsWith(`.${c}`) || c.endsWith(`.${want}`));
    case "MX":
      return mxs.some((m) => m.exchange.toLowerCase().replace(/\.$/, "") === want.replace(/\.$/, ""));
    case "CAA":
      // "0 issue \"letsencrypt.org\"" — the customer's record may name several
      // authorities; ours counts as satisfied when the one we use is among them.
      return caas.some((c) =>
        c.value.toLowerCase().includes((want.match(/"([^"]+)"/)?.[1] ?? want).toLowerCase()),
      );
    case "TXT": {
      if (!txts.length) return false;
      if (record.match === "spf") {
        const wanted = (want.match(/include:[^\s]+/g) ?? []).map((i) => i.trim());
        if (!wanted.length) return txts.some((t) => t.startsWith("v=spf1"));
        return txts.some((t) => t.startsWith("v=spf1") && wanted.every((i) => t.includes(i)));
      }
      if (record.match === "dmarc") {
        const posture = want.match(/p=(none|quarantine|reject)/)?.[1] ?? "";
        return txts.some((t) => t.startsWith("v=dmarc1") && (!posture || t.includes(`p=${posture}`)));
      }
      if (record.match === "prefix") {
        const head = want.split(";")[0].split(" ")[0].toLowerCase();
        return head ? txts.some((t) => t.startsWith(head)) : txts.length > 0;
      }
      if (record.match === "contains") {
        const needle = want.slice(0, 32);
        return needle ? txts.some((t) => t.includes(needle) || needle.includes(t)) : txts.length > 0;
      }
      return txts.some((t) => t === want);
    }
    default:
      return false;
  }
}

/**
 * Check one record against real DNS.
 *
 * "missing" and "error" are deliberately different: no record yet is the normal
 * state while a customer is still at their registrar, while a resolver timeout
 * or a SERVFAIL is us not being able to tell — and telling somebody their DNS is
 * wrong because our lookup failed is worse than saying we could not check.
 */
export async function checkRecord(
  record: DnsRecord,
  hostname: string,
  resolve: DnsResolver,
  /** The records that share this record's DNS name, when there are any. */
  siblings: readonly DnsRecord[] = [],
): Promise<RecordResult> {
  if (record.needsValue || (!record.value && record.required)) {
    return {
      id: record.id, status: "skipped", found: [],
      detail: record.needsValue
        ? "Waiting for the value from your mail provider."
        : "Waiting for the value from us.",
    };
  }

  const fqdn = fqdnFor(hostname, record.name);
  let answer: Partial<LookupAnswer>;
  try {
    answer = await resolve({ type: record.type, fqdn });
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NODATA") {
      return { id: record.id, status: "missing", found: [], detail: `No ${record.type} record at ${fqdn} yet — changes can take a few hours to spread.` };
    }
    return { id: record.id, status: "error", found: [], detail: `We could not read DNS for ${fqdn} just now (${code || "lookup failed"}). Try again in a few minutes.` };
  }

  const found = flatten(answer);
  if (!found.length) {
    return { id: record.id, status: "missing", found: [], detail: `No ${record.type} record at ${fqdn} yet — changes can take a few hours to spread.` };
  }
  if (matches(record, answer)) {
    return { id: record.id, status: "ok", found, detail: record.type === "MX" ? "Delivering mail as expected." : "Found, exactly as asked." };
  }
  if (record.shareable && siblings.some((s) => s.id !== record.id && s.name === record.name && s.type === record.type && matches(s, answer))) {
    // The name answered with part of the set: the customer published a subset.
    return {
      id: record.id, status: "missing", found: found.slice(0, 4),
      detail: `${fqdn} currently answers ${found.slice(0, 2).join(", ")}${found.length > 2 ? " …" : ""} — this row of the set is not published yet.`,
    };
  }
  return {
    id: record.id, status: "wrong", found,
    detail: `${fqdn} answers ${found.slice(0, 2).join(", ")}${found.length > 2 ? " …" : ""}, but this record should say ${record.value || "(a value from your provider)"}.`,
  };
}

/** Check every record in a bundle. Sequential on purpose: a burst of lookups at
 *  a small DNS host is how verification starts failing for everybody. */
export async function checkBundle(
  bundle: HostingBundle,
  resolve: DnsResolver,
  onProgress?: (purpose: RecordPurpose, result: RecordResult) => void,
): Promise<RecordResult[]> {
  const out: RecordResult[] = [];
  for (const group of bundle.groups) {
    for (const rec of group.records) {
      const result = await checkRecord(rec, bundle.hostname, resolve, group.records);
      out.push(result);
      onProgress?.(group.purpose, result);
    }
  }
  return out;
}

/* -------------------------------------------------------------- summaries */

export interface BundleSummary {
  total: number;
  ok: number;
  /** Required records only — a skipped optional record is not a failure. */
  pending: number;
  wrong: number;
  missing: number;
  errors: number;
  /** The website half: site records published, and the domain verified. */
  siteLive: boolean;
  /** The email half: a mail server answers and SPF authorises it. DKIM and DMARC can follow. */
  emailReady: boolean;
  /** Everything that has to exist exists. */
  allDone: boolean;
  /** One line for the top of the panel. */
  headline: string;
}

export function summarize(bundle: HostingBundle, results: readonly RecordResult[]): BundleSummary {
  const byId = new Map(results.map((r) => [r.id, r]));
  const records = bundle.groups.flatMap((g) => g.records);
  let ok = 0, pending = 0, wrong = 0, missing = 0, errors = 0;

  for (const rec of records) {
    const result = byId.get(rec.id);
    if (!result || result.status === "skipped") {
      if (rec.required) pending++;
      continue;
    }
    if (result.status === "ok") ok++;
    else if (result.status === "wrong") wrong++;
    else if (result.status === "missing") missing++;
    else if (result.status === "error") errors++;
  }

  const emailRecords = bundle.groups.find((g) => g.purpose === "email")?.records ?? [];
  const siteRecords = bundle.groups.find((g) => g.purpose === "site")?.records ?? [];
  const siteLive = siteRecords.length > 0 && siteRecords.every((r) => byId.get(r.id)?.status === "ok");
  // Delivery works when *a* mail server answers and the SPF record authorises
  // it. The secondary MX rows are redundancy: publishing one of Zoho's three
  // still delivers mail, so it is not a reason to say the email half is broken —
  // it does keep "everything is done" honest, which is what allDone is for.
  const mxOne = emailRecords.some((r) => r.type === "MX" && byId.get(r.id)?.status === "ok");
  const spfOk = emailRecords.filter((r) => r.match === "spf").every((r) => byId.get(r.id)?.status === "ok");
  const emailReady = emailRecords.length === 0 || (mxOne && spfOk);

  const headline = !records.length
    ? "Add a domain and pick a mailbox provider — the records will appear here."
    : siteLive && emailReady
      ? "Everything is in place — your site and your email are both live on this domain."
      : siteLive
        ? "Your website is live on this domain. The email records are still being set up."
        : pending && !results.length
          ? "Publish these records at your registrar, then check them here."
          : wrong
            ? "Some records exist but point somewhere else — fix the ones marked below."
            : "Some records are not published yet. They usually go live within a few hours.";

  return { total: records.length, ok, pending, wrong, missing, errors, siteLive, emailReady, allDone: ok >= records.length, headline };
}

/* --------------------------------------------------------------- resolver */

/**
 * The default resolver: node's DNS with each record type asked for its own way.
 *
 * `resolve4` follows CNAME chains, so an apex with a CNAME at the registrar
 * still answers; a missing type throws with ENODATA/ENOTFOUND, which the caller
 * reads as "not published yet".
 */
export const nodeResolver: DnsResolver = async ({ type, fqdn }) => {
  switch (type) {
    case "A":
      return { a: await dns.resolve4(fqdn) };
    case "CNAME":
      return { cname: await dns.resolveCname(fqdn) };
    case "TXT":
      return { txt: (await dns.resolveTxt(fqdn)).map((parts) => parts.join("")) };
    case "MX":
      return { mx: await dns.resolveMx(fqdn) };
    case "CAA": {
      // node's CAA record is { critical, issue?, issuewild?, iodef? } — the tag
      // is which of those is set, so it is normalised into tag/value here.
      const rows = await dns.resolveCaa(fqdn);
      return {
        caa: rows.map((row) => ({
          tag: row.issue ? "issue" : row.issuewild ? "issuewild" : "iodef",
          value: row.issue ?? row.issuewild ?? row.iodef ?? "",
        })),
      };
    }
    default:
      return {};
  }
};

/* ------------------------------------------------------------- guardrails */

export interface HostingTargetCheck {
  ok: boolean;
  /** Why not, in the owner's words. */
  error: string;
}

/**
 * A domain row must exist and must not be one of our own hostnames before there
 * is any bundle to plan. Platform hostnames are refused by name, not by
 * heuristic: publishing MX records on the platform's own domain would stop our
 * own mail.
 */
export function checkHostingTarget(hostname: string): HostingTargetCheck {
  const check = checkHostname(hostname);
  if (!check.ok) return { ok: false, error: check.error ?? "That does not look like a domain." };
  const host = check.hostname;
  if (platformHosts().includes(host)) {
    return { ok: false, error: "That is this platform's own domain — its DNS is ours to look after." };
  }
  return { ok: true, error: "" };
}
