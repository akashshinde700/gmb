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
 */
import { readFileSync } from "node:fs";
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
const dead = new Set();

/** One call, moving to the next key when this one is out of credit. */
async function rpc(method, params, { timeout = 240_000 } = {}) {
  for (let tries = 0; tries < keys.length; tries++) {
    if (dead.has(keyAt)) {
      keyAt = (keyAt + 1) % keys.length;
      continue;
    }
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
      if (res.status === 429 || res.status === 403) {
        console.error(`  key #${keyAt + 1} exhausted (${res.status}) — switching`);
        dead.add(keyAt);
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
        if (/quota|exceed|limit|permission|caller|denied/i.test(msg)) {
          console.error(`  key #${keyAt + 1} unusable: ${msg}`);
          dead.add(keyAt);
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
  throw new Error("every key failed or is out of credit");
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

console.log(`${keys.length} key(s) loaded; ${PER_INDUSTRY} design(s) per industry\n`);
for (const key of wanted) {
  console.log(`== ${key}`);
  try {
    const got = await forIndustry(key);
    for (const g of got) {
      console.log(`    ["${g.pal[0]}", "${g.pal[1]}", "${g.pal[2]}"], // ${g.name ?? ""}`);
    }
    if (!got.length) console.log("    (nothing usable returned)");
  } catch (e) {
    console.error(`    failed: ${e.message}`);
    break;
  }
}
