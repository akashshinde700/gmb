import { gzipSync } from "node:zlib";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { audit, HttpError, limitSubjectOrThrow, requireAdmin, route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backup — download a consistent snapshot of the live database.
 *
 * The deploy scripts no longer take a backup, by instruction. This is the
 * replacement: the admin decides when a copy is worth keeping and gets the file
 * in their browser, rather than one accumulating on the server on every deploy.
 *
 * **`VACUUM INTO`, not a file copy.** The app is serving while this runs, so
 * there is a live writer. Copying the database file byte-for-byte is only safe
 * when every committed transaction is already in it — true under
 * `journal_mode=delete`, and NOT true under WAL, which this database now uses:
 * recent commits sit in `<db>-wal` until a checkpoint. A raw copy restores
 * cleanly and is quietly missing the newest rows. `VACUUM INTO` runs inside a
 * transaction and writes a complete, already-compacted database, which is the
 * same guarantee `sqlite3 .backup` gives.
 *
 * The file contains everything: customer details, leads, payment history and
 * password hashes. It is admin-only, never cached, rate limited, and every
 * download is written to the audit log.
 */
export const GET = route(async (req: Request) => {
  const admin = await requireAdmin(req);

  // A download is cheap to ask for and expensive to serve: it locks the
  // database briefly and writes out the whole file. Six an hour is plenty for
  // a human and stops a stolen session from siphoning the database in a loop.
  limitSubjectOrThrow(`admin:backup:${admin.id}`, 6, 60 * 60 * 1000);

  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) {
    // The project can be switched to PostgreSQL by scripts/use-db.mjs, where
    // this technique does not apply and `pg_dump` is the right tool.
    throw new HttpError("Backup download is only available on SQLite deployments", 400);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  // A random component, not just the timestamp: two admins clicking in the same
  // second must not write to each other's file.
  const target = join(tmpdir(), `websetu-backup-${stamp}-${randomBytes(6).toString("hex")}.db`);

  try {
    // VACUUM INTO refuses to overwrite, so the unique name above is also the
    // safety check. Interpolated rather than parameterised because SQLite does
    // not accept a bound parameter here; `target` is built entirely from
    // server-side values and never from the request.
    await db.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

    // `turbopackIgnore` because this path is written by this very route a few
    // lines above, at request time, into the OS temp directory. The build
    // tracer cannot resolve `tmpdir()` statically, and its fallback for an
    // unknown read is to trace the entire project root — which put `src/` and,
    // worse, the machine's `.env` (APP_SECRET, Razorpay keys, SMTP password)
    // inside `.next/standalone`, the folder that gets uploaded on deploy.
    // Nothing about this read is a build-time fact, so there is nothing for the
    // tracer to follow.
    const raw = await readFile(/* turbopackIgnore: true */ target);
    const gz = gzipSync(raw, { level: 9 });

    await audit({
      actor: admin.id,
      action: "DATABASE_BACKUP_DOWNLOAD",
      entity: "database",
      meta: { bytes: raw.length, gzippedBytes: gz.length },
    });

    const filename = `websetu-${stamp}.db.gz`;
    return new Response(new Uint8Array(gz), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(gz.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Caching is not set here on purpose: next.config.ts already forces
        // `no-store, max-age=0` on every /api/* response except uploads, and
        // that rule wins over anything set on the response. Setting a stricter
        // value here would read as a guarantee this route does not make.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    // The snapshot is a full copy of the database sitting in a world-readable
    // temp directory. It goes whether the download succeeded or not.
    await unlink(target).catch(() => {});
  }
});
