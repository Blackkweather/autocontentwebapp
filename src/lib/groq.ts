// Groq — turns raw event data into on-brand copy (utility line + tagline + normalized artist name).

const API_KEY = process.env.GROQ_API_KEY || "";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

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

const SYSTEM_PROMPT = `You write copy for Amaze Live, an international event booking & production agency
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
  if (!API_KEY) {
    throw new Error("GROQ_API_KEY is not set");
  }
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            artist_name_raw: input.artistNameRaw,
            event_date: input.eventDate,
            venue: input.venue,
            city: input.city,
          }),
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq request failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content");
  const parsed = JSON.parse(content) as { artist_name: string; utility_line: string; tagline: string };
  return { artistName: parsed.artist_name, utilityLine: parsed.utility_line, tagline: parsed.tagline };
}
