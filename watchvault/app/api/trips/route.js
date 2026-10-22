// Real filming locations for titles, from Wikidata (free, no key).
// GET /api/trips?keys=movie:550,tv:1399  →  { places: [{ id, name, lat, lon, country, image, titles: [{ key, title }] }] }

export const dynamic = 'force-dynamic';

const UA = { 'User-Agent': 'WatchVault/5 (personal tracker; screen trips)', Accept: 'application/sparql-results+json' };

export async function GET(req) {
  const keys = String(new URL(req.url).searchParams.get('keys') || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => /^(movie|tv):\d+$/.test(k))
    .slice(0, 120);
  if (!keys.length) return Response.json({ places: [] });
  const want = new Set(keys);
  const ids = [...new Set(keys.map((k) => k.split(':')[1]))];
  const query = `SELECT ?tmdb ?type ?itemLabel ?loc ?locLabel ?coord ?countryLabel ?img WHERE {
    VALUES ?tmdb { ${ids.map((i) => `"${i}"`).join(' ')} }
    { ?item wdt:P4947 ?tmdb . BIND("movie" AS ?type) } UNION { ?item wdt:P4983 ?tmdb . BIND("tv" AS ?type) }
    ?item wdt:P915 ?loc . ?loc wdt:P625 ?coord .
    OPTIONAL { ?loc wdt:P17 ?country . }
    OPTIONAL { ?loc wdt:P18 ?img . }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 1500`;
  try {
    const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: UA, next: { revalidate: 604800 } });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const places = new Map();
    for (const b of d.results?.bindings || []) {
      const key = `${b.type.value}:${b.tmdb.value}`;
      if (!want.has(key)) continue;
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || '');
      if (!m) continue;
      const id = b.loc.value.split('/').pop();
      const p = places.get(id) || {
        id,
        name: b.locLabel?.value || id,
        lat: Number(m[2]),
        lon: Number(m[1]),
        country: b.countryLabel?.value || null,
        image: b.img?.value ? `${b.img.value.replace('http://', 'https://')}?width=480` : null,
        titles: [],
      };
      if (!p.titles.some((t) => t.key === key)) p.titles.push({ key, title: b.itemLabel?.value || '' });
      places.set(id, p);
    }
    return Response.json({ places: [...places.values()].filter((p) => !/^Q\d+$/.test(p.name)) });
  } catch {
    return Response.json({ places: [], error: 'Filming locations are unavailable right now. Try again later.' }, { status: 502 });
  }
}
