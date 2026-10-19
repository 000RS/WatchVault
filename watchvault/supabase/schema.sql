-- WatchVault database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.entries (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Where the title comes from: TMDB (movies, TV, dramas) or AniList (anime)
  source                 text not null check (source in ('tmdb', 'anilist')),
  source_id              text not null,
  media_type             text not null check (media_type in ('movie', 'tv', 'anime')),

  -- Which shelf it sits on: anime, movies, series, kdrama, turkish, indian, ...
  category               text not null,

  -- Snapshot of title info (refreshed whenever you open the title page)
  title                  text not null,
  original_title         text,
  poster_url             text,
  year                   int,
  origin_country         text,
  original_language      text,
  total_episodes         int,
  total_seasons          int,
  season_episode_counts  int[],          -- e.g. {16,16} for a 2-season show
  runtime                int,            -- movie length, or minutes per episode

  -- Your progress
  status                 text not null default 'plan'
                         check (status in ('watching', 'completed', 'plan', 'on_hold', 'dropped')),
  current_season         int,            -- TV: season you are on
  current_episode        int,            -- TV: last episode watched in that season
  episodes_watched       int,            -- total episodes watched (TV and anime)
  movie_progress_pct     int check (movie_progress_pct between 0 and 100),
  movie_minutes_watched  int,
  rating                 numeric(3,1) check (rating between 0 and 10),
  notes                  text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (user_id, source, media_type, source_id)
);

create index if not exists entries_user_updated_idx on public.entries (user_id, updated_at desc);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
for each row execute function public.touch_updated_at();

-- Row Level Security: every account only ever sees and changes its own rows
alter table public.entries enable row level security;

drop policy if exists "read own entries"   on public.entries;
drop policy if exists "insert own entries" on public.entries;
drop policy if exists "update own entries" on public.entries;
drop policy if exists "delete own entries" on public.entries;

create policy "read own entries"   on public.entries for select using (auth.uid() = user_id);
create policy "insert own entries" on public.entries for insert with check (auth.uid() = user_id);
create policy "update own entries" on public.entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own entries" on public.entries for delete using (auth.uid() = user_id);
