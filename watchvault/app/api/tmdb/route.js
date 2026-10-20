// Server-side proxy for TMDB so the API token never reaches the browser.
// Only read-only catalogue endpoints are allowed. Called as /api/tmdb?path=search/multi&query=...

import { tmdbServer } from '@/lib/tmdbServer';

const ALLOWED = new RegExp(
  '^(' +
    [
      'search/(multi|movie|tv|person|company|collection|keyword)',
      '(movie|tv)/\\d+',
      '(movie|tv)/\\d+/(recommendations|similar|credits|aggregate_credits|watch/providers)',
      'tv/\\d+/season/\\d+',
      'find/tt\\d+',
      'person/\\d+',
      'person/\\d+/combined_credits',
      'company/\\d+',
      'collection/\\d+',
      'watch/providers/(movie|tv)',
      'movie/(now_playing|upcoming|popular|top_rated)',
      'tv/(on_the_air|airing_today|popular|top_rated)',
      'trending/(all|movie|tv)/(day|week)',
      'discover/(movie|tv)',
    ].join('|') +
    ')$'
);

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const endpoint = (sp.get('path') || '').replace(/^\/+|\/+$/g, '');
  if (!ALLOWED.test(endpoint)) return Response.json({ error: 'Endpoint not allowed' }, { status: 404 });

  const params = {};
  sp.forEach((value, key) => {
    if (key !== 'path' && key !== 'api_key') params[key] = value;
  });

  const isDetail = /^(movie|tv)\/\d+$/.test(endpoint);
  try {
    const data = await tmdbServer(endpoint, params, { revalidate: isDetail ? 21600 : 3600 });
    return Response.json(data, {
      headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (e) {
    const status = e.status || 502;
    return Response.json(
      { error: status === 500 ? e.message : status === 404 ? 'That title was not found.' : 'Title data is unavailable right now. Try again in a moment.' },
      { status }
    );
  }
}
