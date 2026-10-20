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
