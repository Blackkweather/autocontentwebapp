import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

const MAX_FILES = 10;
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const artistName = String(form.get("artistName") ?? "").trim();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (!artistName) return NextResponse.json({ error: "artistName is required" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "at least one photo is required" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `maximum ${MAX_FILES} photos per upload` }, { status: 400 });

  // find-or-create the artist by name
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

  const saved: Array<{ id: string; url: string }> = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `"${file.name}" exceeds ${MAX_BYTES / 1024 / 1024}MB` }, { status: 400 });
    }
    const input = Buffer.from(await file.arrayBuffer());
    let normalized: Buffer;
    try {
      // re-encode: strips EXIF, guards against non-image uploads, caps dimensions
      normalized = await sharp(input).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    } catch {
      return NextResponse.json({ error: `"${file.name}" is not a readable image` }, { status: 400 });
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
    saved.push(row);
  }

  return NextResponse.json({ artistId: artist.id, photos: saved }, { status: 201 });
}
