// Groq — shared OpenAI-compatible chat client. Consolidated onto Groq (rather than a second
// provider like Nebius) because GROQ_API_KEY is already required for this app to do anything
// useful, Groq's free tier comfortably covers this app's volume (1,000 req/day on the shared
// high-quota tier), and one fewer credential to keep valid in practice beats a "better" model on
// paper — see the 2026-07-10 incident where a stale Nebius key silently broke every auto-sourced
// photo across every tier at once.

const API_KEY = process.env.GROQ_API_KEY || "";
const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_MODELS = {
  reasoner: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  reasonerFallback: "openai/gpt-oss-120b",
  vision: "meta-llama/llama-4-scout-17b-16e-instruct",
} as const;

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[]; // only on assistant messages that called a tool
  tool_call_id?: string; // only on role: "tool" messages, replying to a specific call
  name?: string; // only on role: "tool" messages — which tool this result is from
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
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

/** Tool-calling variant of groqChatJSON — no forced JSON response_format (incompatible with
 *  tool_calls), returns whichever the model produced: plain text (conversation turn) or one or
 *  more tool_calls (the model wants something executed before it can answer). The caller drives
 *  the loop: execute the calls, append role:"tool" results, call again. */
export async function groqChatWithTools(
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  timeoutMs = 60_000
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  if (!API_KEY) throw new Error("GROQ_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, messages, tools, tool_choice: "auto" }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq request failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const message = data.choices?.[0]?.message;
    return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
  } finally {
    clearTimeout(timer);
  }
}
