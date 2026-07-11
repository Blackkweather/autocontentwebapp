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

// The first live AI Scene Brief test ("Street Fighter tournament, PLK as a Ryu-style fighter")
// came back with the actual "STREET FIGHTER" trademarked logo rendered into the scene, because
// nothing told the image model not to — a real legal exposure for a business posting these
// publicly, not just a look issue. Fixed by hard-ruling the title graphic to "AMAZE LIVE" — but
// the very next test (Freeze Corleone × Naza) showed the model still invents its OWN stray
// tagline text in the scene on its own initiative ("THE ULTIMATE SOUNDCLASH EXPERIENCE", washed
// out at the bottom, competing with our real utility line) even though it was never asked to.
// Forbidding "our" text wasn't enough — it has to be told the scene may contain NO typography
// at all except the one title graphic. This enhancer rewrites the user's casual brief into a
// detailed, precise image-generation prompt before it reaches Nano Banana: fills in concrete
// visual detail a non-technical user wouldn't think to specify (lighting, camera, palette,
// composition), locks the one permitted title graphic to "AMAZE LIVE", and bans every other
// piece of in-scene text outright. Best-effort — if Groq is unavailable this falls back to the
// raw brief rather than blocking generation on it.
const PROMPT_ENHANCER_SYSTEM = `You are the creative director for Amaze Live's key art — the standard is
the biggest brand campaigns and AAA game box art in the world, not a generic AI image. Given a short,
casual creative brief from a non-technical user, rewrite it into a detailed, vivid, precise
image-generation prompt, 2-4 sentences, plain prose. The goal is never just "technically correct" — it's
a poster someone remembers, that makes them feel something (awe, nostalgia, adrenaline, hype) the moment
they see it, the way an iconic movie poster or album cover does.

Rules:
- Preserve the user's core creative idea and any style/character references exactly (e.g. referencing
  "Street Fighter" or "GTA" as a genre/aesthetic inspiration is fine and encouraged for mood).
- Add concrete visual detail the user didn't think to specify: camera angle, lighting, color palette,
  mood, environment, pose, composition — the specific, sensory details that separate iconic key art
  from a flat snapshot (e.g. not just "dramatic lighting" but where the light source is and what it's
  doing to the scene; not just "city street" but time of day, weather, what's reflecting off what).
- If the brief implies any title, logo, or signage text should appear in the scene, it must read
  "AMAZE LIVE" — NEVER render any real third-party trademarked title, logo, or brand wordmark
  (e.g. write "a bold dramatic fighting-game-style logo reading AMAZE LIVE" instead of an actual
  "Street Fighter" logo). This is a hard rule, not a style preference.
- The scene must contain NO other text of any kind — no taglines, subtitles, straplines, dates,
  venue names, street signage copy, or invented slogans, even ones that seem thematically fitting.
  Explicitly end the prompt with an instruction like "no text or typography anywhere in the image
  except the AMAZE LIVE title graphic" — the model has a tendency to invent its own flavor text
  otherwise, and it always looks like an unintentional mistake, not a design choice.
- Do not add any poster text, artist name, venue, or date yourself — that's composited separately,
  and is covered by the same "no other text" rule above.
Reply strict JSON only: {"prompt": string}`;

export async function enhanceScenePrompt(rawBrief: string): Promise<string> {
  try {
    const parsed = await groqChatJSON<{ prompt: string }>(GROQ_MODELS.reasoner, [
      { role: "system", content: PROMPT_ENHANCER_SYSTEM },
      { role: "user", content: rawBrief },
    ]);
    return parsed.prompt?.trim() || rawBrief;
  } catch {
    return rawBrief;
  }
}
