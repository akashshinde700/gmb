import { readFile } from "node:fs/promises";
import { fail } from "@/lib/auth";
import { mimeForExtension, resolveStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

/** GET /api/uploads/[file] — serve an uploaded image with immutable caching */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;

  // Only plain generated filenames resolve; anything else (traversal, slashes,
  // encoded segments) is refused before it reaches the filesystem.
  const target = resolveStoredFile(file);
  if (!target) return fail("Not found", 404);

  const ext = file.split(".").pop()?.toLowerCase() || "";
  const contentType = mimeForExtension(ext);
  if (!contentType) return fail("Not found", 404);

  try {
    const buffer = await readFile(target);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        // Stored bytes are sniffed as images on upload; stop browsers from
        // re-interpreting an old file as anything else.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return fail("Not found", 404);
  }
}
