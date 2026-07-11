import { NextResponse } from "next/server";
import { groqChatWithTools, GROQ_MODELS, type ChatMessage, type ToolDef } from "@/lib/groq";
import { supabaseAdmin } from "@/lib/supabase";
import { generatePosterForEvent } from "@/lib/pipeline";
import type { PosterVariant } from "@/lib/poster/render";

// A tool round can itself trigger a full poster generation (photo sourcing + VLM screening +
// render, or a Nano Banana call) — same budget as the generate route.
export const maxDuration = 300;

// gpt-oss-120b, not the llama-3.3 reasoner default used elsewhere in this app — Groq has flagged
// llama-3.3-70b-versatile for deprecation and explicitly points migrations at this model, and
// tool-calling reliability matters more here than anywhere else Groq is used in this pipeline.
const CHAT_MODEL = GROQ_MODELS.reasonerFallback;
const MAX_ROUNDS = 6;
const VALID_VARIANTS: PosterVariant[] = ["masthead", "light", "flyer", "halo"];

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "list_events",
      description:
        "List current events (id, artist name, date, venue, city, status). Call this first whenever the user " +
        "refers to an artist or event by name without giving an id, so you can resolve which event they mean.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Create a new event for an artist.",
      parameters: {
        type: "object",
        properties: {
          artistName: { type: "string" },
          eventDate: { type: "string", description: "ISO date, YYYY-MM-DD" },
          city: { type: "string" },
          venue: { type: "string" },
        },
        required: ["artistName", "eventDate", "city", "venue"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_poster",
      description:
        "Generate a poster for an existing event (get its id from list_events or create_event first). " +
        'mode="template" uses the artist\'s real sourced photo composited into a brand layout — free, use this ' +
        "for a plain request with no creative theme. " +
        'mode="ai_scene" generates a custom AI scene from a creative brief, using the event\'s artist\'s real ' +
        "photo so the result keeps their actual likeness — use this whenever the user describes a scene, " +
        "character, video game, movie reference, or specific visual idea (write a clear, detailed brief " +
        "yourself based on what they described, don't just copy their words verbatim). " +
        'mode="ai_lineup" is the same as ai_scene but also fuses 1-2 other named artists\' real photos into the ' +
        "same scene — use this when the user names more than one artist for the same poster. " +
        "ai_scene/ai_lineup cost real money (~$0.03-0.04/image); template is free.",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          mode: { type: "string", enum: ["template", "ai_scene", "ai_lineup"] },
          variant: {
            type: "string",
            enum: ["masthead", "light", "flyer", "halo"],
            description: 'Only for mode="template". Defaults to "masthead" if omitted.',
          },
          brief: { type: "string", description: 'Only for mode="ai_scene" or "ai_lineup".' },
          extraArtists: {
            type: "array",
            items: { type: "string" },
            description: 'Only for mode="ai_lineup" — 1 or 2 other real artist names to fuse into the scene.',
          },
        },
        required: ["eventId", "mode"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the operating assistant for Amaze Live's poster pipeline admin app. You act on
the user's behalf using the tools available — you are not just describing what to do, you actually do it.

Rules:
- When the user names an artist or event without an id, call list_events first to resolve it (match names
  case-insensitively, allow minor spelling variation). If more than one event plausibly matches, ask the
  user which one instead of guessing. If none match and they're asking to generate a poster, tell them no
  such event exists and ask if they want you to create one.
- For a "make a poster" request with any creative theme, scene, character, or visual idea, use
  generate_poster with mode="ai_scene" (or "ai_lineup" if they name multiple artists for the same poster) —
  write a detailed, vivid brief into the brief field yourself, don't just repeat their words verbatim. For a
  plain "make a poster" with no creative theme, use mode="template".
- You may create an event and then immediately generate its poster in the same turn if the user gave
  everything needed for both.
- Never invent event details (date, venue, city) the user didn't give you — ask instead.
- After acting, always end with a short, plain-language summary of exactly what happened (what was created,
  what generated, or what you need from them). Keep it conversational, not a report.`;

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "list_events": {
      const { data, error } = await supabaseAdmin
        .from("events")
        .select("id, artist_name_raw, event_date, city, venue, status")
        .order("event_date", { ascending: true })
        .limit(200);
      if (error) return { error: error.message };
      return { events: data ?? [] };
    }
    case "create_event": {
      const { artistName, eventDate, city, venue } = args as {
        artistName?: string;
        eventDate?: string;
        city?: string;
        venue?: string;
      };
      if (!artistName?.trim() || !eventDate || !city?.trim() || !venue?.trim()) {
        return { error: "artistName, eventDate, city, and venue are all required" };
      }
      const { data, error } = await supabaseAdmin
        .from("events")
        .insert({ artist_name_raw: artistName.trim(), event_date: eventDate, city: city.trim(), venue: venue.trim() })
        .select()
        .single();
      if (error) return { error: error.message };
      return { event: data };
    }
    case "generate_poster": {
      const { eventId, mode, variant, brief, extraArtists } = args as {
        eventId?: string;
        mode?: string;
        variant?: string;
        brief?: string;
        extraArtists?: string[];
      };
      if (!eventId || !mode) return { error: "eventId and mode are required" };
      if (mode === "template") {
        const v = VALID_VARIANTS.includes(variant as PosterVariant) ? (variant as PosterVariant) : undefined;
        return await generatePosterForEvent(eventId, v);
      }
      if (mode === "ai_scene") {
        if (!brief?.trim()) return { error: "brief is required for mode=ai_scene" };
        return await generatePosterForEvent(eventId, undefined, brief);
      }
      if (mode === "ai_lineup") {
        if (!brief?.trim()) return { error: "brief is required for mode=ai_lineup" };
        if (!extraArtists || extraArtists.length === 0) {
          return { error: "extraArtists (1-2 other artist names) is required for mode=ai_lineup" };
        }
        return await generatePosterForEvent(eventId, undefined, brief, extraArtists);
      }
      return { error: `unknown mode "${mode}"` };
    }
    default:
      return { error: `unknown tool "${name}"` };
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const userMessages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  if (userMessages.length === 0) return NextResponse.json({ error: "messages is required" }, { status: 400 });

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];
  let mutated = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { content, toolCalls } = await groqChatWithTools(CHAT_MODEL, messages, TOOLS, 120_000);
    if (toolCalls.length === 0) {
      return NextResponse.json({ reply: content ?? "", mutated });
    }
    messages.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // malformed args — let the tool's own validation report the missing fields
      }
      if (call.function.name === "create_event" || call.function.name === "generate_poster") mutated = true;
      const result = await runTool(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }

  return NextResponse.json({
    reply: "That took more steps than I'm allowed in one turn — try breaking it into smaller requests.",
    mutated,
  });
}
