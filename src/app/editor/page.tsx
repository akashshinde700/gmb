import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePageBusiness } from "@/lib/guard";
import VisualEditor from "@/components/editor/visual-editor";

/**
 * The freeform visual editor, at its own URL.
 *
 * Deliberately not a dashboard tab: the editor is a full-bleed canvas, and the
 * console's card layout would either constrain it or have to be special-cased
 * for it. A separate route also means the owner can keep it open in a second tab
 * while the dashboard sits in the first.
 *
 * The guard is the same server-side one every console page uses, so a signed-out
 * visitor is redirected before any HTML exists.
 */

export const metadata: Metadata = {
  title: "Visual editor",
  robots: { index: false, follow: false },
};

export default async function EditorPage() {
  const user = await requirePageBusiness("/editor");
  const business = await db.business.findUnique({
    where: { userId: user.id },
    select: { slug: true },
  });

  return <VisualEditor slug={business?.slug ?? ""} />;
}
