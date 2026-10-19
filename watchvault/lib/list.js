// Reading and writing list entries in Supabase, plus helpers that build entry rows.

import { getSupabase } from './supabase';
import { episodesUpTo, spotFromEpisodes } from './categories';

const CONFLICT = 'user_id,source,media_type,source_id';

export const entryKey = (source, mediaType, sourceId) => `${source}:${mediaType}:${sourceId}`;
export const keyOfEntry = (e) => entryKey(e.source, e.media_type, e.source_id);
export const keyOfTitle = (t) => entryKey(t.source, t.mediaType, t.sourceId);

/** Title facts we keep with each entry so the list loads without asking TMDB. */
export function snapshotFromTitle(t) {
  return {
    source: t.source,
    source_id: String(t.sourceId),
    media_type: t.mediaType,
    title: t.title,
    original_title: t.originalTitle || null,
    poster_url: t.poster || null,
    year: t.year || null,
    origin_country: t.countries?.[0] || null,
    original_language: t.language || null,
    total_episodes: t.totalEpisodes ?? null,
    total_seasons: t.totalSeasons ?? null,
    season_episode_counts: t.seasons?.length ? t.seasons.map((s) => s.episodes || 0) : null,
    runtime: t.runtime || null,
    genres: t.genres?.length ? t.genres.slice(0, 6) : null,
    popularity: t.popularity ?? null,
  };
}

/**
 * Progress fields for a status plus whatever we know ("5 episodes", "3 seasons",
 * "S2 E5", "half"). Fills a series to the end when it is completed.
 */
export function progressFor(t, { status, episodes, seasons, season, episode, pct }) {
  const counts = t.seasons?.length ? t.seasons.map((s) => s.episodes || 0) : t.season_episode_counts || null;
  const total = t.totalEpisodes ?? t.total_episodes ?? (counts ? counts.reduce((a, b) => a + b, 0) : null);
  const mediaType = t.mediaType || t.media_type;

  if (mediaType === 'movie') {
    const p = status === 'completed' ? 100 : pct ?? (status === 'watching' ? 50 : 0);
    return { status: p >= 100 && status === 'watching' ? 'completed' : status, movie_progress_pct: p, current_season: null, current_episode: null, episodes_watched: null };
  }

  if (counts?.length) {
    let s = null;
    let ep = 0;
    if (status === 'completed') {
      s = counts.length;
      ep = counts[counts.length - 1];
    } else if (season) {
      s = Math.min(season, counts.length);
      ep = Math.min(episode || 0, counts[s - 1] || episode || 0);
    } else if (seasons) {
      s = Math.min(seasons, counts.length);
      ep = counts[s - 1];
    } else if (episodes) {
      ({ season: s, episode: ep } = spotFromEpisodes(counts, episodes));
    }
    const watched = s ? episodesUpTo(counts, s, ep) : 0;
    // Reaching the last episode while "watching" means finished; an explicit Dropped/On hold stays.
    const done = status === 'watching' && total && watched >= total;
    return {
      status: done ? 'completed' : status,
      current_season: s,
      current_episode: s ? ep : null,
      episodes_watched: watched,
      movie_progress_pct: null,
    };
  }

  const watched = status === 'completed' && total ? total : episodes ?? 0;
  return {
    status: status === 'watching' && total && watched >= total ? 'completed' : status,
    episodes_watched: watched,
    current_season: null,
    current_episode: null,
    movie_progress_pct: null,
  };
}

async function client() {
  const sb = getSupabase();
  if (!sb) throw new Error('The database is not connected.');
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('You are signed out. Sign in again to save changes.');
  return { sb, userId };
}

export async function fetchList() {
  const { sb } = await client();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('entries').select('*').order('updated_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export async function insertOrUpdate(row) {
  const { sb, userId } = await client();
  const { data, error } = await sb.from('entries').upsert({ ...row, user_id: userId }, { onConflict: CONFLICT }).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function insertMany(rows) {
  const { sb, userId } = await client();
  const saved = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, user_id: userId }));
    const { data, error } = await sb.from('entries').upsert(chunk, { onConflict: CONFLICT }).select();
    if (error) throw new Error(friendly(error));
    saved.push(...data);
  }
  return saved;
}

export async function patchRow(id, patch) {
  const { sb } = await client();
  const { data, error } = await sb.from('entries').update(patch).eq('id', id).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function patchRows(ids, patch) {
  const { sb } = await client();
  const { data, error } = await sb.from('entries').update(patch).in('id', ids).select();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function deleteRows(ids) {
  const { sb } = await client();
  const { error } = await sb.from('entries').delete().in('id', ids);
  if (error) throw new Error(friendly(error));
}

function friendly(error) {
  const m = error.message || '';
  if (/column .* does not exist|schema cache/i.test(m)) return 'The database needs the v2 upgrade. Run supabase/upgrade_v2.sql in Supabase (see README).';
  if (/JWT|token/i.test(m)) return 'Your session expired. Sign in again.';
  return m;
}

export function toCsv(rows) {
  const cols = ['title', 'category', 'media_type', 'status', 'current_season', 'current_episode', 'episodes_watched', 'total_episodes', 'total_seasons', 'movie_progress_pct', 'rating', 'year', 'origin_country', 'watched_from', 'watched_to', 'notes', 'source', 'source_id', 'updated_at'];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join(' ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
