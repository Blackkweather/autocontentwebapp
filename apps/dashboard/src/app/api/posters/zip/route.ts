import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseAdmin } from "@club-os/core/database/supabase";

// Server-side zip, not client-side: posters live in a Supabase storage bucket, and building the
// archive here means the browser triggers one plain <a href> download with no CORS/blob-URL
// juggling — a normal GET the browser's already-cached Basic Auth session handles for free.

type EventRef = { artist_name_raw: string; city: string; event_date: string } | null;

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "poster";
}

const MAX_POSTERS = 200; // keeps archive build time/memory well inside a serverless function's budget

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim().toLowerCase();
  const dateFrom = searchParams.get("dateFrom")?.trim();
  const dateTo = searchParams.get("dateTo")?.trim();

  const { data, error } = await supabaseAdmin
    .from("posters")
    .select("id, image_url, variant, events(artist_name_raw, city, event_date)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered = (data ?? []).filter((poster) => {
    const event = (Array.isArray(poster.events) ? poster.events[0] : poster.events) as EventRef;
    if (!event) return false;
    if (city && !event.city.toLowerCase().includes(city)) return false;
    if (dateFrom && event.event_date < dateFrom) return false;
    if (dateTo && event.event_date > dateTo) return false;
    return true;
  });

  if (filtered.length === 0) {
    return NextResponse.json({ error: "No posters match this filter" }, { status: 404 });
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    filtered.slice(0, MAX_POSTERS).map(async (poster) => {
      const res = await fetch(poster.image_url);
      if (!res.ok) return; // skip a broken image rather than fail the whole archive
      const buffer = Buffer.from(await res.arrayBuffer());
      const event = (Array.isArray(poster.events) ? poster.events[0] : poster.events) as EventRef;
      const base = sanitize(`${event?.artist_name_raw ?? "poster"}-${poster.variant}-${event?.event_date ?? ""}`);
      let name = `${base}.jpg`;
      let n = 2;
      while (usedNames.has(name)) name = `${base}-${n++}.jpg`;
      usedNames.add(name);
      zip.file(name, buffer);
    })
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="amaze-live-posters.zip"',
    },
  });
}
