-- WatchVault v3 upgrade
-- Run once in Supabase → SQL Editor → New query → Run (after upgrade_v2.sql).
-- Adds the new statuses: Stopped, Tried and Seen clips. Nothing in your list changes.
-- Safe to run more than once.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.entries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.entries drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.entries
  add constraint entries_status_check
  check (status in ('watching', 'completed', 'plan', 'on_hold', 'stopped', 'tried', 'dropped', 'clips'));
