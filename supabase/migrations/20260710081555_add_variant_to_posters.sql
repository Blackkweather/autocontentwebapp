-- Applied live via mcp__Supabase__apply_migration on 2026-07-10. Existing posters (all
-- generated before the admin UI exposed a layout picker) backfill as 'masthead'.
alter table public.posters
  add column if not exists variant text not null default 'masthead'
  check (variant = any (array['masthead', 'light', 'flyer', 'halo']));
