import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  // Safety net against unbounded growth, not a substitute for real pagination — see posters/route.ts.
  const { data, error } = await supabaseAdmin
    .from("artists")
    .select("id, name, photo_url, source, vlm_checked, artist_photos(id, url, quality_score, created_at)")
    .order("name", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artists: data });
}
