'use client';

// Swipe: a feed of trailers and covers you sort with a flick. Like = want it, ✓ = already seen it, ✕ = not for me.
// Group Swipe: everyone in a room swipes the same deck; anything everyone likes is a match.

import { anilist, normalizeAni, normalizeTmdb, tmdb, ANI_FIELDS } from './catalog';
import { trendingShelf } from './shelves';
import { getSupabase } from './supabase';
import { getStoreEntries } from './store';
import { keyOfTitle } from './list';
import { addTitle } from './actions';
import { tasteGenreIds, tasteProfile } from './taste';

export const SWIPE_SHELVES = [
  { id: 'screen', label: 'Films & series' },
  { id: 'movie', label: 'Films' },
  { id: 'tv', label: 'Series & dramas' },
  { id: 'anime', label: 'Anime' },
  { id: 'book', label: 'Books' },
  { id: 'manga', label: 'Manga' },
  { id: 'game', label: 'Games' },
  { id: 'music', label: 'Music' },
  { id: 'podcast', label: 'Podcasts' },
];

const sb = () => getSupabase();
async function uid() {
  const { data } = await sb().auth.getSession();
  return data.session?.user?.id || null;
}
export const itemKey = (i) => keyOfTitle(i);

/* ---------------- Your swipes ---------------- */

let swiped = null;
export async function loadSwipes() {
  if (swiped) return swiped;
  const { data, error } = await sb().from('swipes').select('source, media_type, source_id, verdict, genres, category');
  swiped = error ? [] : data;
  return swiped;
}
export function swipedKeys() {
  return new Set((swiped || []).map((s) => `${s.source}:${s.media_type}:${s.source_id}`));
}
/** Genres you keep liking (and skipping), learned from swipes. */
export function swipeTaste() {
  const like = new Map();
  const skip = new Map();
  for (const s of swiped || []) for (const g of s.genres || []) (s.verdict === 'skip' ? skip : like).set(g, ((s.verdict === 'skip' ? skip : like).get(g) || 0) + 1);
  return { like, skip };
}

export async function recordSwipe(item, verdict) {
  const row = { source: item.source, media_type: item.mediaType, source_id: String(item.sourceId), verdict, title: item.title, poster_url: item.poster || null, category: item.category, genres: (item.genres || []).slice(0, 6) };
  swiped = [...(swiped || []).filter((s) => !(s.source === row.source && s.media_type === row.media_type && s.source_id === row.source_id)), row];
  sb().from('swipes').upsert(row).then(() => {});
  if (verdict === 'like') return addTitle(item, 'plan').catch(() => {});
  if (verdict === 'seen') return addTitle(item, 'completed').catch(() => {});
}
export async function undoSwipe(item) {
  swiped = (swiped || []).filter((s) => !(s.source === item.source && s.media_type === item.mediaType && s.source_id === String(item.sourceId)));
  await sb().from('swipes').delete().eq('source', item.source).eq('media_type', item.mediaType).eq('source_id', String(item.sourceId));
}

/* ---------------- Building a deck ---------------- */

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

async function screenDeck(media, { language, page }) {
  const entries = getStoreEntries();
  const taste = tasteProfile(entries, new Set());
  const ids = tasteGenreIds(taste, media, 3);
  const p = { sort_by: 'popularity.desc', page: String(page), 'vote_count.gte': media === 'movie' ? '150' : '60', include_adult: 'false' };
  if (media === 'tv') p.without_genres = '10767,10763,10764';
  if (language) p.with_original_language = language;
  // Half the deck leans on your favourite genres, half is the wider world.
  const [a, b] = await Promise.all([
    tmdb(`discover/${media}`, { ...p, ...(ids.length && !language ? { with_genres: ids.join('|') } : {}) }).catch(() => ({ results: [] })),
    tmdb('trending/' + media + '/week', { page: String(page) }).catch(() => ({ results: [] })),
  ]);
  return [...(a.results || []), ...(language ? [] : b.results || [])].map((r) => normalizeTmdb(r, media)).filter((i) => i.poster);
}

async function animeDeck(page) {
  const d = await anilist(`query ($p: Int) { Page(page: $p, perPage: 30) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${ANI_FIELDS} trailer { id site } } } }`, { p: page });
  return (d.Page?.media || []).map((m) => ({ ...normalizeAni(m), trailer: m.trailer?.site === 'youtube' ? m.trailer.id : null })).filter((i) => i.poster);
}

/** A fresh deck for a shelf, without things you already have or already swiped. */
export async function buildDeck(shelf, { language = '', round = 0 } = {}) {
  await loadSwipes();
  const page = 1 + (round % 5);
  let items = [];
  if (shelf === 'screen') items = [...(await screenDeck('movie', { language, page })), ...(await screenDeck('tv', { language, page }))];
  else if (shelf === 'movie' || shelf === 'tv') items = await screenDeck(shelf, { language, page });
  else if (shelf === 'anime') items = await animeDeck(page);
  else items = (await trendingShelf(shelf)).items;
  const have = new Set(getStoreEntries().map((e) => `${e.source}:${e.media_type}:${e.source_id}`));
  const done = swipedKeys();
  const seen = new Set();
  const { like, skip } = swipeTaste();
  const score = (i) => (i.genres || []).reduce((s, g) => s + (like.get(g) || 0) - (skip.get(g) || 0) * 0.7, 0) + Math.random() * 2;
  return shuffle(items)
    .filter((i) => {
      const k = itemKey(i);
      if (have.has(k) || done.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => score(b) - score(a));
}

/** The trailer for a screen title (YouTube key), fetched when the card comes up. */
const trailerCache = new Map();
export async function trailerFor(item) {
  if (item.trailer !== undefined) return item.trailer;
  if (item.meta?.trailer) return item.meta.trailer;
  if (item.source !== 'tmdb') return null;
  const k = itemKey(item);
  if (!trailerCache.has(k)) {
    trailerCache.set(
      k,
      tmdb(`${item.mediaType}/${item.sourceId}`, { append_to_response: 'videos' })
        .then((d) => {
          const v = (d.videos?.results || []).filter((x) => x.site === 'YouTube');
          return (v.find((x) => x.type === 'Trailer' && x.official) || v.find((x) => x.type === 'Trailer') || v.find((x) => x.type === 'Teaser') || v[0])?.key || null;
        })
        .catch(() => null)
    );
  }
  return trailerCache.get(k);
}

/* ---------------- Group Swipe rooms ---------------- */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const slim = (i) => ({ source: i.source, sourceId: i.sourceId, mediaType: i.mediaType, title: i.title, poster: i.poster, backdrop: i.backdrop || null, year: i.year, category: i.category, genres: (i.genres || []).slice(0, 4), overview: String(i.overview || '').slice(0, 400), meta: i.meta || {}, trailer: i.trailer ?? undefined, rating: i.rating ?? null });

function roomError(error) {
  if (/relation .* does not exist|schema cache/i.test(error?.message || '')) return new Error('Group Swipe needs the version 5 database upgrade (supabase/upgrade_v5.sql).');
  return new Error(error?.message || 'Something went wrong with the room.');
}

export async function createRoom(shelf, opts = {}) {
  const deck = (await buildDeck(shelf, opts)).slice(0, 40).map(slim);
  for (let tries = 0; tries < 4; tries++) {
    const code = makeCode();
    const { data, error } = await sb().from('swipe_rooms').insert({ code, name: opts.name || null, filters: { shelf, ...opts }, deck }).select().single();
    if (error && /duplicate/i.test(error.message)) continue;
    if (error) throw roomError(error);
    await sb().from('swipe_room_members').insert({ room_id: data.id, user_id: await uid() });
    return data;
  }
  throw new Error('Couldn’t make a room code. Try again.');
}

export async function joinRoom(code) {
  const c = String(code || '').trim().toUpperCase();
  const { data, error } = await sb().from('swipe_rooms').select('*').eq('code', c).maybeSingle();
  if (error) throw roomError(error);
  if (!data) throw new Error('No room with that code. Check the letters and try again.');
  const me = await uid();
  const { error: e2 } = await sb().from('swipe_room_members').insert({ room_id: data.id, user_id: me });
  if (e2 && !/duplicate/i.test(e2.message)) throw roomError(e2);
  return data;
}

export async function roomState(roomId) {
  const [m, v] = await Promise.all([sb().from('swipe_room_members').select('user_id').eq('room_id', roomId), sb().from('swipe_room_votes').select('user_id, item_key, vote').eq('room_id', roomId)]);
  if (m.error) throw roomError(m.error);
  return { members: (m.data || []).map((x) => x.user_id), votes: v.data || [] };
}

export async function roomVote(roomId, item, vote) {
  const { error } = await sb().from('swipe_room_votes').upsert({ room_id: roomId, user_id: await uid(), item_key: itemKey(item), vote });
  if (error) throw roomError(error);
}

/** Items every member liked (needs at least two people). */
export function roomMatches(deck, { members, votes }) {
  if (members.length < 2) return [];
  const likes = new Map();
  for (const v of votes) if (v.vote === 1 && members.includes(v.user_id)) likes.set(v.item_key, (likes.get(v.item_key) || 0) + 1);
  return deck.filter((i) => likes.get(itemKey(i)) === members.length);
}
