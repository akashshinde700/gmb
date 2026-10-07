import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, HttpError, limitSubjectOrThrow, ok, readJson, requireBusiness, requireUser, route, str } from "@/lib/api";
import { mailConfigured } from "@/lib/mailer";
import {
  checkBundle, checkHostingTarget, EMAIL_PROVIDER_KEYS, EMAIL_PROVIDERS, hostingBundle,
  isDmarcPosture, isEmailProvider, nodeResolver, summarize,
  type DmarcPosture, type EmailProviderKey, type RecordResult, type RecordPurpose,
} from "@/lib/hosting";

export const runtime = "nodejs";

/**
 * The hosting bundle for one business — see lib/hosting.ts.
 *
 * GET  /api/hosting          the record set, the last check, and platform facts
 * POST /api/hosting          action: verify | email | dkim | dmarc | purge
 *
 * The settings live in `Setting` under `hosting:<businessId>` rather than in new
 * columns: which mailbox provider a business uses, the DKIM value they pasted,
 * their DMARC posture, and the result of the last check are all things the
 * product reads one at a time and never queries across customers, so a JSON
 * setting keeps the schema where it belongs — on the things we report on.
 */

interface HostingSettings {
  emailProvider: EmailProviderKey;
  /** DKIM value from the provider's console, or the Microsoft tenant host. */
  dkim: string;
  dmarcPosture: DmarcPosture;
  lastCheck?: { at: string; results: RecordResult[]; headline: string };
}

const DEFAULT_SETTINGS: HostingSettings = { emailProvider: "none", dkim: "", dmarcPosture: "none" };

function settingsKey(businessId: string): string {
  return `hosting:${businessId}`;
}

async function readSettings(businessId: string): Promise<HostingSettings> {
  const row = await db.setting.findUnique({ where: { key: settingsKey(businessId) } });
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value || "{}") as Partial<HostingSettings>;
    return {
      emailProvider: isEmailProvider(parsed.emailProvider) ? parsed.emailProvider : DEFAULT_SETTINGS.emailProvider,
      dkim: typeof parsed.dkim === "string" ? parsed.dkim : "",
      dmarcPosture: isDmarcPosture(parsed.dmarcPosture) ? parsed.dmarcPosture : DEFAULT_SETTINGS.dmarcPosture,
      lastCheck: parsed.lastCheck,
    };
  } catch {
    // Unreadable settings must not take the tab down; they fall back to fresh.
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeSettings(businessId: string, settings: HostingSettings) {
  const value = JSON.stringify(settings);
  await db.setting.upsert({
    where: { key: settingsKey(businessId) },
    update: { value },
    create: { key: settingsKey(businessId), value },
  });
}

/** The domain this bundle is for: the primary one, else the oldest. */
async function bundleDomain(businessId: string) {
  return (
    (await db.domain.findFirst({ where: { businessId, primary: true } })) ??
    (await db.domain.findFirst({ where: { businessId }, orderBy: { createdAt: "asc" } }))
  );
}

async function payload(businessId: string) {
  const settings = await readSettings(businessId);
  const domain = await bundleDomain(businessId);

  if (!domain) {
    return {
      domain: null,
      settings: { emailProvider: settings.emailProvider, dkim: settings.dkim, dmarcPosture: settings.dmarcPosture },
      bundle: null,
      statuses: [] as RecordResult[],
      summary: null,
      lastCheckAt: settings.lastCheck?.at ?? null,
      platform: {
        mailerConfigured: mailConfigured(),
        providers: EMAIL_PROVIDER_KEYS.map((key) => ({
          key, label: EMAIL_PROVIDERS[key].label, blurb: EMAIL_PROVIDERS[key].blurb,
        })),
      },
    };
  }

  const bundle = hostingBundle({
    hostname: domain.hostname,
    verificationToken: domain.token,
    emailProvider: settings.emailProvider,
    dkim: settings.dkim,
    dmarcPosture: settings.dmarcPosture,
  });
  const statuses = settings.lastCheck?.results ?? [];

  return {
    domain: {
      id: domain.id,
      hostname: domain.hostname,
      status: domain.status,
      verifiedAt: domain.verifiedAt?.toISOString() ?? null,
      lastError: domain.lastError,
    },
    settings: { emailProvider: settings.emailProvider, dkim: settings.dkim, dmarcPosture: settings.dmarcPosture },
    bundle,
    statuses,
    summary: statuses.length ? summarize(bundle, statuses) : null,
    lastCheckAt: settings.lastCheck?.at ?? null,
    platform: {
      mailerConfigured: mailConfigured(),
      providers: EMAIL_PROVIDER_KEYS.map((key) => ({
        key, label: EMAIL_PROVIDERS[key].label, blurb: EMAIL_PROVIDERS[key].blurb,
      })),
    },
  };
}

export const GET = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  return ok(await payload(business.id));
});

export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  const business = await requireBusiness(session);
  const body = await readJson<Record<string, unknown>>(req);
  const action = str(body.action, 20);

  if (action === "verify") {
    // DNS is somebody else's server: twelve lookups per press, and a person who
    // presses the button twenty times a minute is watching a spinner, not DNS.
    limitSubjectOrThrow(`hosting:verify:${business.id}`, 20, 10 * 60 * 1000);

    const settings = await readSettings(business.id);
    const domain = await bundleDomain(business.id);
    if (!domain) throw new HttpError("Add a domain in Settings first — there is nothing to check yet.");

    const guard = checkHostingTarget(domain.hostname);
    if (!guard.ok) throw new HttpError(guard.error);

    const bundle = hostingBundle({
      hostname: domain.hostname,
      verificationToken: domain.token,
      emailProvider: settings.emailProvider,
      dkim: settings.dkim,
      dmarcPosture: settings.dmarcPosture,
    });

    const results = await checkBundle(bundle, nodeResolver);
    const summary = summarize(bundle, results);
    await writeSettings(business.id, {
      ...settings,
      lastCheck: { at: new Date().toISOString(), results, headline: summary.headline },
    });
    await audit({
      actor: session.email,
      action: "hosting.verify",
      entity: "business",
      entityId: business.id,
      meta: { hostname: domain.hostname, ok: summary.ok, total: summary.total },
    });

    return ok({ bundle, statuses: results, summary, lastCheckAt: new Date().toISOString() });
  }

  if (action === "email") {
    const provider = str(body.provider, 20);
    if (!isEmailProvider(provider)) {
      throw new HttpError(`Unknown mailbox provider — pick one of ${EMAIL_PROVIDER_KEYS.join(", ")}`);
    }
    const settings = await readSettings(business.id);
    // A previous provider's DKIM value is not this one's: keeping it would have
    // the panel claim a signature record is in place that the new provider never
    // issued.
    await writeSettings(business.id, { ...settings, emailProvider: provider, dkim: "" });
    await audit({ actor: session.email, action: "hosting.email", entity: "business", entityId: business.id, meta: { provider } });
    return ok(await payload(business.id));
  }

  if (action === "dkim") {
    const value = str(body.value, 500).trim().replace(/^"|"$/g, "");
    const settings = await readSettings(business.id);
    await writeSettings(business.id, { ...settings, dkim: value });
    return ok(await payload(business.id));
  }

  if (action === "dmarc") {
    const posture = str(body.posture, 20);
    if (!isDmarcPosture(posture)) throw new HttpError("DMARC has three settings: none, quarantine or reject");
    const settings = await readSettings(business.id);
    await writeSettings(business.id, { ...settings, dmarcPosture: posture });
    await audit({ actor: session.email, action: "hosting.dmarc", entity: "business", entityId: business.id, meta: { posture } });
    return ok(await payload(business.id));
  }

  if (action === "purge") {
    // The edge cache. Nothing here touches the database: the site is rebuilt from
    // the same rows it was built from a moment ago, and the customer sees their
    // own edit immediately instead of within the five-minute window.
    limitSubjectOrThrow(`hosting:purge:${business.id}`, 12, 10 * 60 * 1000);
    revalidatePath(`/s/${business.slug}`);
    revalidatePath(`/s/${business.slug}/order`);
    await audit({ actor: session.email, action: "hosting.purge", entity: "business", entityId: business.id, meta: { slug: business.slug } });
    return ok({ purged: true, at: new Date().toISOString(), paths: [`/s/${business.slug}`] });
  }

  throw new HttpError(`Unknown action "${action}" — expected one of verify, email, dkim, dmarc, purge`, 400);
});

/** Purposes, exported for the dashboard's group icons without a second source. */
export type { RecordPurpose };
