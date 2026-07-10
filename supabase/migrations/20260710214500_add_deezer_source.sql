-- Applied live via mcp__Supabase__apply_migration on 2026-07-10.
alter table public.artists drop constraint if exists artists_source_check;
alter table public.artists add constraint artists_source_check
  check (source = any (array['database', 'socialcrawl', 'google_cse', 'brave', 'deezer', 'manual', 'none']));
