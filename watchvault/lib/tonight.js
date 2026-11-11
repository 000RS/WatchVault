'use client';

// "What should I do tonight?": a few strong picks from your mood, time, budget and company.
// Your own saved things come first (you already wanted them), then the wider catalogue.

import { genreIdsFor, isScreen, kindOf } from './categories';
import { normalizeTmdb, tmdb, REGION } from './catalog';
import { trendingShelf } from './shelves';
import { getStoreEntries } from './store';

export const MOOD_GENRES = {
  funny: ['Comedy', 'Animation', 'Family', 'Humor', 'Comedy & Humor', 'Slice of Life'],
  cosy: ['Family', 'Romance', 'Comedy', 'Slice of Life', 'Fantasy', 'Cozy'],
  romantic: ['Romance', 'Drama', 'Romantic Comedy', 'Love'],
  thrilling: ['Action', 'Thriller', 'Adventure', 'Action & Adventure', 'Crime', 'Shooter', 'Racing', 'Fighting', 'Sports'],
  emotional: ['Drama', 'Romance', 'Psychological', 'Biography', 'Music'],
  mindbending: ['Science Fiction', 'Sci-Fi & Fantasy', 'Mystery', 'Sci-Fi', 'Psychological', 'Puzzle', 'Strategy'],
  scary: ['Horror', 'Thriller', 'Mystery', 'Supernatural'],
  chill: ['Documentary', 'Family', 'Music', 'Animation', 'Simulator', 'Nature', 'Pop', 'Jazz', 'R&B/Soul'],
};
export const DOING = [
  ['any', 'Anything'],
  ['watch', 'Watch'],
  ['read', 'Read'],
  ['play', 'Play'],
  ['listen', 'Listen'],
  ['out', 'Go out'],
];
export const TIMES = [
  [30, '30 min'],
  [60, '1 hour'],
  [120, '2 hours'],
  [180, '3 hours+'],
];
export const COMPANY = [
  ['solo', 'Just me'],
  ['partner', 'Partner'],
  ['friends', 'Friends'],
  ['family', 'Family'],
];

const DOING_TYPES = { watch: ['movie', 'tv', 'anime'], read: ['book', 'manga'], play: ['game'], listen: ['music', 'podcast'], out: ['place', 'event', 'travel'] };

function fitsMood(item, mood) {
  if (!mood) return 0.5;
  const want = MOOD_GENRES[mood] || [];
  const g = item.genres || [];
  return g.some((x) => want.some((w) => String(x).toLowerCase().includes(w.toLowerCase()))) ? 1 : 0;
}
function fitsTime(item, minutes) {
  if (!minutes) return true;
  const t = item.media_type || item.mediaType;
  if (t === 'movie') return !item.runtime || item.runtime <= minutes + 10;
  if (t === 'tv' || t === 'anime') return !item.runtime || item.runtime <= minutes;
  if (t === 'game') return minutes >= 60;
  if (t === 'place' || t === 'event' || t === 'travel') return t !== 'travel' && minutes >= 60;
  return true;
}
function fitsCompany(item, company) {
  const g = (item.genres || []).join(' ');
  if (company === 'family' && /Horror|Thriller|Crime/.test(g)) return false;
  return true;
}
const reasonFor = (item, { mood, minutes, fromVault, company }) =>
  [
    fromVault ? 'You saved this' : null,
    mood && fitsMood(item, mood) ? `fits a ${mood === 'mindbending' ? 'mind-bending' : mood} mood` : null,
    minutes && (item.media_type || item.mediaType) === 'movie' && item.runtime ? `${item.runtime} min` : null,
    minutes && ['tv', 'anime'].includes(item.media_type || item.mediaType) && item.runtime ? `${item.runtime}-min episodes` : null,
    company === 'family' ? 'family-friendly' : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** Saved things that fit, best first. */
export function vaultPicks({ mood, minutes, doing = 'any', company, cheap }) {
  const types = DOING_TYPES[doing];
  const all = getStoreEntries().filter((e) => (e.status === 'plan' || e.status === 'watching' || e.status === 'on_hold') && (!types || types.includes(e.media_type)));
  return all
    .filter((e) => fitsTime(e, minutes) && fitsCompany(e, company) && (!cheap || !['event', 'travel'].includes(e.media_type)))
    .map((e) => ({ e, score: fitsMood(e, mood) * 2 + (e.status === 'watching' ? 0.6 : 0) + (e.favourite ? 0.3 : 0) + Math.random() * 0.8 }))
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => ({
      item: { source: e.source, sourceId: e.source_id, mediaType: e.media_type, title: e.title, poster: e.poster_url, year: e.year, category: e.category, genres: e.genres || [], meta: e.meta || {}, runtime: e.runtime },
      entry: e,
      why: reasonFor(e, { mood, minutes, fromVault: true, company }),
    }));
}

/** New things from the catalogue that fit. */
export async function catalogPicks({ mood, minutes, doing = 'any', company, services = [] }) {
  const out = [];
  const have = new Set(getStoreEntries().map((e) => `${e.source}:${e.media_type}:${e.source_id}`));
  const watch = doing === 'any' || doing === 'watch';
  if (watch) {
    const media = minutes && minutes < 90 ? 'tv' : 'movie';
    const names = mood ? MOOD_GENRES[mood] : [];
    const ids = genreIdsFor(names.slice(0, 3), media);
    const p = { sort_by: 'popularity.desc', 'vote_average.gte': '6.8', 'vote_count.gte': media === 'movie' ? '300' : '80', page: String(1 + Math.floor(Math.random() * 3)) };
    if (ids.length) p.with_genres = ids.join('|');
    if (media === 'movie' && minutes) p['with_runtime.lte'] = String(minutes + 10);
    if (media === 'tv' && minutes) p['with_runtime.lte'] = String(Math.min(minutes, 60));
    if (company === 'family') p.without_genres = '27,53,80';
    if (services.length) Object.assign(p, { with_watch_providers: services.join('|'), watch_region: REGION, with_watch_monetization_types: 'flatrate|free|ads' });
    const d = await tmdb(`discover/${media}`, p).catch(() => ({ results: [] }));
    for (const r of d.results || []) {
      const it = normalizeTmdb(r, media);
      if (it.poster && !have.has(`tmdb:${media}:${it.sourceId}`)) out.push({ item: it, why: [mood ? `${mood === 'mindbending' ? 'mind-bending' : mood} pick` : 'popular pick', services.length ? 'on your services' : null].filter(Boolean).join(' · ') });
    }
  }
  const kinds = doing === 'read' ? ['book', 'manga'] : doing === 'play' ? ['game'] : doing === 'listen' ? ['music', 'podcast'] : doing === 'out' ? ['event'] : doing === 'any' ? ['book', 'game'] : [];
  for (const k of kinds) {
    const d = await trendingShelf(k).catch(() => ({ items: [] }));
    const fit = d.items.filter((i) => !have.has(`${i.source}:${i.mediaType}:${i.sourceId}`));
    const moody = fit.filter((i) => fitsMood(i, mood));
    for (const i of (moody.length >= 3 ? moody : fit).slice(0, 8)) out.push({ item: i, why: moody.includes(i) ? `${k === 'book' ? 'reads' : 'fits'} the mood · trending` : 'trending now' });
  }
  return out.sort(() => Math.random() - 0.5);
}

/** The final three (or more): mostly from your vault, topped up from the catalogue, mixed across kinds. */
export async function tonightPicks(opts, n = 6) {
  const fromVault = vaultPicks(opts).slice(0, Math.ceil(n / 2));
  const fresh = await catalogPicks(opts);
  const seen = new Set(fromVault.map((x) => `${x.item.source}:${x.item.sourceId}`));
  const mixed = [...fromVault];
  for (const f of fresh) {
    if (mixed.length >= n) break;
    const k = `${f.item.source}:${f.item.sourceId}`;
    if (!seen.has(k)) mixed.push(f), seen.add(k);
  }
  return mixed;
}

/** Vault roulette: one random saved thing that fits the filters. */
export function rouletteCandidates({ doing = 'any', minutes, mood }) {
  const list = vaultPicks({ doing, minutes, mood: null });
  if (!mood) return list;
  const moody = list.filter((x) => fitsMood(x.entry, mood));
  return moody.length ? moody : list;
}

export const kindWord = (item) => ({ screen: 'Watch', book: 'Read', manga: 'Read', game: 'Play', music: 'Listen', podcast: 'Listen', place: 'Go', event: 'Go', travel: 'Plan', custom: 'Do' })[kindOf(item)] || 'Try';
export { isScreen };
