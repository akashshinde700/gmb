"use client";
// WebSetu — brand palettes for the tenant pickers.
//
// Palettes are managed by a platform admin (Admin -> Appearance) and stored in
// the database, so the pickers fetch them. The built-in list ships as the
// fallback: an offline or failed request must never leave a customer with no
// colours to choose from.

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { BRAND_PALETTES, type BrandPalette } from "@/lib/palettes";

export interface PaletteAllowance {
  /** Palettes in the whole library, before the plan allowance is applied. */
  total: number;
  /** How many this customer may pick from; -1 = all. */
  limit: number;
  /** Whether the list came from the plan, an admin override, or the default. */
  source: "override" | "plan" | "default";
}

export function usePalettes(scope: "BUSINESS" | "PLATFORM" = "BUSINESS") {
  const [palettes, setPalettes] = useState<BrandPalette[]>(BRAND_PALETTES);
  const [allowance, setAllowance] = useState<PaletteAllowance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ palettes: BrandPalette[] } & Partial<PaletteAllowance>>(`/api/palettes?scope=${scope}`)
      .then((d) => {
        if (cancelled || !d.palettes?.length) return;
        setPalettes(d.palettes);
        if (typeof d.total === "number" && typeof d.limit === "number") {
          setAllowance({ total: d.total, limit: d.limit, source: d.source ?? "plan" });
        }
      })
      .catch(() => {
        /* keep the built-in list */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return { palettes, allowance, loading };
}
