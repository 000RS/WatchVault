-- WatchVault v2 upgrade
-- Run this once in Supabase → SQL Editor → New query → Run.
-- It only ADDS things. Every title already in your list stays exactly as it is.
-- Safe to run more than once.

------------------------------------------------------------
-- 1. New fields on your list entries
------------------------------------------------------------
alter table public.entries add column if not exists genres       text[];
alter table public.entries add column if not exists popularity   numeric;
alter table public.entries add column if not exists watched_from date;
alter table public.entries add column if not exists watched_to   date;

------------------------------------------------------------
-- 2. Profiles (username, bio, sharing and layout settings)
------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name      text check (char_length(display_name) <= 40),
  bio               text check (char_length(bio) <= 200),
  is_public         boolean not null default false,
  hidden_categories text[]  not null default '{}',
  home_sections     jsonb,
  showcase_size     int     not null default 5 check (showcase_size in (3, 5, 10)),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "insert own profile"    on public.profiles;
drop policy if exists "update own profile"    on public.profiles;
create policy "profiles are readable" on public.profiles for select using (true);
create policy "insert own profile"    on public.profiles for insert with check (auth.uid() = id);
create policy "update own profile"    on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- 3. Friends
------------------------------------------------------------
create table if not exists public.friendships (
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

alter table public.friendships enable row level security;
drop policy if exists "see own friendships"    on public.friendships;
drop policy if exists "send friend request"    on public.friendships;
drop policy if exists "accept friend request"  on public.friendships;
drop policy if exists "remove friendship"      on public.friendships;
create policy "see own friendships"   on public.friendships for select using (auth.uid() in (requester, addressee));
create policy "send friend request"   on public.friendships for insert with check (auth.uid() = requester and status = 'pending');
create policy "accept friend request" on public.friendships for update using (auth.uid() = addressee) with check (auth.uid() = addressee);
create policy "remove friendship"     on public.friendships for delete using (auth.uid() in (requester, addressee));

-- Who may see someone's vault: themselves, their friends, or anyone if the vault is public.
create or replace function public.can_view(owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select owner = auth.uid()
      or exists (select 1 from profiles p where p.id = owner and p.is_public)
      or exists (
           select 1 from friendships f
           where f.status = 'accepted'
             and ((f.requester = owner and f.addressee = auth.uid())
               or (f.addressee = owner and f.requester = auth.uid()))
         );
$$;

-- What friends and visitors can see of a list. Private notes are never included.
create or replace view public.shared_entries as
  select id, user_id, source, source_id, media_type, category, title, original_title, poster_url, year,
         origin_country, original_language, total_episodes, total_seasons, season_episode_counts, runtime,
         status, current_season, current_episode, episodes_watched, movie_progress_pct, rating,
         genres, popularity, watched_from, watched_to, created_at, updated_at
  from public.entries
  where public.can_view(user_id);

grant select on public.shared_entries to anon, authenticated;

------------------------------------------------------------
-- 4. Top lists (overall top 10, top anime, top movies, ...)
------------------------------------------------------------
create table if not exists public.top_lists (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_key   text not null,
  entry_ids  uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, list_key)
);

alter table public.top_lists enable row level security;
drop policy if exists "read visible top lists" on public.top_lists;
drop policy if exists "write own top lists"    on public.top_lists;
create policy "read visible top lists" on public.top_lists for select using (public.can_view(user_id));
create policy "write own top lists"    on public.top_lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

------------------------------------------------------------
-- 5. Activity history (filled in automatically)
------------------------------------------------------------
create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  entry_id    uuid,
  kind        text not null,            -- added, status, progress, rated
  title       text,
  poster_url  text,
  source      text,
  source_id   text,
  media_type  text,
  category    text,
  status      text,
  detail      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists activity_user_time_idx on public.activity (user_id, created_at desc);

alter table public.activity enable row level security;
drop policy if exists "read visible activity" on public.activity;
drop policy if exists "delete own activity"   on public.activity;
create policy "read visible activity" on public.activity for select using (public.can_view(user_id));
create policy "delete own activity"   on public.activity for delete using (auth.uid() = user_id);

create or replace function public.log_entry_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  k text;
  d text;
  recent_id bigint;
begin
  if tg_op = 'INSERT' then
    k := 'added';
  elsif old.source is distinct from new.source then
    return new;   -- the title was relinked to another catalogue, not a real change
  elsif old.status is distinct from new.status then
    k := 'status';
  elsif old.episodes_watched is distinct from new.episodes_watched
     or old.current_season  is distinct from new.current_season
     or old.current_episode is distinct from new.current_episode
     or old.movie_progress_pct is distinct from new.movie_progress_pct then
    k := 'progress';
  elsif old.rating is distinct from new.rating and new.rating is not null then
    k := 'rated';
  else
    return new;
  end if;

  if new.media_type = 'movie' then
    d := case when new.movie_progress_pct is not null then new.movie_progress_pct::text || '%' end;
  elsif new.current_season is not null then
    d := 'S' || new.current_season || ' E' || coalesce(new.current_episode, 0);
  elsif new.episodes_watched is not null then
    d := 'Ep ' || new.episodes_watched;
  end if;
  if k = 'rated' then d := new.rating::text; end if;

  -- Merge quick successive edits of the same title into one line of history.
  if tg_op = 'UPDATE' then
    select id into recent_id from activity
     where entry_id = new.id and kind in ('progress', 'rated', 'status', 'added')
       and updated_at > now() - interval '10 minutes'
     order by updated_at desc limit 1;
  end if;

  if recent_id is not null then
    update activity
       set kind = case when kind = 'added' then 'added' else k end,
           status = new.status, detail = d, title = new.title, poster_url = new.poster_url, updated_at = now()
     where id = recent_id;
  else
    insert into activity (user_id, entry_id, kind, title, poster_url, source, source_id, media_type, category, status, detail)
    values (new.user_id, new.id, k, new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.status, d);
  end if;
  return new;
end $$;

drop trigger if exists entries_activity on public.entries;
create trigger entries_activity after insert or update on public.entries
for each row execute function public.log_entry_activity();

-- Profiles for people who signed up before v2
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- New sign-ups get a profile automatically
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
