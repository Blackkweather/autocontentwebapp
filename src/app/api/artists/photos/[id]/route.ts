import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const { data: photo } = await supabaseAdmin.from("artist_photos").select("id, url").eq("id", id).maybeSingle();
  if (!photo) return NextResponse.json({ error: "photo not found" }, { status: 404 });

  const marker = "/artist-photos/";
  const idx = photo.url.indexOf(marker);
  if (idx !== -1) {
    const path = photo.url.slice(idx + marker.length);
    await supabaseAdmin.storage.from("artist-photos").remove([path]);
  }
  const { error } = await supabaseAdmin.from("artist_photos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
