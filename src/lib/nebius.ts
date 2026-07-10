// Nebius Token Factory — shared OpenAI-compatible chat client.
// Used for: artist account disambiguation (DeepSeek), photo screening (Qwen2.5-VL),
// and copy generation fallback when no Groq key is configured.

const API_KEY = process.env.NEBIUS_API_KEY || "";
const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1";

export const NEBIUS_MODELS = {
  reasoner: "deepseek-ai/DeepSeek-V4-Pro", // deep music-scene knowledge — validated on the Leto/PSO Thug case
  reasonerFallback: "Qwen/Qwen3-235B-A22B-Instruct-2507",
  vision: "Qwen/Qwen2.5-VL-72B-Instruct",
} as const;

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export async function nebiusChatJSON<T>(model: string, messages: ChatMessage[], timeoutMs = 60_000): Promise<T> {
  if (!API_KEY) throw new Error("NEBIUS_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Nebius request failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Nebius returned no content");
    return JSON.parse(content) as T;
  } finally {
    clearTimeout(timer);
  }
}
