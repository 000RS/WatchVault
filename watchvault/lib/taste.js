// What someone likes, worked out from their list: favourite genres, languages and titles.

import { STARTED, genreIdsFor } from './categories';

const weight = (e) => {
  let w = e.status === 'completed' ? 3 : e.status === 'watching' ? 2.5 : e.status === 'stopped' || e.status === 'on_hold' ? 1.5 : e.status === 'tried' ? 0.5 : e.status === 'dropped' ? -1 : 0;
  if (e.rating != null) w += (Number(e.rating) - 6) / 1.5;
  return w;
};

export function tasteProfile(entries = [], hidden = new Set()) {
  const pool = entries.filter((e) => STARTED.has(e.status) && !hidden.has(e.category));
  const genre = {};
  const lang = {};
  const media = { movie: 0, tv: 0 };
  for (const e of pool) {
    const w = weight(e);
    const m = e.media_type === 'movie' ? 'movie' : 'tv';
    media[m] += Math.max(w, 0);
    for (const g of e.genres || []) {
      if (g === 'Drama' || g === 'Animation') continue; // too broad to tell anything
      genre[g] = genre[g] || { name: g, score: 0, movie: 0, tv: 0 };
      genre[g].score += w;
      genre[g][m] += Math.max(w, 0);
    }
    if (e.original_language && e.original_language !== 'en') {
      const k = `${e.original_language}|${m}`;
      lang[k] = (lang[k] || 0) + Math.max(w, 0);
    }
  }
  const genres = Object.values(genre)
    .filter((g) => g.score > 2)
    .sort((a, b) => b.score - a.score)
    .map((g) => ({ ...g, media: g.movie >= g.tv ? 'movie' : 'tv' }));
  const languages = Object.entries(lang)
    .filter(([, v]) => v >= 4)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => {
      const [code, m] = k.split('|');
      return { code, media: m };
    });
  const loved = [...pool].filter((e) => e.source === 'tmdb').sort((a, b) => weight(b) - weight(a) || new Date(b.updated_at) - new Date(a.updated_at));
  return { genres, languages, loved, media: media.movie >= media.tv ? 'movie' : 'tv', size: pool.length };
}

/** TMDB genre ids for the top few genres, for one media type. */
export function tasteGenreIds(profile, mediaType, n = 3) {
  return genreIdsFor(
    profile.genres.slice(0, 6).map((g) => g.name),
    mediaType
  ).slice(0, n);
}

const keyOf = (e) => `${e.source}:${e.media_type}:${e.source_id}`;
const STARTED_OK = new Set(['completed', 'watching', 'on_hold', 'stopped']);

/**
 * How alike two people's taste is, 0–100: genres they watch, how they rate the titles
 * they share, and how much they overlap. Also returns what they loved that you haven't seen.
 */
export function tasteMatch(mine, theirs) {
  const my = new Map(mine.map((e) => [keyOf(e), e]));
  const common = theirs.filter((e) => my.has(keyOf(e)) && STARTED_OK.has(e.status) && STARTED_OK.has(my.get(keyOf(e)).status));
  const vec = (list) => {
    const v = new Map();
    for (const e of list) if (STARTED_OK.has(e.status)) for (const g of e.genres || []) v.set(g, (v.get(g) || 0) + 1);
    return v;
  };
  const a = vec(mine);
  const b = vec(theirs);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [g, x] of a) (na += x * x), (dot += x * (b.get(g) || 0));
  for (const [, y] of b) nb += y * y;
  const genre = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const bothRated = common.filter((e) => e.rating != null && my.get(keyOf(e)).rating != null);
  const agree = bothRated.length ? 1 - bothRated.reduce((s, e) => s + Math.abs(e.rating - my.get(keyOf(e)).rating), 0) / bothRated.length / 9 : null;
  const overlap = Math.min(1, common.length / 25);
  const score = agree == null ? genre * 0.75 + overlap * 0.25 : genre * 0.5 + agree * 0.3 + overlap * 0.2;
  const loved = theirs
    .filter((e) => !my.has(keyOf(e)) && (e.rating >= 8 || (e.rating == null && e.status === 'completed' && (e.rewatch_count || 0) > 0)))
    .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0) || (y.popularity ?? 0) - (x.popularity ?? 0));
  const sharedFaves = bothRated.filter((e) => e.rating >= 8 && my.get(keyOf(e)).rating >= 8).sort((x, y) => y.rating + my.get(keyOf(y)).rating - x.rating - my.get(keyOf(x)).rating);
  const fights = bothRated.filter((e) => Math.abs(e.rating - my.get(keyOf(e)).rating) >= 4).map((e) => ({ e, mine: my.get(keyOf(e)).rating }));
  return { pct: Math.round(Math.max(0, Math.min(1, score)) * 100), common: common.length, loved, sharedFaves, fights };
}
