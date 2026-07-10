-- Baseline snapshot of the poster-pipeline schema as it exists in production, committed so the
-- schema isn't reconstructible only from the Supabase dashboard. This project's Supabase
-- instance is shared with an unrelated pipeline (public.users / public.requests / public.logs) —
-- those tables are intentionally out of scope here and untouched by this file.
--
-- Every table below is read/written exclusively through the service-role key (supabaseAdmin in
-- src/lib/supabase.ts), which bypasses RLS unconditionally. RLS is left enabled with no
-- permissive policies as defense in depth: even if a future change starts using the anon/
-- publishable key, it gets nothing by default rather than the "anon full access" policies this
-- project previously shipped with (see 20260710090100_revoke_anon_access.sql).

create extension if not exists pgcrypto;

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  photo_url text,
  source text not null default 'none'
    check (source in ('database', 'socialcrawl', 'google_cse', 'brave', 'manual', 'none')),
  vlm_checked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.artist_photos (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id),
  url text not null,
  quality_score real,
  created_at timestamptz not null default now()
);
create index if not exists artist_photos_artist_id_idx on public.artist_photos(artist_id);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  artist_name_raw text not null,
  artist_id uuid references public.artists(id),
  venue text not null,
  city text not null,
  utility_line text,
  status text not null default 'pending'
    check (status in ('pending', 'photo_missing', 'generating', 'done', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_artist_id_idx on public.events(artist_id);
create index if not exists events_status_idx on public.events(status);

create table if not exists public.posters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  image_url text not null,
  variant text not null default 'masthead'
    check (variant in ('masthead', 'light', 'flyer', 'halo')),
  created_at timestamptz not null default now()
);
create index if not exists posters_event_id_idx on public.posters(event_id);

alter table public.artists enable row level security;
alter table public.artist_photos enable row level security;
alter table public.events enable row level security;
alter table public.posters enable row level security;

-- Storage: two public buckets, both written only via the service-role key.
--   posters        — rendered poster PNGs (src/lib/pipeline.ts)
--   artist-photos  — uploaded library photos + cached treated/subject/backdrop layers (src/lib/photo.ts)
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true), ('artist-photos', 'artist-photos', true)
on conflict (id) do nothing;
