// "Canon" lists used for completion rankings: the best-known titles per category and genre.
// Built from TMDB once a day and cached.

import { tmdbServer, mapLimit } from '@/lib/tmdbServer';

export const maxDuration = 30;
export const dynamic = 'force-dynamic'; // cached per request below, not at build time

const B = [
  { id: 'movies', label: 'Top 100 movies', group: 'category', category: 'movies', media: 'movie', size: 100, params: {} },
  { id: 'series', label: 'Top 100 series', group: 'category', category: 'series', media: 'tv', size: 100, params: { without_genres: '16' } },
  { id: 'anime', label: 'Top 100 anime', group: 'category', category: 'anime', media: 'tv', size: 100, params: { with_genres: '16', with_origin_country: 'JP' } },
  { id: 'anime_movies', label: 'Top 40 anime films', group: 'category', category: 'anime', media: 'movie', size: 40, params: { with_genres: '16', with_origin_country: 'JP' } },
  { id: 'kdrama', label: 'Top 50 K-Dramas', group: 'category', category: 'kdrama', media: 'tv', size: 50, params: { with_origin_country: 'KR', without_genres: '16' } },
  { id: 'turkish', label: 'Top 50 Turkish dramas', group: 'category', category: 'turkish', media: 'tv', size: 50, params: { with_origin_country: 'TR' } },
  { id: 'indian', label: 'Top 50 Indian series', group: 'category', category: 'indian', media: 'tv', size: 50, params: { with_origin_country: 'IN' } },
  { id: 'cdrama', label: 'Top 50 C-Dramas', group: 'category', category: 'cdrama', media: 'tv', size: 50, params: { with_origin_country: 'CN', without_genres: '16' } },
  { id: 'romcom', label: 'Top 50 rom-com movies', group: 'genre', category: 'movies', media: 'movie', size: 50, params: { with_genres: '10749,35' } },
  { id: 'action', label: 'Top 50 action movies', group: 'genre', category: 'movies', media: 'movie', size: 50, params: { with_genres: '28' } },
  { id: 'horror', label: 'Top 50 horror movies', group: 'genre', category: 'movies', media: 'movie', size: 50, params: { with_genres: '27' } },
  { id: 'scifi', label: 'Top 50 sci-fi movies', group: 'genre', category: 'movies', media: 'movie', size: 50, params: { with_genres: '878' } },
  { id: 'thriller', label: 'Top 50 thrillers', group: 'genre', category: 'movies', media: 'movie', size: 50, params: { with_genres: '53' } },
  { id: 'animated', label: 'Top 50 animated movies', group: 'genre', category: 'movies', media: 'movie', size: 50, params: { with_genres: '16' } },
  { id: 'crime_tv', label: 'Top 50 crime series', group: 'genre', category: 'series', media: 'tv', size: 50, params: { with_genres: '80' } },
];

export async function GET() {
  try {
    const jobs = B.flatMap((b) => Array.from({ length: Math.ceil(b.size / 20) }, (_, i) => ({ b, page: i + 1 })));
    const pages = await mapLimit(jobs, 8, ({ b, page }) =>
      tmdbServer(`discover/${b.media}`, { ...b.params, sort_by: 'vote_count.desc', include_adult: 'false', page }, { revalidate: 86400 })
    );
    const out = B.map((b) => ({ id: b.id, label: b.label, group: b.group, category: b.category, size: b.size, keys: [] }));
    jobs.forEach(({ b }, i) => {
      const o = out.find((x) => x.id === b.id);
      for (const r of pages[i]?.results || []) if (o.keys.length < b.size) o.keys.push(`${b.media}:${r.id}`);
    });
    return Response.json({ benchmarks: out.filter((o) => o.keys.length) }, { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (e) {
    return Response.json({ error: e.message, benchmarks: [] }, { status: e.status || 500 });
  }
}
