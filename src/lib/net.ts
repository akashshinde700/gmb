// One small indirection over DNS, so the importer can resolve a hostname
// without the rest of the codebase caring which runtime that happens in.

import { lookup } from "node:dns/promises";

export interface LookupAddress {
  address: string;
  /** 4 or 6. */
  family: number;
}

/** Every address a hostname resolves to. Throws when it resolves to none. */
export async function dnsLookup(hostname: string): Promise<LookupAddress[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => ({ address: entry.address, family: entry.family }));
}
