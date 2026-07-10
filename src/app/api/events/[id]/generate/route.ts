import { NextResponse } from "next/server";
import { generatePosterForEvent } from "@/lib/pipeline";
import type { PosterVariant } from "@/lib/poster/render";

// photo sourcing + VLM screening + Replicate + compositing legitimately takes minutes
export const maxDuration = 300;

const VALID_VARIANTS: PosterVariant[] = ["masthead", "light", "flyer", "halo"];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const variantParam = new URL(request.url).searchParams.get("variant");
  const variant = VALID_VARIANTS.includes(variantParam as PosterVariant) ? (variantParam as PosterVariant) : undefined;

  const result = await generatePosterForEvent(id, variant);

  if ("error" in result) {
    const status = result.error.includes("already in progress") ? 409 : 422;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
