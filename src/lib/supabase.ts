import { createClient } from "@supabase/supabase-js";

// Fallbacks only guard Next.js's build-time "collect page data" step, which imports every
// route module (and therefore this file) even when the env vars used at real runtime aren't
// injected yet — e.g. before a Vercel project has its environment variables configured.
// A missing/wrong URL still fails loudly at the first real request; it just won't crash the build.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.invalid";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(url, anonKey);

// Bypasses RLS — only use in server-side code (API routes), never expose to the client.
export const supabaseAdmin = createClient(url, serviceRoleKey || anonKey);

export type ArtistRow = {
  id: string;
  name: string;
  photo_url: string | null;
  source: "database" | "socialcrawl" | "google_cse" | "brave" | "manual" | "none";
  created_at: string;
};

export type EventRow = {
  id: string;
  event_date: string;
  artist_name_raw: string;
  artist_id: string | null;
  venue: string;
  city: string;
  utility_line: string | null;
  status: "pending" | "photo_missing" | "generating" | "done" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type PosterRow = {
  id: string;
  event_id: string;
  image_url: string;
  variant: "masthead" | "light" | "flyer" | "halo";
  created_at: string;
};
