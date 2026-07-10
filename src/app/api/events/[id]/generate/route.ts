import { NextResponse } from "next/server";
import { generatePosterForEvent } from "@/lib/pipeline";
import type { PosterVariant } from "@/lib/poster/render";

// photo sourcing + VLM screening + Replicate + compositing legitimately takes minutes
export const maxDuration = 300;

// "cinematic" isn't in this list on purpose — it's derived server-side from creativeBrief,
// never picked directly via the variant param (rendering it requires a sceneImage, which only
// the creativeBrief branch produces).
const VALID_VARIANTS: PosterVariant[] = ["masthead", "light", "flyer", "halo"];
const MAX_BRIEF_LEN = 400;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const variantParam = new URL(request.url).searchParams.get("variant");
  const variant = VALID_VARIANTS.includes(variantParam as PosterVariant) ? (variantParam as PosterVariant) : undefined;

  let creativeBrief: string | undefined;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof body.creativeBrief === "string" && body.creativeBrief.trim()) {
      creativeBrief = body.creativeBrief.trim().slice(0, MAX_BRIEF_LEN);
    }
  }

  const result = await generatePosterForEvent(id, variant, creativeBrief);

  if ("error" in result) {
    const status = result.error.includes("already in progress") ? 409 : 422;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
