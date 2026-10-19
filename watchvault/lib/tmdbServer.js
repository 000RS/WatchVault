// Server-only TMDB access. The token never leaves the server.

export async function tmdbServer(path, params = {}, { revalidate = 3600 } = {}) {
  const token = process.env.TMDB_READ_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) throw Object.assign(new Error('Title data is not set up yet. Add TMDB_READ_TOKEN to the environment variables.'), { status: 500 });

  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  if (!token) url.searchParams.set('api_key', apiKey);

  const headers = { accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers, next: { revalidate } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`TMDB ${res.status}`), { status: res.status });
    return res.json();
  }
  throw Object.assign(new Error('TMDB is busy'), { status: 429 });
}

/** Run async work over a list with a fixed number in flight at once. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        out[i] = { error: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
