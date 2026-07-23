import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@club-os/core/database/supabase";

// Confirms a candidate from GET /api/artists/photos/search into the manual library — same
// storage/DB shape POST /api/artists/photos (file upload) produces, just sourced from a URL
// instead of a browser file input, so lookupArtistPhoto's tier-1 manual-library check picks it
// up exactly the same way either path was saved.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const artistName = typeof body.artistName === "string" ? body.artistName.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!artistName) return NextResponse.json({ error: "artistName is required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let { data: artist } = await supabaseAdmin.from("artists").select("id").ilike("name", artistName).maybeSingle();
  if (!artist) {
    const { data: created, error } = await supabaseAdmin
      .from("artists")
      .insert({ name: artistName, source: "manual" })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "artist create failed" }, { status: 500 });
    artist = created;
  }

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: `Failed to fetch source image: ${res.status}` }, { status: 422 });
  const input = Buffer.from(await res.arrayBuffer());

  let normalized: Buffer;
  try {
    // re-encode: strips EXIF, guards against non-image responses, caps dimensions — same as the
    // file-upload path
    normalized = await sharp(input).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return NextResponse.json({ error: "source URL is not a readable image" }, { status: 400 });
  }

  const path = `library/${artist.id}/${randomUUID()}.jpg`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("artist-photos")
    .upload(path, normalized, { contentType: "image/jpeg", upsert: false });
  if (uploadError) return NextResponse.json({ error: `upload failed: ${uploadError.message}` }, { status: 500 });

  const { data: publicUrlData } = supabaseAdmin.storage.from("artist-photos").getPublicUrl(path);
  const { data: row, error: insertError } = await supabaseAdmin
    .from("artist_photos")
    .insert({ artist_id: artist.id, url: publicUrlData.publicUrl })
    .select("id, url")
    .single();
  if (insertError || !row) return NextResponse.json({ error: insertError?.message ?? "insert failed" }, { status: 500 });

  return NextResponse.json({ artistId: artist.id, photo: row }, { status: 201 });
}
