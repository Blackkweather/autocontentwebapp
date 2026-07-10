import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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
  created_at: string;
};
