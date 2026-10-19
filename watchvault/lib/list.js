// Reading and writing your list in Supabase.

import { getSupabase } from './supabase';

const CONFLICT = 'user_id,source,media_type,source_id';

export function entryKey(source, mediaType, sourceId) {
  return `${source}:${mediaType}:${sourceId}`;
}

/** The title info we keep a snapshot of, so the list loads without calling TMDB/AniList. */
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
    runtime: t.runtime || null, // movie length, or minutes per episode for shows
  };
}

async function client() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('You are signed out. Sign in again to save changes.');
  return { sb, userId };
}

export async function fetchList() {
  const { sb } = await client();
  const rows = [];
  // Supabase returns at most 1000 rows per request, so page through.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('entries')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export async function fetchEntry(source, mediaType, sourceId) {
  const { sb } = await client();
  const { data, error } = await sb
    .from('entries')
    .select('*')
    .eq('source', source)
    .eq('media_type', mediaType)
    .eq('source_id', String(sourceId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveEntry(row) {
  const { sb, userId } = await client();
  const { data, error } = await sb
    .from('entries')
    .upsert({ ...row, user_id: userId }, { onConflict: CONFLICT })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveMany(rows) {
  const { sb, userId } = await client();
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, user_id: userId }));
    const { error } = await sb.from('entries').upsert(chunk, { onConflict: CONFLICT });
    if (error) throw new Error(error.message);
    saved += chunk.length;
  }
  return saved;
}

export async function updateEntry(id, patch) {
  const { sb } = await client();
  const { data, error } = await sb.from('entries').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEntry(id) {
  const { sb } = await client();
  const { error } = await sb.from('entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Move a TV/anime entry forward by one episode, rolling into the next season when one ends. */
export function nextEpisodePatch(e) {
  if (e.media_type === 'tv' && e.season_episode_counts?.length) {
    const counts = e.season_episode_counts;
    let season = e.current_season || 1;
    let episode = (e.current_episode || 0) + 1;
    const inSeason = counts[season - 1] || 0;
    if (inSeason && episode > inSeason && season < counts.length) {
      season += 1;
      episode = 1;
    } else if (inSeason && episode > inSeason) {
      episode = inSeason;
    }
    let watched = 0;
    for (let i = 0; i < season - 1; i++) watched += counts[i] || 0;
    watched += episode;
    const done = e.total_episodes && watched >= e.total_episodes;
    return {
      current_season: season,
      current_episode: episode,
      episodes_watched: watched,
      status: done ? 'completed' : 'watching',
    };
  }
  const watched = Math.min((e.episodes_watched || 0) + 1, e.total_episodes || Infinity);
  const done = e.total_episodes && watched >= e.total_episodes;
  return { episodes_watched: watched, status: done ? 'completed' : 'watching' };
}

export function toCsv(rows) {
  const cols = [
    'title', 'category', 'media_type', 'status', 'current_season', 'current_episode', 'episodes_watched',
    'total_episodes', 'movie_progress_pct', 'rating', 'year', 'origin_country', 'notes', 'source', 'source_id', 'updated_at',
  ];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join(' ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
