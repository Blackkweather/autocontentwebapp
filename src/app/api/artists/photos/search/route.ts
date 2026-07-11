import { NextResponse } from "next/server";
import { findPhotoCandidates } from "@/lib/photo";

// Same tiers the auto-sourcing pipeline uses, run concurrently for breadth — legitimately takes
// a while (Google/Brave/SocialCrawl + a VLM screen per candidate).
export const maxDuration = 60;

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const candidates = await findPhotoCandidates(name);
  return NextResponse.json({ candidates });
}
