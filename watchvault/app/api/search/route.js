// Search that forgives spelling: tries the text as typed plus common spelling variants,
// and returns titles and people (actors, directors, writers from every country).
// GET /api/search?q=chota+bheem&type=all|movie|tv|anime&year=2019

import { tmdbServer, mapLimit } from '@/lib/tmdbServer';
import { normalizeTmdb, normalizePerson } from '@/lib/catalog';
import { bestSimilarity, spellingVariants } from '@/lib/match';

// Search results for films carry a language but no country, so guess the country from the language.
const LANG_COUNTRY = { hi: ['IN'], ta: ['IN'], te: ['IN'], ml: ['IN'], kn: ['IN'], bn: ['IN', 'BD'], mr: ['IN'], pa: ['IN', 'PK'], ur: ['PK', 'IN'], ko: ['KR'], ja: ['JP'], zh: ['CN', 'TW', 'HK'], cn: ['CN', 'HK'], th: ['TH'], tr: ['TR'], fa: ['IR'], id: ['ID'], tl: ['PH'], vi: ['VN'] };

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().slice(0, 120);
  const type = sp.get('type') || 'all';
  const year = Number(sp.get('year')) || null;
  const language = sp.get('language') || '';
  const country = (sp.get('country') || '').toUpperCase();
  if (q.length < 1) return Response.json({ items: [], people: [] });

  const path = type === 'movie' ? 'search/movie' : type === 'tv' || type === 'anime' ? 'search/tv' : 'search/multi';
  const variants = [q, ...spellingVariants(q)];
  try {
    const first = await tmdbServer(path, { query: q, include_adult: 'false' });
    const firstCount = (first.results || []).filter((r) => r.media_type !== 'person').length;
    // Only spend extra requests when the text as typed found little.
    const extra = firstCount >= 6 ? [] : variants.slice(1, 11);
    const more = await mapLimit(extra, 6, (v) => tmdbServer(path, { query: v, include_adult: 'false' }));

    const items = new Map();
    const people = new Map();
    let bestVariant = null;
    const take = (res, v, bonus) => {
      for (const r of res?.results || []) {
        const mt = r.media_type || (type === 'movie' ? 'movie' : 'tv');
        if (mt === 'person') {
          const p = normalizePerson(r);
          const sim = Math.max(bestSimilarity(q, [p.name]), bestSimilarity(v, [p.name]) * 0.97);
          const score = sim + Math.min(0.3, Math.log10(p.popularity + 1) / 8) + bonus;
          if (!people.has(p.id) || people.get(p.id).score < score) people.set(p.id, { ...p, score });
          continue;
        }
        if (mt !== 'movie' && mt !== 'tv') continue;
        const it = normalizeTmdb(r, mt);
        if (year && it.year !== year) continue;
        if (language && it.language !== language) continue;
        if (country && !(it.countries?.length ? it.countries.includes(country) : LANG_COUNTRY[it.language]?.includes(country))) continue;
        const sim = Math.max(bestSimilarity(q, [it.title, it.originalTitle]), bestSimilarity(v, [it.title, it.originalTitle]) * 0.97);
        const score = sim + Math.min(0.25, Math.log10((it.voteCount || 0) + 1) / 14) + bonus;
        const k = `${mt}:${it.sourceId}`;
        if (!items.has(k) || items.get(k).score < score) items.set(k, { ...it, score });
        if (v !== q && sim > 0.8 && (!bestVariant || sim > bestVariant.sim)) bestVariant = { text: it.title, sim };
      }
    };
    take(first, q, 0.2);
    extra.forEach((v, i) => take(more[i], v, 0));

    let list = [...items.values()].sort((a, b) => b.score - a.score);
    if (type === 'anime') list = list.filter((i) => i.category === 'anime');
    const ppl = [...people.values()].filter((p) => p.score > 0.75).sort((a, b) => b.score - a.score).slice(0, 8);
    return Response.json(
      { items: list.slice(0, 40), people: ppl, didYouMean: firstCount < 2 && bestVariant ? bestVariant.text : null },
      { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (e) {
    return Response.json({ error: e.message || 'Search failed', items: [], people: [] }, { status: e.status || 500 });
  }
}
