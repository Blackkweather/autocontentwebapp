import { NextResponse } from "next/server";
import { generatePosterForEvent } from "@/lib/pipeline";
import { MAX_LINEUP_REFERENCE_IMAGES } from "@/lib/replicate";
import type { PosterVariant } from "@/lib/poster/render";

// photo sourcing + VLM screening + Replicate + compositing legitimately takes minutes
export const maxDuration = 300;

// "cinematic" isn't in this list on purpose — it's derived server-side from creativeBrief,
// never picked directly via the variant param (rendering it requires a sceneImage, which only
// the creativeBrief branch produces).
const VALID_VARIANTS: PosterVariant[] = ["masthead", "light", "flyer", "halo"];
const MAX_BRIEF_LEN = 400;
const MAX_EXTRA_ARTISTS = MAX_LINEUP_REFERENCE_IMAGES - 1; // primary artist takes one reference slot

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const variantParam = new URL(request.url).searchParams.get("variant");
  const variant = VALID_VARIANTS.includes(variantParam as PosterVariant) ? (variantParam as PosterVariant) : undefined;

  let creativeBrief: string | undefined;
  let extraArtists: string[] | undefined;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof body.creativeBrief === "string" && body.creativeBrief.trim()) {
      creativeBrief = body.creativeBrief.trim().slice(0, MAX_BRIEF_LEN);
    }
    if (Array.isArray(body.extraArtists)) {
      extraArtists = (body.extraArtists as unknown[])
        .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n: string) => n.trim())
        .slice(0, MAX_EXTRA_ARTISTS);
    }
  }

  const result = await generatePosterForEvent(id, variant, creativeBrief, extraArtists);

  if ("error" in result) {
    const status = result.error.includes("already in progress") ? 409 : 422;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
