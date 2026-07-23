import { NextResponse } from "next/server";
import { supabaseAdmin } from "@club-os/core/database/supabase";

export async function GET() {
  // Unbounded selects don't scale past a few hundred rows — this caps the blast radius until
  // the admin UI has real pagination; it's a safety net, not a substitute for one.
  const { data, error } = await supabaseAdmin
    .from("posters")
    .select("*, events(artist_name_raw, city, venue, event_date, utility_line)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posters: data });
}
