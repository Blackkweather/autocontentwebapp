// Groq — shared OpenAI-compatible chat client. Used for: event copy generation, artist account
// disambiguation, and photo screening (via Llama 4 Scout's native vision support). Consolidated
// onto Groq (rather than a second provider like Nebius) because GROQ_API_KEY is already required
// for this app to do anything useful, Groq's free tier comfortably covers this app's volume
// (1,000 req/day on the shared high-quota tier), and one fewer credential to keep valid in
// practice beats a "better" model on paper — see the 2026-07-10 incident where a stale Nebius
// key silently broke every auto-sourced photo across every tier at once.

const API_KEY = process.env.GROQ_API_KEY || "";
const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_MODELS = {
  reasoner: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  reasonerFallback: "openai/gpt-oss-120b",
  vision: "meta-llama/llama-4-scout-17b-16e-instruct",
} as const;

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export async function groqChatJSON<T>(model: string, messages: ChatMessage[], timeoutMs = 60_000): Promise<T> {
  if (!API_KEY) throw new Error("GROQ_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq request failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned no content");
    return JSON.parse(content) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface EventCopyInput {
  artistNameRaw: string;
  eventDate: string; // ISO date
  venue: string;
  city: string;
}

export interface EventCopyOutput {
  artistName: string;
  utilityLine: string;
  tagline: string;
}

const COPY_SYSTEM_PROMPT = `You write copy for Amaze Live, an international event booking & production agency
(nightlife, concerts, hospitality — Europe, Morocco, Middle East, Africa).
Voice: editorial, precise, confident. No exclamation points, ever. Always name the city/date/room plainly.
You output strict JSON only, matching this shape:
{"artist_name": string, "utility_line": string, "tagline": string}

"artist_name": the artist's name, cleaned up (correct casing as the artist styles it, no extra whitespace, no emoji/handles).
"utility_line": an all-caps, em-dash-separated utility line in the exact pattern
  "VENUE — CITY — MONTH DAY" (month spelled out, no leading zero on day), e.g. "SECRET ROOM — MARRAKECH — JULY 19".
"tagline": a 2-5 word all-caps editorial tagline for the poster, in the register of
  "LEGEND NEVER ENDS", "DESTIN POUR BRILLER", "THE CULTURE. THE VISION. THE MOVEMENT." —
  mythic, restrained, no hype words like "hot"/"crazy"/"insane", no exclamation points.
  If the artist is francophone, French is welcome. Never mention ticket sales.
Do not add any other punctuation, quotes, or commentary.`;

export async function generateEventCopy(input: EventCopyInput): Promise<EventCopyOutput> {
  const parsed = await groqChatJSON<{ artist_name: string; utility_line: string; tagline: string }>(GROQ_MODELS.reasoner, [
    { role: "system", content: COPY_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        artist_name_raw: input.artistNameRaw,
        event_date: input.eventDate,
        venue: input.venue,
        city: input.city,
      }),
    },
  ]);
  return { artistName: parsed.artist_name, utilityLine: parsed.utility_line, tagline: parsed.tagline };
}
