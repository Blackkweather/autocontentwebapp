"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";

type PosterVariant = "masthead" | "light" | "flyer" | "halo" | "cinematic";

// "cinematic" isn't picked from this dropdown — it's implied automatically by filling in the
// AI Scene Brief field for an event (see handleGenerate/handleGenerateAll), since rendering it
// requires an AI-edited scene image, not just a layout choice.
const VARIANTS: Array<{ id: Exclude<PosterVariant, "cinematic">; label: string; hint: string }> = [
  { id: "masthead", label: "Masthead", hint: "dark overlap" },
  { id: "light", label: "Light", hint: "cream editorial" },
  { id: "flyer", label: "Flyer", hint: "hero name" },
  { id: "halo", label: "Halo", hint: "radial glow" },
];
const VARIANT_LABEL: Record<PosterVariant, string> = {
  ...(Object.fromEntries(VARIANTS.map((v) => [v.id, v.label])) as Record<Exclude<PosterVariant, "cinematic">, string>),
  cinematic: "AI Scene",
};

type Poster = { id: string; image_url: string; variant: PosterVariant; created_at: string };
type ArtistPhoto = { id: string; url: string; quality_score: number | null; created_at: string };
type Artist = {
  id: string;
  name: string;
  photo_url: string | null;
  source: string;
  vlm_checked: boolean;
  artist_photos: ArtistPhoto[];
};
type EventWithPosters = {
  id: string;
  event_date: string;
  artist_name_raw: string;
  venue: string;
  city: string;
  utility_line: string | null;
  status: "pending" | "photo_missing" | "generating" | "done" | "failed";
  error_message: string | null;
  posters: Poster[];
};

const STATUS_COLOR: Record<EventWithPosters["status"], string> = {
  pending: "#8a867e",
  photo_missing: "#ad8a3e",
  generating: "#ad8a3e",
  done: "#6b9b6f",
  failed: "#b0453f",
};

const STATUS_LABEL: Record<EventWithPosters["status"], string> = {
  pending: "Pending",
  photo_missing: "Photo missing",
  generating: "Generating",
  done: "Done",
  failed: "Failed",
};

/** Every route can fail — a stale env var, an RLS policy, Supabase itself being down. Throwing
 *  on a non-OK response means callers can't accidentally treat a failure as success just by
 *  forgetting to check res.ok, which is exactly what let real outages look like "the app is
 *  just not showing my data" instead of a visible error. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export default function AdminPage() {
  const [events, setEvents] = useState<EventWithPosters[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateErrors, setGenerateErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ artistName: "", eventDate: "", city: "", venue: "" });
  const [uploadName, setUploadName] = useState("");
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [variantByEvent, setVariantByEvent] = useState<Record<string, PosterVariant>>({});
  const [briefByEvent, setBriefByEvent] = useState<Record<string, string>>({});
  const [filterCity, setFilterCity] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  async function loadEvents() {
    try {
      const data = await fetchJson<{ events: EventWithPosters[] }>("/api/events");
      setEvents(data.events ?? []);
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  async function loadArtists() {
    try {
      const data = await fetchJson<{ artists: Artist[] }>("/api/artists");
      setArtists(data.artists ?? []);
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load artists");
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) return;
    if (uploadFiles.length > 10) {
      setUploadError("Maximum 10 photos per upload.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const body = new FormData();
    body.append("artistName", uploadName);
    Array.from(uploadFiles).forEach((f) => body.append("files", f));
    const res = await fetch("/api/artists/photos", { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setUploadError(data.error ?? `Upload failed (${res.status})`);
    } else {
      setUploadName("");
      setUploadFiles(null);
      (document.getElementById("photo-files") as HTMLInputElement | null)?.form?.reset();
      await loadArtists();
    }
    setUploading(false);
  }

  async function handleDeletePhoto(id: string) {
    await fetch(`/api/artists/photos/${id}`, { method: "DELETE" });
    await loadArtists();
  }

  useEffect(() => {
    loadEvents();
    loadArtists();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fetchJson("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ artistName: "", eventDate: "", city: "", venue: "" });
      await loadEvents();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to add event");
    }
    setSubmitting(false);
  }

  async function handleGenerate(id: string, variantOverride?: PosterVariant) {
    const variant = variantOverride ?? variantByEvent[id] ?? "masthead";
    const brief = briefByEvent[id]?.trim();
    setGeneratingId(id);
    setGenerateErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await fetchJson(`/api/events/${id}/generate?variant=${variant}`, {
        method: "POST",
        ...(brief
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creativeBrief: brief }) }
          : {}),
      });
    } catch (err) {
      setGenerateErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Generation failed" }));
    }
    setGeneratingId(null);
    await loadEvents();
  }

  /** Sequential, not parallel — each generate call can itself burn several Groq requests
   *  (copy + per-candidate photo screening across tiers), so 30 events in parallel would slam
   *  straight into the free-tier RPM ceiling. One at a time is slower but reliable.
   *
   *  Rotates through all 4 layouts for any event whose dropdown was never touched, instead of
   *  letting every one of them silently default to "masthead" — a batch of 30 all defaulting
   *  the same way looked like a bug ("same format and background every time"), not a choice.
   *  Events with an AI Scene Brief filled in skip the rotation entirely — the server derives
   *  "cinematic" from the brief regardless of what variant is sent. */
  async function handleGenerateAll() {
    const targets = filteredEvents.filter((e) => e.status !== "generating" && e.status !== "done");
    if (targets.length === 0) return;
    setBulkGenerating(true);
    setBulkProgress({ done: 0, total: targets.length });
    let cycle = 0;
    for (const event of targets) {
      const explicit = variantByEvent[event.id];
      const hasBrief = Boolean(briefByEvent[event.id]?.trim());
      const variant = explicit ?? (hasBrief ? "masthead" : VARIANTS[cycle % VARIANTS.length].id);
      if (!explicit && !hasBrief) {
        cycle += 1;
        setVariantByEvent((prev) => ({ ...prev, [event.id]: variant }));
      }
      await handleGenerate(event.id, variant);
      setBulkProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    setBulkGenerating(false);
    setBulkProgress(null);
  }

  const filteredEvents = events.filter((e) => {
    if (filterCity.trim() && !e.city.toLowerCase().includes(filterCity.trim().toLowerCase())) return false;
    if (filterDateFrom && e.event_date < filterDateFrom) return false;
    if (filterDateTo && e.event_date > filterDateTo) return false;
    return true;
  });
  const pendingCount = filteredEvents.filter((e) => e.status !== "generating" && e.status !== "done").length;
  const eventsWithPosters = filteredEvents.filter((e) => e.posters.length > 0);
  const totalPosters = filteredEvents.reduce((n, e) => n + e.posters.length, 0);
  const filtersActive = Boolean(filterCity.trim() || filterDateFrom || filterDateTo);
  const zipQuery = new URLSearchParams({
    ...(filterCity.trim() ? { city: filterCity.trim() } : {}),
    ...(filterDateFrom ? { dateFrom: filterDateFrom } : {}),
    ...(filterDateTo ? { dateTo: filterDateTo } : {}),
  }).toString();

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.kicker}>Amaze Live</div>
        <h1 style={styles.title}>Poster Pipeline</h1>
        <div style={styles.headerRule} />
      </header>

      {pageError && (
        <div style={styles.pageErrorBanner}>
          Couldn&apos;t load live data: {pageError}. What you see below may be stale.
        </div>
      )}

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>New Event</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            placeholder="Artist name"
            required
            value={form.artistName}
            onChange={(e) => setForm({ ...form, artistName: e.target.value })}
          />
          <input
            style={styles.input}
            type="date"
            required
            value={form.eventDate}
            onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
          />
          <input
            style={styles.input}
            placeholder="City"
            required
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <input
            style={styles.input}
            placeholder="Venue"
            required
            value={form.venue}
            onChange={(e) => setForm({ ...form, venue: e.target.value })}
          />
          <button className="al-btn" style={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add Event"}
          </button>
        </form>
        {submitError && <p style={styles.errorText}>{submitError}</p>}
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Artist Photo Library</h2>
        <p style={styles.hint}>
          Upload 1–10 real photos per artist. The AI scores each one and the best frame is used automatically —
          uploaded photos always beat auto-sourced ones.
        </p>
        <form onSubmit={handleUpload} style={styles.form}>
          <input
            style={styles.input}
            placeholder="Artist name"
            required
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
          />
          <input
            id="photo-files"
            style={styles.input}
            type="file"
            accept="image/*"
            multiple
            required
            onChange={(e) => setUploadFiles(e.target.files)}
          />
          <button className="al-btn" style={styles.button} type="submit" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload Photos"}
          </button>
        </form>
        {uploadError && <p style={styles.errorText}>{uploadError}</p>}
        {artists.filter((a) => a.artist_photos.length > 0).length > 0 && (
          <div style={{ marginTop: 24 }}>
            {artists
              .filter((a) => a.artist_photos.length > 0)
              .map((artist) => (
                <div key={artist.id} style={styles.artistRow}>
                  <div style={styles.artistName}>{artist.name}</div>
                  <div style={styles.photoStrip}>
                    {artist.artist_photos.map((photo) => (
                      <div key={photo.id} style={styles.photoThumbWrap}>
                        <Image src={photo.url} alt={artist.name} fill sizes="72px" style={styles.photoThumb} />
                        {photo.quality_score != null && (
                          <span style={styles.scoreBadge}>{Math.round(photo.quality_score * 100)}</span>
                        )}
                        <button
                          className="al-btn"
                          style={styles.deleteButton}
                          onClick={() => handleDeletePhoto(photo.id)}
                          type="button"
                          aria-label={`Delete photo of ${artist.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Events</h2>
        <div style={styles.filterBar}>
          <input
            style={styles.input}
            placeholder="Filter by city"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          />
          <input
            style={styles.input}
            type="date"
            aria-label="From date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <input
            style={styles.input}
            type="date"
            aria-label="To date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
          {filtersActive && (
            <button
              className="al-btn"
              style={styles.smallButton}
              type="button"
              onClick={() => {
                setFilterCity("");
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
            >
              Clear
            </button>
          )}
          <button
            className="al-btn"
            style={{ ...styles.smallButton, marginLeft: "auto" }}
            type="button"
            onClick={handleGenerateAll}
            disabled={bulkGenerating || generatingId !== null || pendingCount === 0}
          >
            {bulkGenerating && bulkProgress
              ? `Generating ${bulkProgress.done}/${bulkProgress.total}…`
              : `Generate All (${pendingCount})`}
          </button>
        </div>
        {loading ? (
          <p style={styles.muted}>Loading…</p>
        ) : events.length === 0 ? (
          <p style={styles.muted}>No events yet.</p>
        ) : filteredEvents.length === 0 ? (
          <p style={styles.muted}>No events match this filter.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Artist</th>
                <th style={styles.th}>Venue / City</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Layout</th>
                <th style={styles.th}>AI Scene Brief</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => {
                const hasBrief = Boolean(briefByEvent[event.id]?.trim());
                return (
                <tr key={event.id} className="al-row">
                  <td style={styles.td}>{event.event_date}</td>
                  <td style={styles.td}>{event.artist_name_raw}</td>
                  <td style={styles.td}>
                    {event.venue} — {event.city}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, borderColor: STATUS_COLOR[event.status], color: STATUS_COLOR[event.status] }}>
                      {STATUS_LABEL[event.status]}
                    </span>
                    {event.error_message && <div style={styles.errorText}>{event.error_message}</div>}
                    {generateErrors[event.id] && <div style={styles.errorText}>{generateErrors[event.id]}</div>}
                    {event.posters.length > 0 && (
                      <div style={styles.posterCount}>
                        {event.posters.length} poster{event.posters.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <select
                      style={styles.select}
                      value={variantByEvent[event.id] ?? "masthead"}
                      onChange={(e) =>
                        setVariantByEvent({ ...variantByEvent, [event.id]: e.target.value as PosterVariant })
                      }
                      disabled={hasBrief}
                      aria-label={`Poster layout for ${event.artist_name_raw}`}
                    >
                      {VARIANTS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} — {v.hint}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <input
                      style={{ ...styles.input, flex: "none", width: 170, fontSize: 12 }}
                      placeholder="e.g. Lacrim in GTA 6, 4K"
                      value={briefByEvent[event.id] ?? ""}
                      onChange={(e) => setBriefByEvent({ ...briefByEvent, [event.id]: e.target.value })}
                      aria-label={`AI scene brief for ${event.artist_name_raw}`}
                    />
                    {hasBrief && <div style={styles.hintSmall}>Overrides layout — ~$0.04/image</div>}
                  </td>
                  <td style={styles.td}>
                    <button
                      className="al-btn"
                      style={styles.smallButton}
                      onClick={() => handleGenerate(event.id)}
                      disabled={generatingId === event.id || (bulkGenerating && generatingId !== event.id)}
                    >
                      {generatingId === event.id ? "Generating…" : "Generate"}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Gallery</h2>
        {eventsWithPosters.length === 0 ? (
          <p style={styles.muted}>
            {filtersActive ? "No posters match this filter." : "No posters generated yet."}
          </p>
        ) : (
          <>
            <div style={styles.galleryHeaderRow}>
              <p style={{ ...styles.hint, marginBottom: 0 }}>
                {totalPosters} poster{totalPosters === 1 ? "" : "s"} across {eventsWithPosters.length} event
                {eventsWithPosters.length === 1 ? "" : "s"}
                {filtersActive ? " (filtered)" : ""}.
              </p>
              <a className="al-btn" style={styles.smallButton} href={`/api/posters/zip${zipQuery ? `?${zipQuery}` : ""}`}>
                Download ZIP
              </a>
            </div>
            <div style={styles.galleryGroups}>
              {eventsWithPosters.map((event) => (
                <div key={event.id} style={styles.galleryGroup}>
                  <div style={styles.galleryGroupHeader}>
                    <span style={styles.galleryGroupName}>{event.artist_name_raw}</span>
                    <span style={styles.galleryGroupMeta}>
                      {event.venue} — {event.city} — {event.event_date}
                    </span>
                  </div>
                  <div style={styles.gallery}>
                    {event.posters.map((poster) => (
                      <a
                        key={poster.id}
                        href={poster.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="al-card"
                        style={styles.galleryItem}
                      >
                        <div style={styles.galleryImgWrap}>
                          <Image
                            src={poster.image_url}
                            alt={`${event.artist_name_raw} — ${VARIANT_LABEL[poster.variant]}`}
                            fill
                            sizes="(max-width: 640px) 45vw, 220px"
                            style={styles.galleryImg}
                          />
                        </div>
                        <div style={styles.galleryCaption}>{VARIANT_LABEL[poster.variant] ?? poster.variant}</div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 960, margin: "0 auto", padding: "48px 24px 96px" },
  header: { marginBottom: 44 },
  kicker: {
    fontSize: 13,
    letterSpacing: 3,
    color: "var(--concrete)",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "var(--font-anton), Arial, sans-serif",
    fontWeight: 400,
    fontSize: 44,
    marginTop: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerRule: { marginTop: 20, width: 88, height: 2, background: "var(--gold)" },
  pageErrorBanner: {
    background: "rgba(176,69,63,0.12)",
    border: "1px solid #b0453f",
    color: "#e8a19c",
    padding: "12px 16px",
    fontSize: 13,
    marginBottom: 32,
  },
  panel: {
    marginBottom: 40,
    paddingBottom: 40,
    borderBottom: "1px solid rgba(245,242,234,0.12)",
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "var(--gold)",
    marginBottom: 16,
    fontWeight: 700,
  },
  form: { display: "flex", gap: 12, flexWrap: "wrap" },
  filterBar: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" },
  galleryHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  input: {
    background: "transparent",
    border: "1px solid rgba(245,242,234,0.25)",
    color: "var(--off-white)",
    padding: "10px 12px",
    fontSize: 14,
    flex: "1 1 160px",
  },
  select: {
    background: "transparent",
    border: "1px solid rgba(245,242,234,0.25)",
    color: "var(--off-white)",
    padding: "6px 8px",
    fontSize: 12,
  },
  button: {
    background: "var(--gold)",
    color: "var(--ink)",
    border: "none",
    padding: "10px 20px",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
  },
  smallButton: {
    background: "transparent",
    color: "var(--off-white)",
    border: "1px solid var(--gold)",
    padding: "6px 14px",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
  },
  muted: { color: "var(--concrete)", fontSize: 14 },
  hint: { color: "var(--concrete)", fontSize: 13, marginBottom: 16, maxWidth: 560 },
  hintSmall: { color: "var(--gold)", fontSize: 10, marginTop: 4, maxWidth: 170 },
  artistRow: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 },
  artistName: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, minWidth: 140, paddingTop: 8 },
  photoStrip: { display: "flex", flexWrap: "wrap", gap: 8 },
  photoThumbWrap: { position: "relative", width: 72, height: 90 },
  photoThumb: { objectFit: "cover", filter: "grayscale(1)" },
  scoreBadge: {
    position: "absolute",
    bottom: 2,
    left: 2,
    background: "rgba(11,11,10,0.85)",
    color: "var(--gold)",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 5px",
    zIndex: 1,
  },
  deleteButton: {
    position: "absolute",
    top: 2,
    right: 2,
    background: "rgba(11,11,10,0.85)",
    color: "var(--off-white)",
    border: "none",
    width: 18,
    height: 18,
    lineHeight: "16px",
    cursor: "pointer",
    fontSize: 13,
    padding: 0,
    zIndex: 1,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "var(--concrete)",
    borderBottom: "1px solid rgba(245,242,234,0.2)",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid rgba(245,242,234,0.08)",
    verticalAlign: "top",
  },
  badge: {
    border: "1px solid",
    borderRadius: 2,
    padding: "3px 8px",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: 700,
  },
  posterCount: { color: "var(--concrete)", fontSize: 11, marginTop: 5 },
  errorText: { color: "#b0453f", fontSize: 11, marginTop: 4, maxWidth: 220 },
  galleryGroups: { display: "flex", flexDirection: "column", gap: 32 },
  galleryGroup: {},
  galleryGroupHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  galleryGroupName: { fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  galleryGroupMeta: { fontSize: 12, color: "var(--concrete)" },
  gallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 },
  galleryItem: {
    display: "block",
    border: "1px solid rgba(245,242,234,0.12)",
    padding: 6,
  },
  galleryImgWrap: { position: "relative", width: "100%", aspectRatio: "4/5" },
  galleryImg: { objectFit: "cover" },
  galleryCaption: {
    fontSize: 11,
    marginTop: 6,
    color: "var(--gold)",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: 700,
  },
};
