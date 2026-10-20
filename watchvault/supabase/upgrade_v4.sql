-- WatchVault v4 upgrade
-- Run once in Supabase → SQL Editor → New query → Run (after upgrade_v2.sql and upgrade_v3.sql).
-- Only ADDS tables and columns. Everything already in your list stays as it is. Safe to run more than once.

------------------------------------------------------------
-- 1. More about each title in your list
------------------------------------------------------------
alter table public.entries add column if not exists review         text check (char_length(review) <= 5000);
alter table public.entries add column if not exists review_spoiler boolean not null default false;
alter table public.entries add column if not exists tags           text[] not null default '{}';
alter table public.entries add column if not exists rewatch_count  int not null default 0 check (rewatch_count >= 0);
alter table public.entries add column if not exists episode_log    jsonb not null default '{}'::jsonb;  -- {"2": {"5": {"r": 9}}} = season 2 episode 5 rated 9
alter table public.entries add column if not exists best_episode   text;                               -- "S2E5"
alter table public.entries add column if not exists credits        jsonb;                              -- cast, directors, writers, studios (for stats)
alter table public.entries add column if not exists tmdb_rating    numeric;                            -- the world's average, for "you vs the world"
alter table public.entries add column if not exists release_date   date;

-- Friends and visitors can read reviews and tags, still never private notes.
drop view if exists public.shared_entries;
create view public.shared_entries as
  select id, user_id, source, source_id, media_type, category, title, original_title, poster_url, year,
         origin_country, original_language, total_episodes, total_seasons, season_episode_counts, runtime,
         status, current_season, current_episode, episodes_watched, movie_progress_pct, rating,
         genres, popularity, watched_from, watched_to, review, review_spoiler, tags, rewatch_count,
         best_episode, credits, tmdb_rating, created_at, updated_at
  from public.entries
  where public.can_view(user_id);
grant select on public.shared_entries to anon, authenticated;

------------------------------------------------------------
-- 2. Profile extras: streaming services, goals, admin flag
------------------------------------------------------------
alter table public.profiles add column if not exists services  int[] not null default '{}';
alter table public.profiles add column if not exists goals     jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists is_admin  boolean not null default false;

-- Nobody can make themselves admin from the app.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    new.is_admin := old.is_admin;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_admin on public.profiles;
create trigger profiles_protect_admin before update on public.profiles
for each row execute function public.protect_admin_flag();

------------------------------------------------------------
-- 3. Diary: what you watched on which day
------------------------------------------------------------
create table if not exists public.diary (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id    uuid references public.entries (id) on delete cascade,
  watched_on  date not null default current_date,
  kind        text not null default 'watch' check (kind in ('watch', 'rewatch', 'episode')),
  season      int,
  episode     int,
  title       text,
  poster_url  text,
  source      text,
  source_id   text,
  media_type  text,
  category    text,
  runtime     int,
  created_at  timestamptz not null default now()
);
create index if not exists diary_user_day_idx on public.diary (user_id, watched_on desc);
alter table public.diary enable row level security;
drop policy if exists "read visible diary" on public.diary;
drop policy if exists "write own diary"    on public.diary;
create policy "read visible diary" on public.diary for select using (public.can_view(user_id));
create policy "write own diary"    on public.diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fill the diary automatically from real watching (not from imports):
--   finishing something you were watching, a few more episodes, a rewatch, or a watch date you set.
create or replace function public.diary_from_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta int;
  d date;
begin
  -- Adding a title with a watch date (e.g. "Watched today", or a Letterboxd diary import) logs that day.
  if tg_op = 'INSERT' then
    if new.watched_to is not null then
      insert into diary (user_id, entry_id, watched_on, kind, title, poster_url, source, source_id, media_type, category, runtime)
      values (new.user_id, new.id, new.watched_to, 'watch', new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
    end if;
    return new;
  end if;
  if old.source is distinct from new.source then return new; end if;

  if new.rewatch_count > old.rewatch_count then
    insert into diary (user_id, entry_id, kind, title, poster_url, source, source_id, media_type, category, runtime)
    values (new.user_id, new.id, 'rewatch', new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
  end if;

  delta := coalesce(new.episodes_watched, 0) - coalesce(old.episodes_watched, 0);
  -- A few more episodes are logged one by one (not when a whole show is marked Completed in one go).
  if new.media_type <> 'movie' and delta between 1 and 6 and not (new.status = 'completed' and old.status <> 'completed' and delta > 1) then
    for i in 1..delta loop
      insert into diary (user_id, entry_id, kind, season, episode, title, poster_url, source, source_id, media_type, category, runtime)
      values (new.user_id, new.id, 'episode', new.current_season,
              case when new.current_episode is not null then new.current_episode - delta + i end,
              new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
    end loop;
  end if;

  if new.status = 'completed' and old.status in ('watching', 'on_hold') then
    insert into diary (user_id, entry_id, kind, title, poster_url, source, source_id, media_type, category, runtime)
    values (new.user_id, new.id, 'watch', new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
  end if;

  if new.watched_to is not null and new.watched_to is distinct from old.watched_to then
    d := new.watched_to;
    if not exists (select 1 from diary where entry_id = new.id and watched_on = d and kind = 'watch') then
      insert into diary (user_id, entry_id, watched_on, kind, title, poster_url, source, source_id, media_type, category, runtime)
      values (new.user_id, new.id, d, 'watch', new.title, new.poster_url, new.source, new.source_id, new.media_type, new.category, new.runtime);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists entries_diary on public.entries;
create trigger entries_diary after insert or update on public.entries
for each row execute function public.diary_from_entry();

-- Existing watch dates become diary days.
insert into public.diary (user_id, entry_id, watched_on, kind, title, poster_url, source, source_id, media_type, category, runtime)
select e.user_id, e.id, e.watched_to, 'watch', e.title, e.poster_url, e.source, e.source_id, e.media_type, e.category, e.runtime
from public.entries e
where e.watched_to is not null
  and not exists (select 1 from public.diary d where d.entry_id = e.id and d.watched_on = e.watched_to);

------------------------------------------------------------
-- 4. Custom lists
------------------------------------------------------------
create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  ranked      boolean not null default false,
  is_public   boolean not null default true,
  items       jsonb not null default '[]'::jsonb,   -- [{source, media_type, source_id, title, poster_url, year, note}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lists enable row level security;
drop policy if exists "read lists"      on public.lists;
drop policy if exists "write own lists" on public.lists;
create policy "read lists"      on public.lists for select using (auth.uid() = user_id or (is_public and public.can_view(user_id)));
create policy "write own lists" on public.lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists lists_touch on public.lists;
create trigger lists_touch before update on public.lists for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- 5. Follow public vaults (friends stay two-way; following is one-way)
------------------------------------------------------------
create table if not exists public.follows (
  follower   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
alter table public.follows enable row level security;
drop policy if exists "read follows"  on public.follows;
drop policy if exists "write follows" on public.follows;
create policy "read follows"  on public.follows for select using (true);
create policy "write follows" on public.follows for all using (auth.uid() = follower) with check (auth.uid() = follower);

------------------------------------------------------------
-- 6. Reactions and comments on activity
------------------------------------------------------------
create table if not exists public.reactions (
  id          bigint generated always as identity primary key,
  activity_id bigint not null references public.activity (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,  -- whose activity it is
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji       text check (char_length(emoji) <= 8),
  comment     text check (char_length(comment) <= 1000),
  spoiler     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists reactions_activity_idx on public.reactions (activity_id);
alter table public.reactions enable row level security;
drop policy if exists "read reactions"   on public.reactions;
drop policy if exists "add reactions"    on public.reactions;
drop policy if exists "remove reactions" on public.reactions;
create policy "read reactions"   on public.reactions for select using (public.can_view(owner_id));
create policy "add reactions"    on public.reactions for insert with check (auth.uid() = user_id and public.can_view(owner_id));
create policy "remove reactions" on public.reactions for delete using (auth.uid() = user_id or auth.uid() = owner_id);

------------------------------------------------------------
-- 7. Blends: shared watch-together lists with voting
------------------------------------------------------------
create table if not exists public.blends (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.blend_members (
  blend_id uuid not null references public.blends (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (blend_id, user_id)
);
create table if not exists public.blend_items (
  id         bigint generated always as identity primary key,
  blend_id   uuid not null references public.blends (id) on delete cascade,
  source     text not null,
  media_type text not null,
  source_id  text not null,
  title      text,
  poster_url text,
  year       int,
  added_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  watched    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (blend_id, source, media_type, source_id)
);
create table if not exists public.blend_votes (
  item_id bigint not null references public.blend_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vote    int not null check (vote in (-1, 1)),
  primary key (item_id, user_id)
);

create or replace function public.is_blend_member(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blend_members where blend_id = b and user_id = auth.uid())
      or exists (select 1 from blends where id = b and created_by = auth.uid());
$$;

alter table public.blends        enable row level security;
alter table public.blend_members enable row level security;
alter table public.blend_items   enable row level security;
alter table public.blend_votes   enable row level security;

drop policy if exists "members read blends"   on public.blends;
drop policy if exists "create blends"         on public.blends;
drop policy if exists "owner edits blends"    on public.blends;
create policy "members read blends" on public.blends for select using (public.is_blend_member(id));
create policy "create blends"       on public.blends for insert with check (auth.uid() = created_by);
create policy "owner edits blends"  on public.blends for all using (auth.uid() = created_by) with check (auth.uid() = created_by);

drop policy if exists "members read members" on public.blend_members;
drop policy if exists "owner adds members"   on public.blend_members;
drop policy if exists "leave blend"          on public.blend_members;
create policy "members read members" on public.blend_members for select using (public.is_blend_member(blend_id));
create policy "owner adds members"   on public.blend_members for insert
  with check (exists (select 1 from public.blends b where b.id = blend_id and b.created_by = auth.uid()));
create policy "leave blend"          on public.blend_members for delete
  using (auth.uid() = user_id or exists (select 1 from public.blends b where b.id = blend_id and b.created_by = auth.uid()));

drop policy if exists "members use items" on public.blend_items;
create policy "members use items" on public.blend_items for all using (public.is_blend_member(blend_id)) with check (public.is_blend_member(blend_id));

drop policy if exists "members vote" on public.blend_votes;
create policy "members vote" on public.blend_votes for all
  using (exists (select 1 from public.blend_items i where i.id = item_id and public.is_blend_member(i.blend_id)))
  with check (auth.uid() = user_id and exists (select 1 from public.blend_items i where i.id = item_id and public.is_blend_member(i.blend_id)));

------------------------------------------------------------
-- 8. Feedback: goes to the site owner's inbox
------------------------------------------------------------
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  kind       text not null default 'idea' check (kind in ('bug', 'idea', 'other')),
  message    text not null check (char_length(message) between 1 and 5000),
  page       text,
  device     text,
  contact    text check (char_length(contact) <= 200),
  status     text not null default 'new' check (status in ('new', 'seen', 'planned', 'done')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "send feedback"      on public.feedback;
drop policy if exists "admins read"        on public.feedback;
drop policy if exists "admins update"      on public.feedback;
drop policy if exists "read own feedback"  on public.feedback;
create policy "send feedback"     on public.feedback for insert with check (auth.uid() = user_id);
create policy "read own feedback" on public.feedback for select using (auth.uid() = user_id);
create policy "admins read"       on public.feedback for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
create policy "admins update"     on public.feedback for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

------------------------------------------------------------
-- 9. Push notifications (optional)
------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push" on public.push_subscriptions;
create policy "own push" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

------------------------------------------------------------
-- 10. Make yourself the admin (reads the feedback inbox)
------------------------------------------------------------
-- Replace the email below with the one you sign in with, then run just this line again:
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
