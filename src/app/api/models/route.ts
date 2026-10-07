import { FREEMODELS_MODELS } from "@/lib/freemodels";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { models: FREEMODELS_MODELS },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
