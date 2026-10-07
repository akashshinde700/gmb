/**
 * Makes the "@/" import alias resolve when tests run under plain Node.
 *
 * The app is a Next.js project: `@/lib/x` means `src/lib/x`, and tsc and the
 * bundler both know that from tsconfig.json. `node --experimental-strip-types`
 * does not — it strips the types and then loads files as ordinary ES modules,
 * where an unknown bare specifier is a hard `ERR_MODULE_NOT_FOUND`. That broke
 * `npm run test:all` at the one suite that imports app code (`section-editor`),
 * with an error about a package called "@/lib" that does not exist.
 *
 * Rather than duplicating the modules or rewriting their imports to relative
 * paths (which would then drift), the resolution rule lives here, once, and the
 * test scripts load it with `--import ./tests/path-alias.mjs`.
 *
 * Node's synchronous hook API needs 22.15+; on older 22.x the flag is ignored
 * and the affected suite fails exactly as it did before. That is a downgrade of
 * a fix, not a regression: nothing else changes.
 */

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** `@/lib/x` -> src/lib/x, trying the extensions Node needs spelled out. */
function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = path.join(srcDir, specifier.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts")];
  const found = candidates.find((candidate) => existsSync(candidate) && !candidate.endsWith(path.sep));
  return found ? pathToFileURL(found).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mapped = resolveAlias(specifier);
    if (mapped) return { url: mapped, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
