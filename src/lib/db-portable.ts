// WebSetu — query shapes that differ between SQLite and PostgreSQL.
//
// The app was written against SQLite, where `contains` compiles to LIKE and is
// case-insensitive. On PostgreSQL the same filter is case-sensitive, so a
// search for "sharma" would stop finding "Sharma" — no error, no warning, just
// results quietly going missing. Prisma's fix is `mode: "insensitive"`, which
// only exists on providers that support it, so it cannot simply be added
// everywhere either.
//
// This is the seam. Search filters go through it and behave the same on both.

/**
 * Which database the app is talking to, read off the connection string.
 *
 * This used to be its own environment variable, DATABASE_PROVIDER, which made
 * three places have to agree: the literal in prisma/schema.prisma (Prisma will
 * not read that one from the environment), DATABASE_URL, and the variable
 * itself. Two of those disagreeing fails loudly — Prisma cannot connect. The
 * third failed silently: point DATABASE_URL at PostgreSQL and forget the
 * variable, and every search in the app quietly turns case-sensitive, so a
 * customer looking for "Sharma" stops finding "sharma" and nothing is logged.
 *
 * The URL is the one value that must be right for anything to work at all, so
 * it is the one that decides. DATABASE_PROVIDER is no longer read anywhere.
 */
export function dbProvider(): "sqlite" | "postgresql" {
  return /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "") ? "postgresql" : "sqlite";
}

/**
 * A case-insensitive "contains" filter for the current provider.
 *
 * The cast is unavoidable: Prisma types `mode` out of existence when the
 * generated client targets SQLite, so the shared shape cannot be expressed
 * without one. It is contained to this function rather than spread across every
 * search endpoint.
 */
export function containsInsensitive(value: string) {
  return (
    dbProvider() === "postgresql"
      ? { contains: value, mode: "insensitive" }
      : { contains: value }
  ) as { contains: string };
}
