// Batch title matcher used by Import, search suggestions and the AniList upgrade.
// POST { items: [{ id, q, year?, kind? }] }  (kind: any | movie | tv | anime)
// → { results: [{ id, best, confidence, alternatives }] }
// TMDB first; AniList recognises anime names, nicknames and romaji when TMDB alone can't.

import { tmdbServer, mapLimit } from '@/lib/tmdbServer';
import { normalizeTmdb, normalizeAni, ANI_FIELDS } from '@/lib/catalog';
import { bestSimilarity, queryVariants, scoreCandidate } from '@/lib/match';

export const maxDuration = 30;

const MAX_ITEMS = 60;

// Keep AniList calls polite: two at a time.
let aniActive = 0;
const aniQueue = [];
async function aniSearch(q) {
  if (aniActive >= 2) await new Promise((r) => aniQueue.push(r));
  aniActive++;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query ($q: String) { Page(perPage: 5) { media(search: $q, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${ANI_FIELDS} } } }`,
        variables: { q },
      }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data?.Page?.media || []).map(normalizeAni);
  } catch {
    return [];
  } finally {
    aniActive--;
    aniQueue.shift()?.();
  }
}

async function tmdbSearch(kind, query, year) {
  const params = { query, include_adult: 'false' };
  if (kind === 'movie') {
    const d = await tmdbServer('search/movie', year ? { ...params, primary_release_year: year } : params);
    if (year && !d.results?.length) return tmdbSearch('movie', query);
    return (d.results || []).slice(0, 8).map((r) => normalizeTmdb(r, 'movie'));
  }
  if (kind === 'tv') {
    const d = await tmdbServer('search/tv', year ? { ...params, first_air_date_year: year } : params);
    if (year && !d.results?.length) return tmdbSearch('tv', query);
    return (d.results || []).slice(0, 8).map((r) => normalizeTmdb(r, 'tv'));
  }
  const d = await tmdbServer('search/multi', params);
  return (d.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 10)
    .map((r) => normalizeTmdb(r));
}

const keyOf = (c) => `${c.source}:${c.mediaType}:${c.sourceId}`;

// Exports from Trakt, Simkl, IMDb and similar carry real IDs: use them directly.
async function byId({ tmdbId, tmdbType, imdbId }) {
  if (tmdbId && /^\d+$/.test(String(tmdbId))) {
    for (const type of tmdbType ? [tmdbType] : ['movie', 'tv']) {
      const d = await tmdbServer(`${type}/${tmdbId}`, {}, { revalidate: 86400 }).catch(() => null);
      if (d?.id) return normalizeTmdb(d, type);
    }
  }
  if (imdbId && /^tt\d+$/.test(imdbId)) {
    const f = await tmdbServer(`find/${imdbId}`, { external_source: 'imdb_id' }, { revalidate: 86400 }).catch(() => null);
    const hit = f?.movie_results?.[0] ? ['movie', f.movie_results[0]] : f?.tv_results?.[0] ? ['tv', f.tv_results[0]] : null;
    if (hit) {
      const d = await tmdbServer(`${hit[0]}/${hit[1].id}`, {}, { revalidate: 86400 }).catch(() => null);
      return normalizeTmdb(d || hit[1], hit[0]);
    }
  }
  return null;
}

async function matchOne({ q, year, kind = 'any', tmdbId, tmdbType, imdbId }) {
  if (tmdbId || imdbId) {
    const direct = await byId({ tmdbId, tmdbType, imdbId });
    if (direct) return { best: direct, confidence: 1, alternatives: [] };
  }
  q = String(q || '').trim().slice(0, 200);
  year = Number(year) || null;
  if (q.length < 1) return { best: null, confidence: 0, alternatives: [] };

  const cands = new Map();
  const consider = (list, opts = {}, weight = 1) => {
    for (const c of list) {
      const score = scoreCandidate(c, { q: opts.q || q, year: opts.year ?? year, kind, extraNames: opts.extraNames || [] }) * weight;
      const k = keyOf(c);
      if (!cands.has(k) || cands.get(k).score < score) cands.set(k, { item: c, score });
    }
  };
  const top = () => [...cands.values()].sort((a, b) => b.score - a.score);

  // 1. TMDB with the text as typed
  const first = kind === 'movie' ? ['movie'] : kind === 'tv' ? ['tv'] : kind === 'anime' ? ['tv', 'movie'] : ['any'];
  for (const k of first) consider(await tmdbSearch(k, q, year).catch(() => []));
  // The hint can be wrong (a series listed under "Movies"), so widen the search if nothing fits well.
  if (kind !== 'any' && (top()[0]?.score || 0) < 0.85) consider(await tmdbSearch('any', q).catch(() => []));

  // 2. AniList knows anime nicknames, romaji and English names; use it to find the TMDB entry.
  if ((top()[0]?.score || 0) < 0.86 && kind !== 'movie') {
    const ani = await aniSearch(q);
    for (const a of ani.slice(0, 3)) {
      const aniSim = bestSimilarity(q, a.names);
      if (aniSim < 0.5) continue;
      const tryNames = [...new Set([a.title, a.names[1]].filter(Boolean))].slice(0, 2);
      let linked = false;
      for (const name of tryNames) {
        const found = await tmdbSearch(a.isMovie ? 'movie' : 'tv', name, a.year).catch(() => []);
        for (const c of found) {
          const viaAni = scoreCandidate(c, { q: name, year: a.year, kind: 'anime', extraNames: a.names });
          if (viaAni >= 0.8) {
            const score = Math.min(0.99, 0.5 * aniSim + 0.5 * viaAni + (aniSim > 0.9 ? 0.04 : 0));
            const k = keyOf(c);
            if (!cands.has(k) || cands.get(k).score < score) cands.set(k, { item: c, score });
            linked = true;
          }
        }
        if (linked) break;
      }
      // Not on TMDB at all: keep the AniList entry itself.
      if (!linked) {
        const k = keyOf(a);
        const score = aniSim * 0.95 + (year && a.year === year ? 0.04 : 0);
        if (!cands.has(k) || cands.get(k).score < score) cands.set(k, { item: a, score });
      }
    }
  }

  // 3. Simplified versions of the text ("Season 2", "(dub)", extra words removed)
  if ((top()[0]?.score || 0) < 0.72) {
    for (const v of queryVariants(q).slice(1, 3)) {
      const found = await tmdbSearch('any', v).catch(() => []);
      consider(found, {}, 1);
      consider(found, { q: v }, 0.9);
    }
  }

  const ranked = top();
  const best = ranked[0] || null;
  let confidence = best ? best.score : 0;
  const second = ranked[1];
  // Two different titles that look equally right (e.g. a remake): ask instead of guessing.
  if (best && second && second.score > 0.8 && best.score - second.score < 0.025 && best.item.title !== second.item.title) {
    confidence = Math.min(confidence, 0.79);
  }

  let bestItem = best?.item || null;
  if (bestItem?.source === 'tmdb' && confidence >= 0.55) {
    // Full details: seasons, episodes, runtime, genres.
    bestItem = await tmdbServer(`${bestItem.mediaType}/${bestItem.sourceId}`, {}, { revalidate: 86400 })
      .then((d) => ({ ...normalizeTmdb(d, bestItem.mediaType), popularity: bestItem.popularity, voteCount: bestItem.voteCount }))
      .catch(() => bestItem);
  }

  return {
    best: bestItem,
    confidence: Math.round(confidence * 100) / 100,
    alternatives: ranked
      .slice(1)
      .filter((r) => r.score >= 0.35)
      .slice(0, 4)
      .map((r) => r.item),
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Send a list of titles to match.' }, { status: 400 });
  }
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return Response.json({ results: [] });

  try {
    const results = await mapLimit(items, 8, async (it) => ({ id: it.id, ...(await matchOne(it)) }));
    return Response.json({
      results: results.map((r, i) => (r?.error ? { id: items[i].id, best: null, confidence: 0, alternatives: [], error: r.error } : r)),
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Matching failed.' }, { status: e.status || 500 });
  }
}
