-- The project previously shipped "anon full access" RLS policies (true/true, no restriction)
-- on artists, artist_photos, events, and posters — left over from initial scaffolding. The app
-- only ever queries through the service-role key, which bypasses RLS regardless of policy
-- content, so these policies had no legitimate function: they only meant anyone holding the
-- public anon/publishable key could read, write, update, or delete this data directly via the
-- Supabase REST API, bypassing the Next.js app (and its auth) entirely.
--
-- Applied live via mcp__Supabase__apply_migration as "revoke_anon_access_poster_pipeline" on
-- 2026-07-10; this file documents that change in version control. No replacement policies are
-- added — service-role access is unaffected, and RLS with zero permissive policies means every
-- other role gets nothing by default.

drop policy if exists "anon delete artist_photos" on public.artist_photos;
drop policy if exists "anon read artist_photos" on public.artist_photos;
drop policy if exists "anon write artist_photos" on public.artist_photos;
drop policy if exists "anon update artist_photos" on public.artist_photos;

drop policy if exists "anon write artists" on public.artists;
drop policy if exists "anon update artists" on public.artists;
drop policy if exists "anon read artists" on public.artists;

drop policy if exists "anon write events" on public.events;
drop policy if exists "anon read events" on public.events;
drop policy if exists "anon update events" on public.events;

drop policy if exists "anon read posters" on public.posters;
drop policy if exists "anon write posters" on public.posters;
