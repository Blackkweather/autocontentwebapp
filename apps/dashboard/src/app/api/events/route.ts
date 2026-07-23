import { NextResponse } from "next/server";
import { supabaseAdmin } from "@club-os/core/database/supabase";

export async function GET() {
  // Safety net against unbounded growth, not a substitute for real pagination — see posters/route.ts.
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("*, posters(id, image_url, variant, prompt, created_at)")
    .order("event_date", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { artistName, eventDate, city, venue } = body as {
    artistName?: string;
    eventDate?: string;
    city?: string;
    venue?: string;
  };

  if (!artistName?.trim() || !eventDate || !city?.trim() || !venue?.trim()) {
    return NextResponse.json({ error: "artistName, eventDate, city, and venue are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: "eventDate must be an ISO date (YYYY-MM-DD)" }, { status: 400 });
  }
  const MAX_LEN = 200;
  if ([artistName, city, venue].some((v) => v.length > MAX_LEN)) {
    return NextResponse.json({ error: `artistName, city, and venue must be under ${MAX_LEN} characters` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      artist_name_raw: artistName.trim(),
      event_date: eventDate,
      city: city.trim(),
      venue: venue.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}
