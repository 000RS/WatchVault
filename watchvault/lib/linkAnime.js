'use client';

// Moves anime saved from AniList (one entry per season) onto TMDB (one entry per show, all seasons).
// Progress, rating and notes are kept; several AniList seasons of one show merge into one entry.

import { keyOfEntry, keyOfTitle, progressFor, snapshotFromTitle } from './list';
import { getStoreEntries, removeEntries, updateEntry } from './store';

const RANK = { completed: 5, watching: 4, on_hold: 3, dropped: 2, plan: 1 };

export async function linkAnimeToTmdb(onProgress = () => {}) {
  const entries = getStoreEntries();
  const ani = entries.filter((e) => e.source === 'anilist');
  const byKey = new Map(entries.filter((e) => e.source === 'tmdb').map((e) => [keyOfEntry(e), e]));
  let linked = 0;
  let kept = 0;
  onProgress(0, ani.length);
  for (let i = 0; i < ani.length; i += 40) {
    const chunk = ani.slice(i, i + 40);
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: chunk.map((e) => ({ id: e.id, q: e.title, year: e.year, kind: 'anime' })) }),
    }).then((r) => r.json());
    for (const r of res.results || []) {
      const e = chunk.find((x) => x.id === r.id);
      if (!e || !r.best || r.best.source !== 'tmdb' || r.confidence < 0.8) {
        kept++;
        continue;
      }
      const key = keyOfTitle(r.best);
      const existing = byKey.get(key);
      if (existing) {
        // Another season of a show that is already linked: keep whichever got further.
        const sum = (existing.episodes_watched || 0) + (e.episodes_watched || 0);
        const status = (RANK[e.status] || 0) > (RANK[existing.status] || 0) ? e.status : existing.status;
        const merged = progressFor(existing, { status, episodes: sum });
        const saved = await updateEntry(existing.id, { status: merged.status, current_season: merged.current_season, current_episode: merged.current_episode, episodes_watched: merged.episodes_watched, rating: existing.rating ?? e.rating ?? null }, { delay: 0 });
        byKey.set(key, saved || existing);
        await removeEntries([e.id]);
      } else {
        const row = { ...snapshotFromTitle(r.best), category: 'anime', ...progressFor(r.best, { status: e.status, episodes: e.episodes_watched }) };
        const saved = await updateEntry(e.id, row, { delay: 0 });
        byKey.set(key, saved || { ...e, ...row });
      }
      linked++;
    }
    onProgress(Math.min(i + 40, ani.length), ani.length);
  }
  return { linked, kept };
}
