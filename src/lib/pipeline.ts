import { randomUUID } from "node:crypto";
import { supabaseAdmin, type EventRow } from "./supabase";
import { lookupArtistPhoto, treatArtistPhoto } from "./photo";
import { generateEventCopy } from "./groq";
import { renderPoster, type PosterVariant } from "./poster/render";

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
  const { data: event, error: fetchError } = await supabaseAdmin
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single<EventRow>();

  if (fetchError || !event) {
    return { error: "Event not found" };
  }

  await supabaseAdmin.from("events").update({ status: "generating", error_message: null }).eq("id", eventId);

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
