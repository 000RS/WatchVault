// Server-side proxy for TMDB so the API token never reaches the browser.
// Only read-only catalogue endpoints are allowed through.

const ALLOWED = new RegExp(
  '^(' +
    [
      'search/(multi|movie|tv)',
      'movie/(\\d+|now_playing|upcoming|popular|top_rated)',
      'tv/(\\d+|on_the_air|airing_today|popular|top_rated)',
      'trending/(all|movie|tv)/(day|week)',
      'discover/(movie|tv)',
    ].join('|') +
    ')$'
);

// Called as /api/tmdb?path=search/multi&query=...
export async function GET(request) {
  const endpoint = (request.nextUrl.searchParams.get('path') || '').replace(/^\/+|\/+$/g, '');

  if (!ALLOWED.test(endpoint)) {
    return Response.json({ error: 'Endpoint not allowed' }, { status: 404 });
  }

  const token = process.env.TMDB_READ_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) {
    return Response.json(
      { error: 'TMDB is not set up yet. Add TMDB_READ_TOKEN to your environment variables.' },
      { status: 500 }
    );
  }

  const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== 'api_key' && key !== 'path') url.searchParams.set(key, value);
  });
  if (!token) url.searchParams.set('api_key', apiKey);

  const headers = { accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { headers, next: { revalidate: 3600 } });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': res.ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store',
      },
    });
  } catch {
    return Response.json({ error: 'Could not reach TMDB. Try again in a moment.' }, { status: 502 });
  }
}
