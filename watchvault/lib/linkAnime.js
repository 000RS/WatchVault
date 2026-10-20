'use client';

// Moves anime saved from AniList (one entry per season) onto TMDB (one entry per show, with every season).
// Runs in the browser against the cached /api/tmdb route, one title at a time with a few in parallel,
// so one bad title can never stop the rest. Progress, rating and notes are kept, and several
// AniList seasons of the same show merge into one entry.

import { normalizeTmdb, tmdb } from './catalog';
import { keyOfEntry, keyOfTitle, progressFor, snapshotFromTitle } from './list';
import { queryVariants, scoreCandidate } from './match';
import { getStoreEntries, refresh, removeEntries, updateEntry } from './store';

const RANK = { completed: 8, watching: 7, on_hold: 6, stopped: 5, tried: 4, dropped: 3, clips: 2, plan: 1 };
const AUTO = 0.82;
const KEEP_KEY = 'wv:keep-anilist';

export function keptOnAnilist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEEP_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
export function keepOnAnilist(ids) {
  try {
    const s = keptOnAnilist();
    ids.forEach((id) => s.add(id));
    localStorage.setItem(KEEP_KEY, JSON.stringify([...s]));
  } catch {
    /* storage blocked: the banner may come back, nothing else is affected */
  }
}

/** "Attack on Titan Season 3 Part 2" → 3 */
function seasonHint(title) {
  const t = String(title || '');
  const m = t.match(/\bseason\s*(\d{1,2})\b/i) || t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i) || t.match(/\bS(\d{1,2})\b/);
  if (m) return Number(m[1]);
  if (/\bfinal season\b/i.test(t)) return 99;
  return null;
}

/** Best TMDB candidates for one AniList entry, highest score first. */
export async function tmdbCandidatesFor(e) {
  const names = [...new Set([e.title, e.original_title].filter(Boolean))];
  const queries = new Set();
  for (const n of names) for (const v of queryVariants(n).slice(0, 2)) queries.add(v);
  const found = new Map();
  await Promise.all(
    [...queries].slice(0, 4).map(async (q) => {
      const [tv, movie] = await Promise.all([
        tmdb('search/tv', { query: q, include_adult: 'false' }).catch(() => ({ results: [] })),
        tmdb('search/movie', { query: q, include_adult: 'false' }).catch(() => ({ results: [] })),
      ]);
      for (const r of (tv.results || []).slice(0, 6)) found.set(`tv:${r.id}`, normalizeTmdb(r, 'tv'));
      for (const r of (movie.results || []).slice(0, 4)) found.set(`movie:${r.id}`, normalizeTmdb(r, 'movie'));
    })
  );
  const looksLikeMovie = /\b(movie|film|the movie)\b/i.test(e.title || '') || (e.total_episodes === 1 && !e.season_episode_counts);
  const scored = [...found.values()].map((c) => {
    let best = 0;
    for (const q of queries) best = Math.max(best, scoreCandidate(c, { q, kind: 'anime', extraNames: names }));
    // Season entries carry the season's year, not the show's, so don't punish an earlier first year.
    if (c.mediaType === (looksLikeMovie ? 'movie' : 'tv')) best += 0.03;
    if (c.category !== 'anime') best -= 0.12;
    return { item: c, score: Math.max(0, Math.min(1, best)) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}

async function details(item) {
  try {
    return { ...normalizeTmdb(await tmdb(`${item.mediaType}/${item.sourceId}`), item.mediaType), popularity: item.popularity };
  } catch {
    return item;
  }
}

/** Merge one AniList entry into a chosen TMDB title. */
export async function mergeInto(e, item) {
  const t = await details(item);
  const key = keyOfTitle(t);
  const existing = getStoreEntries().find((x) => x.id !== e.id && keyOfEntry(x) === key);
  const hint = seasonHint(e.title);
  const counts = t.seasons?.map((s) => s.episodes) || [];

  if (existing) {
    // Another season of a show already in the list: keep whichever got further, and the better status.
    const status = (RANK[e.status] || 0) > (RANK[existing.status] || 0) ? e.status : existing.status;
    const fromHint = hint && counts.length ? counts.slice(0, Math.min(hint, counts.length)).reduce((a, b) => a + b, 0) : 0;
    const episodes = Math.max(existing.episodes_watched || 0, fromHint, e.episodes_watched || 0);
    const p = progressFor(t, { status, episodes: status === 'completed' ? null : episodes });
    await updateEntry(
      existing.id,
      {
        status: p.status,
        current_season: p.current_season,
        current_episode: p.current_episode,
        episodes_watched: p.episodes_watched,
        rating: existing.rating ?? e.rating ?? null,
        notes: [existing.notes, e.notes].filter(Boolean).join('\n') || null,
      },
      { delay: 0 }
    );
    await removeEntries([e.id]);
    return 'merged';
  }

  let episodes = e.episodes_watched || 0;
  // "Season 3" finished on AniList means seasons 1–3 on TMDB.
  if (hint && counts.length && (e.status === 'completed' || e.status === 'stopped')) {
    episodes = counts.slice(0, Math.min(hint, counts.length)).reduce((a, b) => a + b, 0);
  }
  const status = e.status === 'completed' && hint && hint < counts.length ? 'stopped' : e.status;
  const row = { ...snapshotFromTitle(t), category: 'anime', ...progressFor(t, { status, episodes: status === 'completed' ? null : episodes }) };
  await updateEntry(e.id, row, { delay: 0 });
  return 'linked';
}

/**
 * Link every AniList anime that has a confident TMDB match.
 * Returns { done, review: [{ entry, candidates }], failed: [{ entry, error }] }.
 */
export async function linkAnimeToTmdb(onProgress = () => {}) {
  await refresh();
  const kept = keptOnAnilist();
  const todo = getStoreEntries().filter((e) => e.source === 'anilist' && !kept.has(e.id));
  const review = [];
  const failed = [];
  let done = 0;
  let finished = 0;
  onProgress(0, todo.length);

  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const e = todo[next++];
      try {
        const cands = await tmdbCandidatesFor(e);
        const [first, second] = cands;
        const clear = first && first.score >= AUTO && (!second || first.score - second.score >= 0.03 || first.item.title === second.item.title);
        if (clear) {
          try {
            await mergeInto(e, first.item);
          } catch (err) {
            // Two seasons of one show finished at the same moment: reload and merge into the copy that won.
            if (!/already in your list|duplicate/i.test(err.message || '')) throw err;
            await refresh();
            await mergeInto(e, first.item);
          }
          done++;
        } else review.push({ entry: e, candidates: cands.filter((c) => c.score >= 0.3).map((c) => c.item) });
      } catch (err) {
        failed.push({ entry: e, error: err.message || String(err) });
      }
      onProgress(++finished, todo.length);
    }
  }
  // Merges must not race each other for the same show, so keep this small.
  await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
  return { done, review, failed };
}
