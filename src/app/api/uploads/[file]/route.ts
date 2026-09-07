import { readFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "@/lib/auth";

const UPLOAD_DIR = path.resolve(process.cwd(), "public", "uploads");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** GET /api/uploads/[file] — serve an uploaded image with immutable caching */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;

  // Only plain generated filenames allowed — blocks path traversal ("..", slashes, etc.)
  if (!/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) return fail("Not found", 404);

  const ext = file.split(".").pop()?.toLowerCase() || "";
  const contentType = MIME[ext];
  if (!contentType) return fail("Not found", 404);

  // Defense in depth: resolved path must stay inside the uploads directory
  const target = path.resolve(UPLOAD_DIR, file);
  if (!target.startsWith(UPLOAD_DIR + path.sep)) return fail("Not found", 404);

  try {
    const buffer = await readFile(target);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return fail("Not found", 404);
  }
}
