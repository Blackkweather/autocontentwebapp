import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("*, posters(id, image_url, created_at)")
    .order("event_date", { ascending: true });

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

  if (!artistName || !eventDate || !city || !venue) {
    return NextResponse.json({ error: "artistName, eventDate, city, and venue are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      artist_name_raw: artistName,
      event_date: eventDate,
      city,
      venue,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}
