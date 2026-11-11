'use client';

// English dub or subtitles only, for anime. Lookups are batched and remembered for the session.

import { useEffect, useState } from 'react';

const known = new Map(); // key → 'dub' | 'partial' | 'sub' | null (null = unknown)
const waiting = new Map(); // key → item
let timer = null;
const listeners = new Set();

export const keyOf = (i) => `${i.source}:${i.mediaType || i.media_type}:${i.sourceId || i.source_id}`;
export const isAnime = (i) => (i.mediaType || i.media_type) === 'anime' || ['anime', 'anime_movies'].includes(i.category) || (i.source === 'anilist' && (i.mediaType || i.media_type) !== 'manga');
export const DUB_LABEL = { dub: 'English dub', partial: 'Part dubbed', sub: 'Sub only' };

function flush() {
  timer = null;
  const batch = [...waiting.entries()].slice(0, 60);
  for (const [k] of batch) waiting.delete(k);
  if (!batch.length) return;
  fetch('/api/dubs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: batch.map(([key, i]) => ({ key, malId: i.malId || i.meta?.malId || null, anilistId: i.source === 'anilist' ? i.sourceId || i.source_id : null, title: i.source === 'anilist' ? null : i.originalTitle || i.original_title || i.title, year: i.year })),
    }),
  })
    .then((r) => r.json())
    .then((d) => {
      for (const [key] of batch) known.set(key, d.dubs?.[key] || null);
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      for (const [key] of batch) known.set(key, null);
      listeners.forEach((fn) => fn());
    });
  if (waiting.size) timer = setTimeout(flush, 60);
}

/** Ask about these items (anime only); answers arrive through useDubs. */
export function requestDubs(items) {
  for (const i of items) {
    if (!isAnime(i)) continue;
    const k = keyOf(i);
    if (!known.has(k) && !waiting.has(k)) waiting.set(k, i);
  }
  if (waiting.size && !timer) timer = setTimeout(flush, 40);
}
export const dubOf = (i) => known.get(keyOf(i));
export const dubKnown = (i) => known.has(keyOf(i));

/** Re-renders when answers come in. */
export function useDubs(items) {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  useEffect(() => {
    if (items?.length) requestDubs(items);
  }, [items]);
  return dubOf;
}

/** Wait until every anime in the list has an answer (for filtering results). */
export function whenDubsReady(items, timeout = 6000) {
  requestDubs(items);
  const anime = items.filter(isAnime);
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => (anime.every(dubKnown) || Date.now() - started > timeout ? resolve() : setTimeout(check, 120));
    check();
  });
}

/** One item's answer: 'dub' | 'partial' | 'sub' | null (unknown) | undefined (still asking / not anime). */
export function useDub(item) {
  const [, bump] = useState(0);
  const anime = item && isAnime(item);
  const k = anime ? keyOf(item) : null;
  useEffect(() => {
    if (!k) return;
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    requestDubs([item]);
    return () => listeners.delete(fn);
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return k ? known.get(k) : undefined;
}
