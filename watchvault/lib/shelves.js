// Every shelf beyond movies and series: books, manga, games, music, podcasts, places, food, events, travel.
// Items come back in the same shape as screen titles, so tiles, sheets and the list all just work.

import { anilist, searchEverything } from './catalog';

export const SHELF_KINDS = [
  { id: 'book', label: 'Books', category: 'books', icon: '📖', placeholder: 'A book or author' },
  { id: 'manga', label: 'Manga & comics', category: 'manga', icon: '📚', placeholder: 'Manga, manhwa, manhua or comic' },
  { id: 'game', label: 'Games', category: 'games', icon: '🎮', placeholder: 'A game' },
  { id: 'music', label: 'Music', category: 'music', icon: '🎵', placeholder: 'An artist, album or song' },
  { id: 'podcast', label: 'Podcasts', category: 'podcasts', icon: '🎙️', placeholder: 'A podcast' },
  { id: 'food', label: 'Food & drink', category: 'food', icon: '☕', placeholder: 'A café, restaurant or bar' },
  { id: 'place', label: 'Places', category: 'places', icon: '📍', placeholder: 'A park, beach, museum, shop…' },
  { id: 'event', label: 'Events', category: 'events', icon: '🎟️', placeholder: 'A concert, festival or show' },
  { id: 'travel', label: 'Travel', category: 'travel', icon: '🧭', placeholder: 'A city or country' },
];
export const shelfKind = (id) => SHELF_KINDS.find((k) => k.id === id);

/* ---------------- Manga, manhwa and manhua: AniList ---------------- */

const MANGA_FIELDS = `id title { romaji english native } synonyms coverImage { large } bannerImage startDate { year }
  chapters volumes format status countryOfOrigin genres popularity averageScore description(asHtml: false)
  staff(perPage: 2, sort: RELEVANCE) { edges { role node { name { full } } } }`;
const MANGA_FORMAT = { MANGA: 'Manga', ONE_SHOT: 'One-shot', NOVEL: 'Light novel' };
const ORIGIN = { KR: 'Manhwa', CN: 'Manhua', TW: 'Manhua' };
export function normalizeManga(m) {
  return {
    source: 'anilist',
    sourceId: String(m.id),
    mediaType: 'manga',
    category: 'manga',
    title: m.title?.english || m.title?.romaji || m.title?.native || 'Untitled',
    originalTitle: m.title?.native || null,
    names: [m.title?.english, m.title?.romaji, m.title?.native, ...(m.synonyms || [])].filter(Boolean),
    poster: m.coverImage?.large || null,
    backdrop: m.bannerImage || null,
    year: m.startDate?.year || null,
    countries: m.countryOfOrigin ? [m.countryOfOrigin] : [],
    overview: String(m.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(),
    genres: m.genres || [],
    totalEpisodes: m.chapters || null,
    rating: m.averageScore ? m.averageScore / 10 : null,
    popularity: m.popularity ? m.popularity / 1000 : null,
    meta: {
      by: (m.staff?.edges || []).map((e) => e.node?.name?.full).filter(Boolean)[0] || null,
      type: ORIGIN[m.countryOfOrigin] || MANGA_FORMAT[m.format] || 'Manga',
      volumes: m.volumes || null,
      airing: m.status === 'RELEASING',
    },
  };
}
export async function searchManga(q) {
  const d = await anilist(`query ($q: String) { Page(perPage: 20) { media(search: $q, type: MANGA, sort: SEARCH_MATCH, isAdult: false) { ${MANGA_FIELDS} } } }`, { q });
  return (d.Page?.media || []).map(normalizeManga);
}
export async function trendingManga(page = 1) {
  const d = await anilist(`query ($p: Int) { Page(page: $p, perPage: 30) { media(type: MANGA, sort: TRENDING_DESC, isAdult: false) { ${MANGA_FIELDS} } } }`, { p: page });
  return (d.Page?.media || []).map(normalizeManga);
}

/* ---------------- Everything else: our own server route ---------------- */

async function everything(kind, params) {
  const res = await fetch(`/api/everything?${new URLSearchParams({ kind, ...params })}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok && !d.items) throw new Error(d.error || 'That shelf is unavailable right now.');
  return d;
}

/** Search one shelf. Returns { items, note }. */
export async function searchShelf(kind, q, opts = {}) {
  if (!q?.trim()) return { items: [] };
  if (kind === 'manga') return { items: await searchManga(q) };
  const d = await everything(kind, { q, ...opts });
  return { items: d.items || [], note: d.note || null };
}

/** What's popular on a shelf right now (no search words). */
export async function trendingShelf(kind) {
  if (kind === 'manga') return { items: await trendingManga() };
  if (['place', 'food', 'travel'].includes(kind)) return { items: [], note: 'Type a name or area to find places.' };
  const d = await everything(kind, { feed: 'trending' });
  return { items: d.items || [], note: d.note || null };
}

/** One search box, every shelf: screen titles first, then a few of each other kind. */
export async function searchAll(q) {
  const kinds = ['book', 'manga', 'game', 'music', 'podcast', 'food', 'place'];
  const [screen, ...rest] = await Promise.allSettled([searchEverything(q, {}), ...kinds.map((k) => searchShelf(k, q))]);
  const out = { screen: screen.status === 'fulfilled' ? screen.value : { items: [], people: [] }, shelves: {} };
  kinds.forEach((k, i) => (out.shelves[k] = rest[i].status === 'fulfilled' ? rest[i].value.items.slice(0, 12) : []));
  return out;
}

/** Anything at all, typed in by hand: a hobby, a restaurant abroad, a play, a book that isn't listed. */
export function customItem({ title, kind = 'custom', category, by, year, poster, link, notes }) {
  const shelf = SHELF_KINDS.find((k) => k.id === kind);
  return {
    source: 'custom',
    sourceId: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    mediaType: kind === 'food' ? 'place' : kind,
    category: category || shelf?.category || 'other',
    title: title.trim(),
    poster: poster || null,
    year: Number(year) || null,
    genres: [],
    overview: notes || '',
    meta: { by: by || null, link: link || null, custom: true },
    detailed: true,
  };
}

/** A small description line for any item ("Brandon Sanderson · 2010", "Ponsonby, Auckland"). */
export function itemByline(t) {
  const m = t.meta || {};
  const parts = [m.by, m.type && !['cafe', 'restaurant'].includes(m.type) ? m.type : null, t.year, m.date && !t.year ? m.date : null];
  return parts.filter(Boolean).join(' · ');
}

/** Manga that share genres (AniList's genres match TMDB's broad ones well). */
export async function mangaByGenres(genres = []) {
  const ok = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
  const map = { 'Science Fiction': 'Sci-Fi', 'Sci-Fi & Fantasy': 'Fantasy', 'Action & Adventure': 'Action', Crime: 'Thriller', Family: 'Slice of Life' };
  const g = [...new Set(genres.map((x) => map[x] || x).filter((x) => ok.includes(x)))].slice(0, 2);
  if (!g.length) return [];
  const d = await anilist(`query ($g: [String]) { Page(perPage: 16) { media(type: MANGA, genre_in: $g, sort: POPULARITY_DESC, isAdult: false) { ${MANGA_FIELDS} } } }`, { g });
  return (d.Page?.media || []).map(normalizeManga);
}
/** Books on a subject ("fantasy", "thriller"), most popular first. */
export async function booksBySubject(subject) {
  return (await searchShelf('book', `subject:"${String(subject).toLowerCase().replace(/ & .*/, '')}"`)).items;
}

/** One flat list from every shelf, for "add to list / blend" boxes. */
export async function searchAnything(q, per = 3) {
  const r = await searchAll(q);
  return [...r.screen.items.slice(0, 6), ...Object.values(r.shelves).flatMap((l) => l.slice(0, per))];
}
