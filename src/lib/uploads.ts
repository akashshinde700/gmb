// WebSetu — uploaded-image storage.
//
// Files live OUTSIDE the deployed build so a redeploy (which wipes htdocs)
// cannot delete customer images: set UPLOADS_DIR to a persistent path in
// production. Without it the directory falls back to <cwd>/public/uploads,
// which is what local development uses.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Raster types only. SVG is deliberately excluded: it can carry script, and
 *  these files are served from the app's own origin. */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "gif", mime: "image/gif", test: (b) => b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a" },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export const ALLOWED_EXTENSIONS = SIGNATURES.map((s) => s.ext);

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || path.resolve(process.cwd(), "public", "uploads");
}

/** MIME type for a stored file, or null when the extension is not one we serve. */
export function mimeForExtension(ext: string): string | null {
  const found = SIGNATURES.find((s) => s.ext === ext.toLowerCase());
  if (found) return found.mime;
  if (ext.toLowerCase() === "jpeg") return "image/jpeg";
  return null;
}

/**
 * Identify an upload by its magic bytes rather than the client-supplied
 * Content-Type or filename, both of which are attacker-controlled.
 */
export function sniffImage(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length < 12) return null;
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? { ext: match.ext, mime: match.mime } : null;
}

/**
 * Write bytes under a generated name. The original filename is never reused.
 *
 * The `turbopackIgnore` comments on the two filesystem calls below are load
 * bearing, not decoration. The build traces what a route can read at runtime by
 * resolving `path.*` calls statically; `UPLOADS_DIR` is an environment
 * variable, so the path cannot be resolved, and the tracer's documented
 * fallback for "unknown path" is to include EVERYTHING under the project root.
 * In a standalone build that meant shipping a copy of the repository — the
 * `.git` directory, `src/`, `e2e/` and, worst of all, `db/custom.db`, the live
 * database with password hashes, leads and payments — inside the artifact that
 * gets uploaded to the server on every deploy.
 *
 * The comment tells the tracer this read does not need tracing, which is true:
 * uploads are written at runtime to a directory that is deliberately not part
 * of the build (see the note at the top of this file).
 */
export async function storeImage(buffer: Buffer, ext: string): Promise<string> {
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(/* turbopackIgnore: true */ dir, name), buffer);
  return name;
}

/** Resolve a stored file, refusing anything that escapes the uploads directory. */
export function resolveStoredFile(file: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) return null;
  const dir = path.resolve(/* turbopackIgnore: true */ uploadsDir());
  const target = path.resolve(dir, file);
  if (target !== dir && !target.startsWith(dir + path.sep)) return null;
  return target;
}
