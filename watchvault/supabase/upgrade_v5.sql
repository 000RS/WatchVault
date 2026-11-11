-- WatchVault v5 upgrade: every shelf (books, manga, games, music, podcasts, places, events, travel, anything),
-- Swipe and Group Swipe, taste matching, battles and challenges.
-- Run once in Supabase → SQL Editor → New query → Run (after upgrade_v4.sql). Safe to run more than once.
-- Only ADDS things. Everything already in your list stays as it is.

------------------------------------------------------------
-- 1. Entries can be anything now
------------------------------------------------------------
alter table public.entries drop constraint if exists entries_source_check;
alter table public.entries drop constraint if exists entries_media_type_check;
alter table public.entries add constraint entries_source_check check (char_length(source) between 2 and 20);
alter table public.entries add constraint entries_media_type_check
  check (media_type in ('movie', 'tv', 'anime', 'book', 'manga', 'game', 'music', 'podcast', 'place', 'event', 'travel', 'custom'));

-- Extra facts per kind: author, artist, platform, address, coordinates, venue and date, link.
alter table public.entries add column if not exists meta      jsonb not null default '{}'::jsonb;
alter table public.entries add column if not exists favourite boolean not null default false;

drop view if exists public.shared_entries;
create view public.shared_entries as
  select id, user_id, source, source_id, media_type, category, title, original_title, poster_url, year,
         origin_country, original_language, total_episodes, total_seasons, season_episode_counts, runtime,
         status, current_season, current_episode, episodes_watched, movie_progress_pct, rating,
         genres, popularity, watched_from, watched_to, review, review_spoiler, tags, rewatch_count,
         best_episode, credits, tmdb_rating, meta, favourite, created_at, updated_at
  from public.entries
  where public.can_view(user_id);
grant select on public.shared_entries to anon, authenticated;

------------------------------------------------------------
-- 2. Diary understands visits and notes
------------------------------------------------------------
alter table public.diary drop constraint if exists diary_kind_check;
alter table public.diary add constraint diary_kind_check check (kind in ('watch', 'rewatch', 'episode', 'visit', 'note'));
alter table public.diary add column if not exists note      text check (char_length(note) <= 1000);
alter table public.diary add column if not exists with_whom text check (char_length(with_whom) <= 120);

create or replace function public.diary_from_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta int;
  d date;
begin
  if tg_op = 'INSERT' then
    if new.watched_to is not null then
      insert into diary (user_id, entry_id, watched_on, kind, title, poster_url, source, source_id, media_type, category, runtime)
      values (new.user_id, new.id, new.watched_to, case when new.media_type = 'place' then 'visit' else 'watch' end, new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
    end if;
    return new;
  end if;
  if old.source is distinct from new.source then return new; end if;

  if new.rewatch_count > old.rewatch_count then
    insert into diary (user_id, entry_id, kind, title, poster_url, source, source_id, media_type, category, runtime)
    values (new.user_id, new.id, 'rewatch', new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
  end if;

  delta := coalesce(new.episodes_watched, 0) - coalesce(old.episodes_watched, 0);
  -- Episodes of shows and podcasts are logged one by one (not when a whole show is marked Completed in one go).
  if new.media_type in ('tv', 'anime', 'podcast') and delta between 1 and 6 and not (new.status = 'completed' and old.status <> 'completed' and delta > 1) then
    for i in 1..delta loop
      insert into diary (user_id, entry_id, kind, season, episode, title, poster_url, source, source_id, media_type, category, runtime)
      values (new.user_id, new.id, 'episode', new.current_season,
              case when new.current_episode is not null then new.current_episode - delta + i end,
              new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
    end loop;
  end if;
  -- Another visit to a place.
  if new.media_type = 'place' and delta between 1 and 3 then
    insert into diary (user_id, entry_id, kind, title, poster_url, source, source_id, media_type, category)
    values (new.user_id, new.id, 'visit', new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category);
  end if;

  if new.status = 'completed' and old.status in ('watching', 'on_hold') then
    insert into diary (user_id, entry_id, kind, title, poster_url, source, source_id, media_type, category, runtime)
    values (new.user_id, new.id, case when new.media_type = 'place' then 'visit' else 'watch' end, new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
  end if;

  if new.watched_to is not null and new.watched_to is distinct from old.watched_to then
    d := new.watched_to;
    if not exists (select 1 from diary where entry_id = new.id and watched_on = d and kind in ('watch', 'visit')) then
      insert into diary (user_id, entry_id, watched_on, kind, title, poster_url, source, source_id, media_type, category, runtime)
      values (new.user_id, new.id, d, case when new.media_type = 'place' then 'visit' else 'watch' end, new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
    end if;
  end if;
  return new;
end $$;

------------------------------------------------------------
-- 3. Taste matching (opt-in). Only a summary is shared: shelves, genres and favourite titles.
------------------------------------------------------------
alter table public.profiles add column if not exists discoverable boolean not null default false;
alter table public.profiles add column if not exists taste        jsonb;

------------------------------------------------------------
-- 4. Swipe: what you liked, had seen, or skipped
------------------------------------------------------------
create table if not exists public.swipes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source     text not null,
  media_type text not null,
  source_id  text not null,
  verdict    text not null check (verdict in ('like', 'seen', 'skip')),
  title      text,
  poster_url text,
  category   text,
  genres     text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, source, media_type, source_id)
);
alter table public.swipes enable row level security;
drop policy if exists "own swipes" on public.swipes;
create policy "own swipes" on public.swipes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

------------------------------------------------------------
-- 5. Group Swipe rooms: join with a code, everyone swipes, matches appear
------------------------------------------------------------
create table if not exists public.swipe_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9]{5,8}$'),
  name       text check (char_length(name) <= 60),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  filters    jsonb not null default '{}'::jsonb,
  deck       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.swipe_room_members (
  room_id   uuid not null references public.swipe_rooms (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table if not exists public.swipe_room_votes (
  room_id  uuid not null references public.swipe_rooms (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null,
  vote     smallint not null check (vote in (-1, 1)),
  primary key (room_id, user_id, item_key)
);
create or replace function public.is_room_member(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from swipe_room_members where room_id = r and user_id = auth.uid())
      or exists (select 1 from swipe_rooms where id = r and created_by = auth.uid());
$$;
alter table public.swipe_rooms        enable row level security;
alter table public.swipe_room_members enable row level security;
alter table public.swipe_room_votes   enable row level security;
drop policy if exists "rooms readable"   on public.swipe_rooms;
drop policy if exists "create rooms"     on public.swipe_rooms;
drop policy if exists "owner edits room" on public.swipe_rooms;
drop policy if exists "owner deletes room" on public.swipe_rooms;
-- Anyone signed in can open a room if they know its code (codes are random).
create policy "rooms readable"     on public.swipe_rooms for select using (auth.uid() is not null);
create policy "create rooms"       on public.swipe_rooms for insert with check (auth.uid() = created_by);
create policy "owner edits room"   on public.swipe_rooms for update using (auth.uid() = created_by);
create policy "owner deletes room" on public.swipe_rooms for delete using (auth.uid() = created_by);
drop policy if exists "members see members" on public.swipe_room_members;
drop policy if exists "join room"           on public.swipe_room_members;
drop policy if exists "leave room"          on public.swipe_room_members;
create policy "members see members" on public.swipe_room_members for select using (public.is_room_member(room_id));
create policy "join room"           on public.swipe_room_members for insert with check (auth.uid() = user_id);
create policy "leave room"          on public.swipe_room_members for delete using (auth.uid() = user_id);
drop policy if exists "members see votes" on public.swipe_room_votes;
drop policy if exists "own votes"         on public.swipe_room_votes;
create policy "members see votes" on public.swipe_room_votes for select using (public.is_room_member(room_id));
create policy "own votes"         on public.swipe_room_votes for all using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_room_member(room_id));

------------------------------------------------------------
-- 6. Recommendation battles: "which should I watch first?" Friends vote.
------------------------------------------------------------
create table if not exists public.battles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question   text check (char_length(question) <= 140),
  a          jsonb not null,
  b          jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.battle_votes (
  battle_id uuid not null references public.battles (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pick      text not null check (pick in ('a', 'b')),
  primary key (battle_id, user_id)
);
alter table public.battles      enable row level security;
alter table public.battle_votes enable row level security;
drop policy if exists "see battles"   on public.battles;
drop policy if exists "own battles"   on public.battles;
create policy "see battles" on public.battles for select using (public.can_view(user_id));
create policy "own battles" on public.battles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "see battle votes" on public.battle_votes;
drop policy if exists "vote in battles"  on public.battle_votes;
create policy "see battle votes" on public.battle_votes for select
  using (exists (select 1 from public.battles b where b.id = battle_id and public.can_view(b.user_id)));
create policy "vote in battles" on public.battle_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.battles b where b.id = battle_id and public.can_view(b.user_id)));

------------------------------------------------------------
-- 7. Friend challenges: "Watch three hidden gems this month"
------------------------------------------------------------
create table if not exists public.challenges (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  rule       jsonb not null,      -- { shelf, status, count, gems }
  starts_on  date not null default current_date,
  ends_on    date not null,
  created_at timestamptz not null default now()
);
create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  primary key (challenge_id, user_id)
);
create or replace function public.is_challenge_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenge_members where challenge_id = c and user_id = auth.uid())
      or exists (select 1 from challenges where id = c and created_by = auth.uid());
$$;
alter table public.challenges        enable row level security;
alter table public.challenge_members enable row level security;
drop policy if exists "see challenges"   on public.challenges;
drop policy if exists "own challenges"   on public.challenges;
create policy "see challenges" on public.challenges for select using (public.is_challenge_member(id));
create policy "own challenges" on public.challenges for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
drop policy if exists "see challenge members"  on public.challenge_members;
drop policy if exists "add challenge members"  on public.challenge_members;
drop policy if exists "leave challenge"        on public.challenge_members;
create policy "see challenge members" on public.challenge_members for select using (public.is_challenge_member(challenge_id));
create policy "add challenge members" on public.challenge_members for insert
  with check (auth.uid() = user_id or exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid()));
create policy "leave challenge" on public.challenge_members for delete
  using (auth.uid() = user_id or exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid()));
