'use client';

// One shared, instantly available copy of your list and profile.
// It is kept on the device so pages open immediately, then refreshed in the background.
// Every change updates the screen first and saves to the database right after.

import { useMemo, useSyncExternalStore } from 'react';
import { deleteRows, fetchList, insertMany, insertOrUpdate, keyOfEntry, patchRow, patchRows } from './list';
import { getSupabase } from './supabase';

const state = {
  userId: null,
  entries: null,
  profile: null,
  refreshing: false,
  error: null,
  version: 0,
};
const listeners = new Set();
let snapshot = { ...state };

function emit() {
  state.version++;
  snapshot = { ...state };
  listeners.forEach((l) => l());
}
function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const cacheKey = (uid) => `wv:v2:${uid}`;
function persist() {
  if (!state.userId) return;
  try {
    localStorage.setItem(cacheKey(state.userId), JSON.stringify({ entries: state.entries, profile: state.profile, at: Date.now() }));
  } catch {
    /* storage full or blocked: the app still works, it just won't open instantly next time */
  }
}

/** The current list, for code outside React components. */
export const getStoreEntries = () => state.entries || [];

export function initStore(userId) {
  if (state.userId === userId && state.entries) return;
  state.userId = userId;
  state.entries = null;
  state.profile = null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null');
    if (cached) {
      state.entries = cached.entries || null;
      state.profile = cached.profile || null;
    }
  } catch {
    /* ignore a broken cache */
  }
  emit();
  refresh();
  loadProfile();
}

export function clearStore() {
  state.userId = null;
  state.entries = null;
  state.profile = null;
  emit();
}

let refreshing = null;
export function refresh() {
  if (!state.userId) return Promise.resolve();
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

async function doRefresh() {
  state.refreshing = true;
  emit();
  try {
    state.entries = await fetchList();
    state.error = null;
    persist();
  } catch (e) {
    state.error = e.message;
  } finally {
    state.refreshing = false;
    emit();
  }
}

/* ---------------- Profile ---------------- */

export async function loadProfile() {
  const sb = getSupabase();
  if (!sb || !state.userId) return;
  const { data, error } = await sb.from('profiles').select('*').eq('id', state.userId).maybeSingle();
  if (error) return; // v2 tables not created yet; the app runs without a profile
  if (!data) {
    const { data: created } = await sb.from('profiles').upsert({ id: state.userId }).select().maybeSingle();
    state.profile = created || null;
  } else state.profile = data;
  persist();
  emit();
}

export async function saveProfile(patch) {
  const sb = getSupabase();
  const before = state.profile;
  state.profile = { ...(state.profile || {}), ...patch };
  emit();
  const { data, error } = await sb.from('profiles').upsert({ id: state.userId, ...patch }).select().single();
  if (error) {
    state.profile = before;
    emit();
    if (/duplicate key|unique/i.test(error.message)) throw new Error('That username is taken. Try another.');
    if (/check constraint/i.test(error.message)) throw new Error('Usernames use 3–24 lowercase letters, numbers or underscores.');
    throw new Error(error.message);
  }
  state.profile = data;
  persist();
  emit();
  return data;
}

/* ---------------- Entries ---------------- */

function replaceLocal(rows) {
  const byId = new Map((state.entries || []).map((e) => [e.id, e]));
  for (const r of rows) {
    // Drop any optimistic placeholder for the same title
    for (const [id, e] of byId) if (id.startsWith('tmp-') && keyOfEntry(e) === keyOfEntry(r)) byId.delete(id);
    byId.set(r.id, r);
  }
  state.entries = [...byId.values()].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/** Add or replace one title. Shows instantly, saves in the background. */
export async function saveEntry(row) {
  const now = new Date().toISOString();
  const existing = (state.entries || []).find((e) => keyOfEntry(e) === keyOfEntry(row));
  const optimistic = { ...(existing || { id: `tmp-${Math.random().toString(36).slice(2)}`, created_at: now }), ...row, updated_at: now };
  replaceLocal([optimistic]);
  emit();
  try {
    const saved = await insertOrUpdate(row);
    replaceLocal([saved]);
    persist();
    emit();
    return saved;
  } catch (e) {
    state.entries = (state.entries || []).filter((x) => x.id !== optimistic.id);
    if (existing) replaceLocal([existing]);
    emit();
    throw e;
  }
}

export async function saveEntries(rows) {
  const saved = await insertMany(rows);
  replaceLocal(saved);
  persist();
  emit();
  return saved;
}

// Quick edits are batched per title so tapping +1 five times sends one save.
const pending = new Map();
export function updateEntry(id, patch, { delay = 450 } = {}) {
  const before = (state.entries || []).find((e) => e.id === id);
  if (!before) return Promise.resolve();
  replaceLocal([{ ...before, ...patch, updated_at: new Date().toISOString() }]);
  emit();
  if (String(id).startsWith('tmp-')) return Promise.resolve();

  const p = pending.get(id) || { patch: {}, timer: null, resolvers: [], original: before };
  Object.assign(p.patch, patch);
  clearTimeout(p.timer);
  pending.set(id, p);
  return new Promise((resolve, reject) => {
    p.resolvers.push({ resolve, reject });
    p.timer = setTimeout(async () => {
      pending.delete(id);
      try {
        const saved = await patchRow(id, p.patch);
        replaceLocal([saved]);
        persist();
        emit();
        p.resolvers.forEach((r) => r.resolve(saved));
      } catch (e) {
        replaceLocal([p.original]);
        emit();
        p.resolvers.forEach((r) => r.reject(e));
      }
    }, delay);
  });
}

export async function updateMany(ids, patch) {
  const before = (state.entries || []).filter((e) => ids.includes(e.id));
  replaceLocal(before.map((e) => ({ ...e, ...patch, updated_at: new Date().toISOString() })));
  emit();
  try {
    const saved = await patchRows(ids, patch);
    replaceLocal(saved);
    persist();
    emit();
  } catch (e) {
    replaceLocal(before);
    emit();
    throw e;
  }
}

export async function removeEntries(ids) {
  const before = state.entries;
  state.entries = (state.entries || []).filter((e) => !ids.includes(e.id));
  emit();
  try {
    await deleteRows(ids.filter((id) => !String(id).startsWith('tmp-')));
    persist();
  } catch (e) {
    state.entries = before;
    emit();
    throw e;
  }
}

/* ---------------- Hooks ---------------- */

const serverSnapshot = { ...state };
export function useStore() {
  return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
}

const squashTitle = (n) => String(n || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/** Keys a saved title can be recognised by: its full names, and the part before any subtitle. */
export function titleKeys(...names) {
  const out = new Set();
  for (const n of names) {
    if (!n) continue;
    const full = squashTitle(n);
    if (full.length >= 2) out.add(full);
    const main = squashTitle(String(n).split(/\s*[:：]\s*|\s[-–—]\s/)[0]);
    if (main.length >= 4) out.add(main);
  }
  return [...out];
}

/** Full names only, for the title being looked up (so a spin-off doesn't match the main show). */
const fullKeys = (...names) => names.filter(Boolean).map(squashTitle).filter((k) => k.length >= 2);

/** Find an anime saved from AniList that is the same show as a TMDB title. */
export function findAnimeTwin(entries, t) {
  if (!t || t.source !== 'tmdb' || t.category !== 'anime') return undefined;
  const keys = fullKeys(t.title, t.originalTitle);
  return (entries || []).find((e) => e.source === 'anilist' && titleKeys(e.title, e.original_title).some((k) => keys.includes(k)));
}

/** Your list plus fast lookup by title. */
export function useEntries() {
  const s = useStore();
  const { index, aniByName } = useMemo(() => {
    const m = new Map();
    const a = new Map();
    for (const e of s.entries || []) {
      m.set(keyOfEntry(e), e);
      if (e.source === 'anilist') for (const k of titleKeys(e.title, e.original_title)) if (!a.has(k)) a.set(k, e);
    }
    return { index: m, aniByName: a };
  }, [s.entries]);
  return {
    entries: s.entries,
    loading: !s.entries && !s.error,
    refreshing: s.refreshing,
    error: s.error,
    index,
    // Exact match first; a TMDB anime also counts as "in your list" if you saved it from AniList.
    lookup: (t) => {
      if (!t) return undefined;
      const exact = index.get(`${t.source}:${t.mediaType}:${t.sourceId}`);
      if (exact || t.source !== 'tmdb' || t.category !== 'anime' || !aniByName.size) return exact;
      for (const k of fullKeys(t.title, t.originalTitle)) if (aniByName.has(k)) return aniByName.get(k);
      return undefined;
    },
    profile: s.profile,
  };
}

export function useProfile() {
  return useStore().profile;
}

export const hiddenCategories = (profile) => new Set(profile?.hidden_categories || []);

/* Remember list filters and scroll position while moving around the app. */
export const viewMemory = new Map();

/** Put the page back where it was, a few times while it settles, unless you start scrolling. */
export function restoreScroll(y) {
  if (!y || typeof window === 'undefined') return undefined;
  try {
    history.scrollRestoration = 'manual';
  } catch {
    /* older browsers */
  }
  let cancelled = false;
  const stop = () => (cancelled = true);
  window.addEventListener('wheel', stop, { once: true, passive: true });
  window.addEventListener('touchstart', stop, { once: true, passive: true });
  const go = () => !cancelled && window.scrollTo(0, y);
  requestAnimationFrame(go);
  const timers = [setTimeout(go, 120), setTimeout(go, 400)];
  return () => {
    timers.forEach(clearTimeout);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
  };
}
