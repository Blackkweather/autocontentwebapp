"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Poster = { id: string; image_url: string; created_at: string };
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

export default function AdminPage() {
  const [events, setEvents] = useState<EventWithPosters[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [form, setForm] = useState({ artistName: "", eventDate: "", city: "", venue: "" });
  const [uploadName, setUploadName] = useState("");
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function loadEvents() {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data.events ?? []);
    setLoading(false);
  }

  async function loadArtists() {
    const res = await fetch("/api/artists");
    const data = await res.json();
    setArtists(data.artists ?? []);
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
    let cancelled = false;
    (async () => {
      const [eventsRes, artistsRes] = await Promise.all([fetch("/api/events"), fetch("/api/artists")]);
      const eventsData = await eventsRes.json();
      const artistsData = await artistsRes.json();
      if (cancelled) return;
      setEvents(eventsData.events ?? []);
      setArtists(artistsData.artists ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ artistName: "", eventDate: "", city: "", venue: "" });
    setSubmitting(false);
    await loadEvents();
  }

  async function handleGenerate(id: string) {
    setGeneratingId(id);
    await fetch(`/api/events/${id}/generate`, { method: "POST" });
    setGeneratingId(null);
    await loadEvents();
  }

  const allPosters = events.flatMap((e) => e.posters.map((p) => ({ ...p, event: e })));

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.kicker}>Amaze Live</div>
        <h1 style={styles.title}>Poster Pipeline</h1>
      </header>

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
          <button style={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add Event"}
          </button>
        </form>
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
          <button style={styles.button} type="submit" disabled={uploading}>
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
                        <img src={photo.url} alt={artist.name} style={styles.photoThumb} />
                        {photo.quality_score != null && (
                          <span style={styles.scoreBadge}>{Math.round(photo.quality_score * 100)}</span>
                        )}
                        <button style={styles.deleteButton} onClick={() => handleDeletePhoto(photo.id)} type="button">
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
        {loading ? (
          <p style={styles.muted}>Loading…</p>
        ) : events.length === 0 ? (
          <p style={styles.muted}>No events yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Artist</th>
                <th style={styles.th}>Venue / City</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td style={styles.td}>{event.event_date}</td>
                  <td style={styles.td}>{event.artist_name_raw}</td>
                  <td style={styles.td}>
                    {event.venue} — {event.city}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, borderColor: STATUS_COLOR[event.status] }}>{event.status}</span>
                    {event.error_message && <div style={styles.errorText}>{event.error_message}</div>}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.smallButton}
                      onClick={() => handleGenerate(event.id)}
                      disabled={generatingId === event.id}
                    >
                      {generatingId === event.id ? "Generating…" : "Generate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Gallery</h2>
        {allPosters.length === 0 ? (
          <p style={styles.muted}>No posters generated yet.</p>
        ) : (
          <div style={styles.gallery}>
            {allPosters.map((poster) => (
              <a key={poster.id} href={poster.image_url} target="_blank" rel="noreferrer" style={styles.galleryItem}>
                <img src={poster.image_url} alt={poster.event.artist_name_raw} style={styles.galleryImg} />
                <div style={styles.galleryCaption}>{poster.event.artist_name_raw}</div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 960, margin: "0 auto", padding: "48px 24px 96px" },
  header: { marginBottom: 40 },
  kicker: {
    fontSize: 13,
    letterSpacing: 3,
    color: "var(--concrete)",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  title: { fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: -0.5 },
  panel: {
    marginBottom: 40,
    paddingBottom: 40,
    borderBottom: "1px solid rgba(245,242,234,0.12)",
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "var(--concrete)",
    marginBottom: 16,
    fontWeight: 700,
  },
  form: { display: "flex", gap: 12, flexWrap: "wrap" },
  input: {
    background: "transparent",
    border: "1px solid rgba(245,242,234,0.25)",
    color: "var(--off-white)",
    padding: "10px 12px",
    fontSize: 14,
    flex: "1 1 160px",
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
  artistRow: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 },
  artistName: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, minWidth: 140, paddingTop: 8 },
  photoStrip: { display: "flex", flexWrap: "wrap", gap: 8 },
  photoThumbWrap: { position: "relative", width: 72, height: 90 },
  photoThumb: { width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(1)" },
  scoreBadge: {
    position: "absolute",
    bottom: 2,
    left: 2,
    background: "rgba(11,11,10,0.85)",
    color: "var(--gold)",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 5px",
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
  },
  errorText: { color: "#b0453f", fontSize: 11, marginTop: 4, maxWidth: 220 },
  gallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 },
  galleryItem: { display: "block" },
  galleryImg: { width: "100%", aspectRatio: "4/5", objectFit: "cover", display: "block" },
  galleryCaption: { fontSize: 12, marginTop: 6, color: "var(--concrete)" },
};
