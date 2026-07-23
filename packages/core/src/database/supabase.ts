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
