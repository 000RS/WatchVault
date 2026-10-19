'use client';

// Adding titles and keeping their details complete, shared by every page.

import { getTitle } from './catalog';
import { keyOfTitle, progressFor, snapshotFromTitle } from './list';
import { findAnimeTwin, saveEntry, updateEntry } from './store';
import { getStoreEntries } from './store';
import { toast } from './toast';
import { STATUS_LABEL } from './categories';

/** Add a catalogue title with a status ("completed", "watching" + 50% for a half-watched movie, ...). */
const RANK = { completed: 5, watching: 4, on_hold: 3, dropped: 2, plan: 1 };

export async function addTitle(title, status = 'completed', extra = {}) {
  const row = {
    ...snapshotFromTitle(title),
    category: title.category,
    ...progressFor(title, { status, ...extra }),
  };
  // Same anime already saved from AniList: upgrade that entry instead of adding a second copy.
  const twin = findAnimeTwin(getStoreEntries(), title);
  if (twin) {
    try {
      const keep = (RANK[twin.status] || 0) >= (RANK[row.status] || 0) ? twin.status : row.status;
      const progress = progressFor(title.detailed ? title : { ...title, mediaType: title.mediaType }, { status: keep, episodes: twin.episodes_watched || extra.episodes });
      const saved = await updateEntry(twin.id, { ...snapshotFromTitle(title), category: 'anime', ...progress }, { delay: 0 });
      if (!title.detailed) fillDetails(saved || twin);
      return saved;
    } catch (e) {
      toast(e.message, { kind: 'error' });
      throw e;
    }
  }
  try {
    const saved = await saveEntry(row);
    if (!title.detailed && title.source === 'tmdb') fillDetails(saved);
    return saved;
  } catch (e) {
    toast(e.message, { kind: 'error' });
    throw e;
  }
}

export function quickAddLabel(status, pct) {
  if (status === 'watching' && pct === 50) return 'Half watched';
  return STATUS_LABEL[status];
}

const filling = new Set();
/** Fetch seasons, episodes, runtime and genres for an entry saved from a search result. */
export async function fillDetails(entry) {
  if (!entry || entry.source !== 'tmdb' || filling.has(entry.id) || String(entry.id).startsWith('tmp-')) return entry;
  const needs = entry.media_type === 'tv' ? !entry.season_episode_counts?.length || !entry.genres : !entry.runtime || !entry.genres;
  if (!needs) return entry;
  filling.add(entry.id);
  try {
    const t = await getTitle('tmdb', entry.media_type, entry.source_id);
    const snap = snapshotFromTitle(t);
    // Re-derive progress now that season sizes are known (keeps the same spot / completion).
    const progress =
      entry.media_type === 'tv'
        ? progressFor(t, {
            status: entry.status,
            episodes: entry.current_season ? null : entry.episodes_watched,
            season: entry.current_season,
            episode: entry.current_episode,
          })
        : {};
    const patch = { ...snap, ...progress };
    delete patch.source;
    delete patch.source_id;
    delete patch.media_type;
    return await updateEntry(entry.id, patch, { delay: 0 });
  } catch {
    return entry;
  } finally {
    filling.delete(entry.id);
  }
}

export const titleHref = (source, mediaType, id) => `/title/${source}/${mediaType}/${id}`;
export const entryHref = (e) => titleHref(e.source, e.media_type, e.source_id);
export const itemHref = (t) => titleHref(t.source, t.mediaType, t.sourceId);
export { keyOfTitle };
