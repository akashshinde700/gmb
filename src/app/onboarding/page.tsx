import type { Metadata } from "next";
import { redirect } from "next/navigation";
import OnboardingView from "@/components/views/onboarding-view";
import RouteSync from "@/components/route-sync";
import { requirePageUser } from "@/lib/guard";
import { db } from "@/lib/db";

/**
 * The setup wizard. Requires a signed-in user but explicitly NOT a business —
 * this is the route that creates one.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your website — WebSetu",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const user = await requirePageUser("/onboarding");

  // Someone who has already finished should not be able to walk back into the
  // wizard and create a second business.
  const business = await db.business.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (business) redirect("/dashboard");

  return (
    <>
      <RouteSync view="onboarding" />
      <OnboardingView />
    </>
  );
}
