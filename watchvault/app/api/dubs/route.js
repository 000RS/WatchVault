// Is there an English dub? For anime, from the community-kept MAL-Dubs list (free, updated often).
// POST { items: [{ key, malId?, anilistId?, title?, year? }] } → { dubs: { key: 'dub' | 'partial' | 'sub' } }
// Only anime is covered; for everything else the answer is unknown and the app says so.

export const dynamic = 'force-dynamic';

const DUB_URL = 'https://raw.githubusercontent.com/MAL-Dubs/MAL-Dubs/main/data/dubInfo.json';
let table = null; // { at, map: Map(malId → 'dub' | 'partial') }

async function dubTable() {
  if (table && Date.now() - table.at < 12 * 3600 * 1000) return table.map;
  const res = await fetch(DUB_URL, { next: { revalidate: 43200 } });
  if (!res.ok) throw new Error('dub list unavailable');
  const data = await res.json();
  const map = new Map();
  for (const [label, ids] of Object.entries(data || {})) {
    if (!Array.isArray(ids)) continue;
    const kind = /^dubbed$/i.test(label) ? 'dub' : /partial|incomplete|ongoing/i.test(label) ? 'partial' : null;
    if (!kind) continue;
    for (const id of ids) if (!map.has(Number(id)) || kind === 'dub') map.set(Number(id), kind);
  }
  table = { at: Date.now(), map };
  return map;
}

const malCache = new Map(); // "a:<anilist id>" or "t:<title>|<year>" → MAL id or 0
async function anilist(query, variables) {
  const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (!res.ok) throw new Error(`anilist ${res.status}`);
  return (await res.json()).data || {};
}

async function resolveMal(items) {
  const byAni = items.filter((i) => !i.malId && i.anilistId && !malCache.has(`a:${i.anilistId}`));
  if (byAni.length) {
    const d = await anilist(`query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id idMal } } }`, { ids: byAni.map((i) => Number(i.anilistId)).slice(0, 50) }).catch(() => ({}));
    for (const m of d.Page?.media || []) malCache.set(`a:${m.id}`, m.idMal || 0);
  }
  const byTitle = items.filter((i) => !i.malId && !i.anilistId && i.title && !malCache.has(`t:${i.title}|${i.year || ''}`)).slice(0, 25);
  if (byTitle.length) {
    // One request, many searches (GraphQL aliases).
    const q = byTitle.map((i, n) => `m${n}: Media(search: ${JSON.stringify(String(i.title).slice(0, 100))}, type: ANIME${i.year ? `, seasonYear: ${Number(i.year)}` : ''}) { idMal }`).join('\n');
    const d = await anilist(`query { ${q} }`).catch(() => ({}));
    byTitle.forEach((i, n) => malCache.set(`t:${i.title}|${i.year || ''}`, d[`m${n}`]?.idMal || 0));
    // Season years often differ from TMDB's first-air year: retry misses without the year.
    const misses = byTitle.filter((i) => i.year && !malCache.get(`t:${i.title}|${i.year}`));
    if (misses.length) {
      const q2 = misses.map((i, n) => `m${n}: Media(search: ${JSON.stringify(String(i.title).slice(0, 100))}, type: ANIME) { idMal }`).join('\n');
      const d2 = await anilist(`query { ${q2} }`).catch(() => ({}));
      misses.forEach((i, n) => d2[`m${n}`]?.idMal && malCache.set(`t:${i.title}|${i.year}`, d2[`m${n}`].idMal));
    }
  }
  return items.map((i) => Number(i.malId) || malCache.get(i.anilistId ? `a:${i.anilistId}` : `t:${i.title}|${i.year || ''}`) || 0);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 60).map((i) => ({ key: String(i.key || ''), malId: i.malId, anilistId: i.anilistId, title: i.title, year: i.year }));
  if (!items.length) return Response.json({ dubs: {} });
  try {
    const [map, mals] = await Promise.all([dubTable(), resolveMal(items)]);
    const dubs = {};
    items.forEach((i, n) => {
      if (mals[n]) dubs[i.key] = map.get(mals[n]) || 'sub';
    });
    return Response.json({ dubs, source: 'MAL-Dubs' });
  } catch {
    return Response.json({ dubs: {}, error: 'Dub information is unavailable right now.' }, { status: 502 });
  }
}
