-- Club OS intelligence modules read from these tables (Guest Intelligence, Promoter
-- Intelligence, City Intelligence). Written only via the service-role key, like the rest of the
-- schema; RLS is enabled with no permissive policies as defense in depth.

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  visits integer not null default 0,
  total_spend numeric not null default 0,
  favorite_dj text,
  is_vip boolean not null default false,
  attend_probability real not null default 0.5,
  created_at timestamptz not null default now()
);
alter table public.guests enable row level security;

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  guests_brought integer not null default 0,
  revenue numeric not null default 0,
  conversion real not null default 0,
  roi real not null default 0,
  fake_flag boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.promoters enable row level security;

create table if not exists public.city_events (
  id uuid primary key default gen_random_uuid(),
  venue text not null,
  title text not null,
  note text,
  clash_level text not null default 'low' check (clash_level in ('low','medium','high')),
  event_date date,
  created_at timestamptz not null default now()
);
alter table public.city_events enable row level security;
