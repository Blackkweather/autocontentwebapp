import { randomUUID } from "node:crypto";
import { supabaseAdmin, type EventRow } from "./supabase";
import { lookupArtistPhoto, treatArtistPhoto } from "./photo";
import { generateEventCopy } from "./groq";
import { renderPoster, type PosterVariant } from "./poster/render";

// Matches the route's `maxDuration = 300` (src/app/api/events/[id]/generate/route.ts) plus a
// buffer — a "generating" row older than this is treated as an abandoned run (crashed function,
// killed invocation) rather than a real in-flight one, so it can be retried instead of stuck forever.
const GENERATION_LOCK_TIMEOUT_MS = (300 + 60) * 1000;

function fallbackUtilityLine(venue: string, city: string, dateISO: string): string {
  const date = new Date(dateISO + "T00:00:00Z");
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = date.getUTCDate();
  return `${venue} — ${city} — ${month.toUpperCase()} ${day}`;
}

async function getEventCopy(event: EventRow) {
  try {
    return await generateEventCopy({
      artistNameRaw: event.artist_name_raw,
      eventDate: event.event_date,
      venue: event.venue,
      city: event.city,
    });
  } catch {
    // No Groq key yet, or Groq request failed — deterministic fallback keeps the pipeline usable.
    return {
      artistName: event.artist_name_raw.trim(),
      utilityLine: fallbackUtilityLine(event.venue, event.city, event.event_date),
      tagline: "", // the "LIVE PERFORMANCE BY" kicker already carries this when Groq is unavailable
    };
  }
}

export async function generatePosterForEvent(
  eventId: string,
  variant?: PosterVariant
): Promise<{ posterUrl: string } | { error: string }> {
  // Atomic claim: only succeeds if the row isn't already "generating", or its lock is stale.
  // Two simultaneous clicks race on this UPDATE's WHERE clause — Postgres row-level locking
  // means only one can win, so this is race-free, not just a check-then-act approximation.
  const staleThreshold = new Date(Date.now() - GENERATION_LOCK_TIMEOUT_MS).toISOString();
  const { data: event, error: claimError } = await supabaseAdmin
    .from("events")
    .update({ status: "generating", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .or(`status.neq.generating,updated_at.lt.${staleThreshold}`)
    .select("*")
    .maybeSingle<EventRow>();

  if (claimError) {
    return { error: claimError.message };
  }
  if (!event) {
    const { data: existing } = await supabaseAdmin.from("events").select("id").eq("id", eventId).maybeSingle();
    if (!existing) return { error: "Event not found" };
    return { error: "Generation already in progress for this event — try again shortly." };
  }

  try {
    const { photoUrl } = await lookupArtistPhoto(event.artist_name_raw);
    if (!photoUrl) {
      await supabaseAdmin.from("events").update({ status: "photo_missing" }).eq("id", eventId);
      return { error: "No photo found — flagged for manual upload" };
    }

    const [copy, treated, artistRowResult] = await Promise.all([
      getEventCopy(event),
      treatArtistPhoto(photoUrl),
      supabaseAdmin.from("artists").select("id").ilike("name", event.artist_name_raw).maybeSingle(),
    ]);

    const resolvedVariant = variant ?? "masthead";
    const posterBuffer = await renderPoster({
      artistName: copy.artistName,
      utilityLine: copy.utilityLine,
      tagline: copy.tagline,
      subject: treated.subject,
      backdrop: treated.backdrop,
      city: event.city,
      eventDate: event.event_date,
      variant: resolvedVariant,
    });

    const fileName = `${eventId}-${randomUUID()}.png`;
    const { error: uploadError } = await supabaseAdmin.storage.from("posters").upload(fileName, posterBuffer, {
      contentType: "image/png",
      upsert: true,
    });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage.from("posters").getPublicUrl(fileName);
    const posterUrl = publicUrlData.publicUrl;

    await supabaseAdmin.from("posters").insert({ event_id: eventId, image_url: posterUrl, variant: resolvedVariant });
    await supabaseAdmin
      .from("events")
      .update({
        status: "done",
        utility_line: copy.utilityLine,
        artist_id: artistRowResult.data?.id ?? null,
      })
      .eq("id", eventId);

    return { posterUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabaseAdmin.from("events").update({ status: "failed", error_message: message }).eq("id", eventId);
    return { error: message };
  }
}
