#!/usr/bin/env node
/**
 * Design-time only. Generates brand palettes with Google Stitch and prints them
 * ready to paste into src/lib/variants.ts.
 *
 * Stitch is NOT called when a customer signs up: it takes 30-90s per design and
 * burns a metered credit, which at thousands of businesses would be both slow
 * and impossible to pay for — and a credit failure mid-signup would leave a
 * customer with no website. So it is used here instead, once, to design the
 * palettes that every customer then draws from instantly and for free.
 *
 * Keys live in stitch-keys.local.json (gitignored), never in the repo or on the
 * server:
 *
 *   { "keys": ["AQ.xxx", "AQ.yyy", ...] }
 *
 * Run:  node tools/stitch-palettes.mjs fitness food retail
 *       node tools/stitch-palettes.mjs --all
 *       node tools/stitch-palettes.mjs --all --dry     (print, write nothing)
 *
 * By default it writes src/lib/stitch-designs.ts, which the server reads on the
 * next build — so the designs reach the product without anyone copying hex
 * codes by hand. `--dry` keeps the old print-only behaviour.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_MCP = "https://stitch.googleapis.com/mcp";
const PER_INDUSTRY = Number(process.env.PER_INDUSTRY || 3);

const BRIEFS = {
  transport: "a trucking and logistics company",
  travel: "a travel and tour operator",
  "building-materials": "a cement, steel and tiles supplier",
  construction: "a building contractor",
  "real-estate": "an estate agency selling homes",
  manufacturing: "a factory supplying products in bulk",
  beverage: "a packaged drinking water brand",
  food: "a neighbourhood restaurant",
  hotel: "a comfortable mid-range hotel",
  healthcare: "a family medical clinic",
  dental: "a modern dental clinic",
  beauty: "a hair and beauty salon",
  fitness: "a strength and fitness gym",
  professional: "a chartered accountancy and legal practice",
  education: "a school and coaching institute",
  tech: "a software development company",
  automotive: "a car service garage",
  events: "a wedding photography and events company",
  interior: "an interior design studio",
  "home-services": "an electrician and plumbing service",
  agriculture: "an agricultural seeds and fertiliser supplier",
  retail: "a neighbourhood retail shop",
  general: "a trusted local business",
};

const keys = (() => {
  try {
    const raw = JSON.parse(readFileSync(resolve(ROOT, "stitch-keys.local.json"), "utf8"));
    return (raw.keys ?? []).filter(Boolean);
  } catch {
    console.error("Put your keys in stitch-keys.local.json first:\n  { \"keys\": [\"AQ.…\", \"AQ.…\"] }");
    process.exit(1);
  }
})();

let keyAt = 0;

/**
 * Keys fail for two very different reasons, and treating them the same wastes
 * most of the daily allowance.
 *
 *   broken  — bad key, no permission. Never worth trying again.
 *   waiting — today's free credits are spent. Stitch tops them up daily, so the
 *             key comes back; it is only resting, not dead.
 *
 * A rested key is retried once its cooldown passes, which matters on a long run
 * that outlives the quota reset.
 */
const broken = new Set();
const waiting = new Map(); // key index -> timestamp it may be tried again
const COOLDOWN_MS = Number(process.env.KEY_COOLDOWN_MS || 45 * 60 * 1000);

const usable = (i) => !broken.has(i) && (waiting.get(i) ?? 0) <= Date.now();

function rest(i, why) {
  waiting.set(i, Date.now() + COOLDOWN_MS);
  const mins = Math.round(COOLDOWN_MS / 60000);
  console.error(`  key #${i + 1} out of credits (${why}) — resting ${mins}m, trying the next one`);
}

function retire(i, why) {
  broken.add(i);
  console.error(`  key #${i + 1} unusable (${why}) — not trying it again`);
}

/** Next key worth trying, or null when every key is broken or resting. */
function nextKey() {
  for (let step = 0; step < keys.length; step++) {
    const i = (keyAt + step) % keys.length;
    if (usable(i)) return i;
  }
  return null;
}

/** One call, moving to the next key when this one is out of credit. */
async function rpc(method, params, { timeout = 240_000 } = {}) {
  for (let tries = 0; tries < keys.length * 2; tries++) {
    const idx = nextKey();
    if (idx === null) {
      const soonest = Math.min(...[...waiting.values()], Infinity);
      if (!Number.isFinite(soonest)) throw new Error("every key is unusable");
      const wait = Math.max(5_000, soonest - Date.now());
      console.error(`  all keys resting — waiting ${Math.round(wait / 60000)}m for credits to refresh`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    keyAt = idx;
    const key = keys[keyAt];
    try {
      const res = await fetch(URL_MCP, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: AbortSignal.timeout(timeout),
      });
      const text = await res.text();
      // 429 is today's allowance, not a broken key; 401/403 is the key itself.
      if (res.status === 429) {
        rest(keyAt, "429");
        keyAt = (keyAt + 1) % keys.length;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        retire(keyAt, String(res.status));
        keyAt = (keyAt + 1) % keys.length;
        continue;
      }
      const body = text.includes("\ndata: ")
        ? text.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? text
        : text;
      // Errors do not always arrive as JSON-RPC: quota and permission problems
      // come back as plain text, which must not look like a crash.
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        const msg = body.trim().slice(0, 140);
        if (/quota|exceed|exhaust|limit|rate/i.test(msg)) {
          rest(keyAt, msg.slice(0, 50));
          keyAt = (keyAt + 1) % keys.length;
          continue;
        }
        if (/permission|caller|denied|unauthenticated|invalid/i.test(msg)) {
          retire(keyAt, msg.slice(0, 50));
          keyAt = (keyAt + 1) % keys.length;
          continue;
        }
        throw new Error(msg || `empty reply (${res.status})`);
      }
      if (json.error) throw new Error(JSON.stringify(json.error).slice(0, 200));
      return json.result;
    } catch (e) {
      console.error(`  key #${keyAt + 1} failed: ${e.message?.slice(0, 120)}`);
      keyAt = (keyAt + 1) % keys.length;
    }
  }
  throw new Error("every key is broken or out of credit right now");
}

const textOf = (r) => (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
const call = async (name, args, opts) => textOf(await rpc("tools/call", { name, arguments: args }, opts));

/** Stitch colours are Material tokens; these three are what a tenant site uses. */
function toPalette(theme) {
  const n = theme?.namedColors ?? {};
  const primary = theme.customColor || n.primary_container || n.primary;
  const secondary = n.surface || n.background || n.inverse_surface;
  const accent = n.secondary || n.tertiary || n.primary_fixed_dim;
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v ?? "") ? v.toLowerCase() : null);
  const [p, s, a] = [hex(primary), hex(secondary), hex(accent)];
  return p && s && a ? [p, s, a] : null;
}

async function forIndustry(key) {
  const brief = BRIEFS[key] ?? BRIEFS.general;
  const out = [];
  for (let i = 0; i < PER_INDUSTRY; i++) {
    const moods = ["bold and high contrast", "calm and premium", "warm and friendly"][i % 3];
    const proj = JSON.parse(await call("create_project", { title: `WebSetu ${key} ${i + 1}` }));
    const pid = String(proj.name ?? "").split("/").pop();
    if (!pid) continue;
    await call("generate_screen_from_text", {
      projectId: pid,
      deviceType: "DESKTOP",
      prompt: `Landing page for ${brief} in India. Visual style: ${moods}. Give it a distinctive brand colour scheme suited to this trade.`,
    });
    const ds = JSON.parse(await call("list_design_systems", { projectId: pid }));
    for (const d of ds.designSystems ?? []) {
      const pal = toPalette(d.designSystem?.theme ?? {});
      if (pal) out.push({ pal, name: d.designSystem?.displayName });
    }
    await call("delete_project", { name: `projects/${pid}` }).catch(() => {});
  }
  return out;
}

const wanted = process.argv.includes("--all")
  ? Object.keys(BRIEFS)
  : process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (!wanted.length) {
  console.error("Usage: node tools/stitch-palettes.mjs <industry…> | --all");
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const OUT = resolve(ROOT, "src/lib/stitch-designs.ts");
const MOODS = ["bold and high contrast", "calm and premium", "warm and friendly"];

/**
 * Everything the file should contain: designs generated just now, merged over
 * whatever earlier runs put there. A run for two trades must not delete the
 * twenty-one others, and re-running one trade must not pile up duplicates.
 */
function mergeInto(existing, fresh) {
  const merged = { ...existing };
  for (const [key, items] of Object.entries(fresh)) {
    const byColor = new Map((merged[key] ?? []).map((d) => [d.colors.join(), d]));
    for (const d of items) byColor.set(d.colors.join(), d);
    merged[key] = [...byColor.values()];
  }
  return merged;
}

/** The generated module, written so it stays readable in review. */
function render(designs) {
  const keys = Object.keys(designs).sort();
  const body = keys
    .map((key) => {
      const rows = designs[key]
        .map((d) => {
          const colors = d.colors.map((c) => `"${c}"`).join(", ");
          const brief = d.brief ? `, brief: ${JSON.stringify(d.brief)}` : "";
          return `    { name: ${JSON.stringify(d.name ?? "Stitch design")}, colors: [${colors}]${brief} },`;
        })
        .join("\n");
      return `  ${JSON.stringify(key)}: [\n${rows}\n  ],`;
    })
    .join("\n");
  return `// WebSetu — designs made in Google Stitch, one set per trade.
//
// GENERATED by tools/stitch-palettes.mjs. Do not edit by hand; run the tool
// again instead. It is safe to commit: no keys, no Stitch access at runtime —
// every business draws its own palette from this list, offline.
//
// Generated: ${new Date().toISOString().slice(0, 10)}

export interface StitchDesign {
  name?: string;
  colors: readonly [string, string, string];
  brief?: string;
}

export const STITCH_DESIGNS: Record<string, readonly StitchDesign[]> = {
${body}
};
`;
}

console.log(`${keys.length} key(s) loaded; ${PER_INDUSTRY} design(s) per industry`);
console.log(`a key that runs out of daily credits rests ${Math.round(COOLDOWN_MS / 60000)}m, then gets another turn\n`);
/** Existing generated designs, so a partial run only replaces what it touched. */
function readExisting() {
  try {
    const mod = readFileSync(OUT, "utf8");
    const json = mod.slice(mod.indexOf("{", mod.indexOf("STITCH_DESIGNS")), mod.lastIndexOf("}") + 1);
    const parsed = JSON.parse(
      json
        .replace(/([{,]\s*)([A-Za-z0-9_-]+):/g, '$1"$2":') // quote bare keys
        .replace(/,\s*([}\]])/g, "$1"), // drop trailing commas
    );
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [
        k,
        (Array.isArray(v) ? v : []).map((d) => ({
          name: d.name,
          brief: d.brief,
          colors: [d.colors[0], d.colors[1], d.colors[2]],
        })),
      ]),
    );
  } catch {
    return {};
  }
}

const fresh = {};
for (const key of wanted) {
  console.log(`== ${key}`);
  try {
    const got = await forIndustry(key);
    for (const g of got) {
      console.log(`    ["${g.pal[0]}", "${g.pal[1]}", "${g.pal[2]}"], // ${g.name ?? ""}`);
    }
    if (!got.length) {
      console.log("    (nothing usable returned)");
      continue;
    }
    fresh[key] = got.map((g, i) => ({
      name: g.name,
      colors: g.pal,
      brief: `${key} · ${MOODS[i % 3]}`,
    }));
  } catch (e) {
    console.error(`    failed: ${e.message}`);
    break;
  }
}

if (Object.keys(fresh).length) {
  const merged = mergeInto(readExisting(), fresh);
  if (dry) {
    console.log("\n--dry: not writing src/lib/stitch-designs.ts");
  } else {
    writeFileSync(OUT, render(merged));
    const count = Object.values(merged).reduce((n, v) => n + v.length, 0);
    console.log(`\nwrote ${OUT.replace(ROOT + "/", "")} — ${Object.keys(merged).length} trades, ${count} designs`);
    console.log("commit it: every new business now draws its colours from these.");
  }
} else {
  console.log("\nnothing usable came back — nothing written");
}
