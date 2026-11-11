// Search and "what's popular" for the shelves beyond movies and series.
// GET /api/everything?kind=book|music|podcast|game|place|food|travel|event&q=...   (search)
// GET /api/everything?kind=...&feed=trending                                        (popular now)
// All sources are free. Games use IGDB when IGDB_CLIENT_ID/IGDB_CLIENT_SECRET are set, otherwise Steam.
// Events need TICKETMASTER_API_KEY (free); without it, events are added by hand.

export const dynamic = 'force-dynamic';

const REGION = (process.env.NEXT_PUBLIC_REGION || 'NZ').toUpperCase();
const UA = { 'User-Agent': 'WatchVault/5 (personal tracker)', Accept: 'application/json' };
const yearOf = (d) => {
  const y = parseInt(String(d || '').slice(0, 4), 10);
  return Number.isFinite(y) && y > 1000 ? y : null;
};
async function getJson(url, init = {}, revalidate = 3600) {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, next: { revalidate } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ---------------- Books: Open Library ---------------- */
const OL_FIELDS = 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,language';
function book(d) {
  if (!d?.key) return null;
  const id = String(d.key).replace('/works/', '');
  return {
    source: 'openlibrary',
    sourceId: id,
    mediaType: 'book',
    category: 'books',
    title: d.title,
    poster: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    year: d.first_publish_year || null,
    genres: (d.subject || []).filter((s) => s.length < 24 && !/[0-9]|fiction, |accessible|protected|large type/i.test(s)).slice(0, 4),
    totalEpisodes: d.number_of_pages_median || null,
    language: d.language?.[0] || null,
    meta: { by: (d.author_name || []).slice(0, 2).join(', ') || null },
  };
}
async function books(q, feed) {
  if (feed) {
    const d = await getJson('https://openlibrary.org/trending/weekly.json?limit=40', {}, 21600);
    return (d.works || []).map(book).filter((b) => b?.poster);
  }
  const d = await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=24&fields=${OL_FIELDS}`);
  return (d.docs || []).map(book).filter(Boolean);
}

/* ---------------- Music and podcasts: Apple's free iTunes Search ---------------- */
const art = (u) => (u ? u.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null);
function album(d) {
  const isSong = d.wrapperType === 'track';
  return {
    source: 'itunes',
    sourceId: String(isSong ? d.trackId : d.collectionId),
    mediaType: 'music',
    category: 'music',
    title: isSong ? d.trackName : d.collectionName,
    poster: art(d.artworkUrl100 || d.artworkUrl60),
    year: yearOf(d.releaseDate),
    genres: d.primaryGenreName ? [d.primaryGenreName] : [],
    meta: { by: d.artistName || null, type: isSong ? 'song' : 'album', preview: d.previewUrl || null, link: d.trackViewUrl || d.collectionViewUrl || null, tracks: d.trackCount || null },
  };
}
function podcast(d) {
  return {
    source: 'itunes',
    sourceId: String(d.collectionId),
    mediaType: 'podcast',
    category: 'podcasts',
    title: d.collectionName,
    poster: art(d.artworkUrl600 || d.artworkUrl100),
    year: yearOf(d.releaseDate),
    genres: (d.genres || []).filter((g) => g !== 'Podcasts').slice(0, 3),
    totalEpisodes: d.trackCount || null,
    meta: { by: d.artistName || null, link: d.collectionViewUrl || null, feed: d.feedUrl || null },
  };
}
async function music(q, feed) {
  const cc = REGION.toLowerCase();
  if (feed) {
    const rss = await getJson(`https://rss.applemarketingtools.com/api/v2/${cc}/music/most-played/40/songs.json`, {}, 21600);
    const ids = (rss.feed?.results || []).map((r) => r.id).join(',');
    if (!ids) return [];
    const d = await getJson(`https://itunes.apple.com/lookup?id=${ids}&country=${cc}`, {}, 21600);
    return (d.results || []).map(album);
  }
  const [a, s] = await Promise.all([
    getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=14&country=${cc}`),
    getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=10&country=${cc}`),
  ]);
  return [...(a.results || []), ...(s.results || [])].map(album);
}
async function podcasts(q, feed) {
  const cc = REGION.toLowerCase();
  if (feed) {
    const rss = await getJson(`https://rss.applemarketingtools.com/api/v2/${cc}/podcasts/top/30/podcasts.json`, {}, 21600);
    const ids = (rss.feed?.results || []).map((r) => r.id).join(',');
    if (!ids) return [];
    const d = await getJson(`https://itunes.apple.com/lookup?id=${ids}&country=${cc}`, {}, 21600);
    return (d.results || []).map(podcast);
  }
  const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast&limit=20&country=${cc}`);
  return (d.results || []).map(podcast);
}

/* ---------------- Games: IGDB (if keys are set) or Steam ---------------- */
let igdbToken = null;
async function igdb(body) {
  const id = process.env.IGDB_CLIENT_ID;
  const secret = process.env.IGDB_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (!igdbToken || igdbToken.exp < Date.now()) {
    const t = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`, { method: 'POST' }).then((r) => r.json());
    igdbToken = { v: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  }
  const res = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': id, Authorization: `Bearer ${igdbToken.v}`, 'Content-Type': 'text/plain' }, body });
  if (!res.ok) return null;
  return res.json();
}
const IGDB_FIELDS = 'fields name,cover.image_id,first_release_date,genres.name,platforms.abbreviation,summary,total_rating,videos.video_id,involved_companies.company.name,involved_companies.developer;';
function igdbGame(g) {
  return {
    source: 'igdb',
    sourceId: String(g.id),
    mediaType: 'game',
    category: 'games',
    title: g.name,
    poster: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    genres: (g.genres || []).map((x) => x.name).slice(0, 3),
    overview: g.summary || '',
    rating: g.total_rating ? Math.round(g.total_rating) / 10 : null,
    meta: {
      by: (g.involved_companies || []).filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean)[0] || null,
      platforms: (g.platforms || []).map((p) => p.abbreviation).filter(Boolean).slice(0, 5),
      trailer: g.videos?.[0]?.video_id || null,
    },
  };
}
function steamGame(g) {
  return {
    source: 'steam',
    sourceId: String(g.id),
    mediaType: 'game',
    category: 'games',
    title: g.name,
    poster: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/library_600x900.jpg`,
    backdrop: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`,
    year: null,
    genres: [],
    meta: { platforms: Object.entries(g.platforms || {}).filter(([, v]) => v).map(([k]) => (k === 'windows' ? 'PC' : k === 'mac' ? 'Mac' : 'Linux')), link: `https://store.steampowered.com/app/${g.id}` },
  };
}
async function games(q, feed) {
  const viaIgdb = await igdb(feed ? `${IGDB_FIELDS} where total_rating_count > 200 & first_release_date > ${Math.floor(Date.now() / 1000) - 3 * 365 * 86400}; sort total_rating_count desc; limit 40;` : `${IGDB_FIELDS} search "${q.replace(/"/g, '')}"; limit 24;`).catch(() => null);
  if (viaIgdb) return viaIgdb.map(igdbGame);
  if (feed) {
    const d = await getJson(`https://store.steampowered.com/api/featuredcategories?cc=${REGION.toLowerCase()}&l=english`, {}, 21600);
    const seen = new Set();
    return [...(d.top_sellers?.items || []), ...(d.new_releases?.items || []), ...(d.specials?.items || [])]
      .filter((g) => g.type === 0 && !seen.has(g.id) && seen.add(g.id))
      .map((g) => steamGame({ id: g.id, name: g.name, platforms: { windows: g.windows_available, mac: g.mac_available, linux: g.linux_available } }));
  }
  const d = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=${REGION.toLowerCase()}`);
  return (d.items || []).filter((g) => g.type === 'app').map(steamGame);
}

/* ---------------- Places, food and travel: OpenStreetMap via Photon ---------------- */
const FOOD = new Set(['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'bakery', 'ice_cream', 'food_court', 'biergarten', 'confectionery', 'deli', 'coffee', 'juice_bar', 'tea', 'dessert']);
const TRAVEL = new Set(['city', 'country', 'state', 'town', 'village', 'island', 'region', 'county', 'archipelago', 'locality', 'province']);
const CENTRES = { NZ: [-36.8485, 174.7633], AU: [-33.8688, 151.2093], IN: [28.6139, 77.209], PK: [24.8607, 67.0011], GB: [51.5072, -0.1276], US: [40.7128, -74.006], CA: [43.6532, -79.3832] };
function place(f, want) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [];
  const v = p.osm_value || '';
  const isFood = FOOD.has(v);
  const isTravel = TRAVEL.has(v) || p.type === 'city' || p.type === 'country';
  const kind = want === 'travel' || (!want && isTravel) ? 'travel' : 'place';
  const category = kind === 'travel' ? 'travel' : isFood ? 'food' : 'places';
  const area = [p.district || p.locality, p.city, p.state, p.country].filter((x, i, a) => x && a.indexOf(x) === i && x !== p.name);
  return {
    source: 'osm',
    sourceId: `${(p.osm_type || 'N')[0]}${p.osm_id}`,
    mediaType: kind,
    category,
    title: p.name || p.street || 'Unnamed place',
    poster: null,
    year: null,
    genres: v ? [v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ')] : [],
    countries: p.countrycode ? [String(p.countrycode).toUpperCase()] : [],
    meta: {
      by: area.slice(0, 2).join(', ') || null,
      address: [p.housenumber, p.street, p.district || p.locality, p.city].filter(Boolean).join(' ') || null,
      lat,
      lon,
      type: v || null,
      country: p.country || null,
    },
  };
}
async function places(q, want, sp) {
  const [lat, lon] = sp.get('lat') ? [Number(sp.get('lat')), Number(sp.get('lon'))] : CENTRES[REGION] || CENTRES.NZ;
  const params = new URLSearchParams({ q, limit: '20', lang: 'en' });
  if (want !== 'travel') {
    params.set('lat', String(lat));
    params.set('lon', String(lon));
  }
  if (want === 'travel') for (const l of ['city', 'country', 'state', 'locality']) params.append('layer', l);
  if (want === 'food') for (const t of ['amenity:cafe', 'amenity:restaurant', 'amenity:fast_food', 'amenity:bar', 'amenity:pub', 'shop:bakery', 'amenity:ice_cream']) params.append('osm_tag', t);
  const d = await getJson(`https://photon.komoot.io/api/?${params}`, {}, 86400);
  const out = (d.features || []).map((f) => place(f, want === 'travel' ? 'travel' : null)).filter((x) => x.title);
  const seen = new Set();
  return out.filter((x) => !seen.has(x.sourceId) && seen.add(x.sourceId));
}

/* ---------------- Events: Ticketmaster (free key) ---------------- */
async function events(q, feed) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return { items: [], note: 'Live event listings need a free Ticketmaster key (see README). You can still add any event yourself.' };
  const params = new URLSearchParams({ apikey: key, countryCode: REGION, size: '30', sort: 'date,asc' });
  if (q && !feed) params.set('keyword', q);
  const d = await getJson(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {}, 3600);
  return (d._embedded?.events || []).map((e) => {
    const venue = e._embedded?.venues?.[0];
    const img = (e.images || []).filter((i) => i.ratio === '3_2' || i.ratio === '16_9').sort((a, b) => b.width - a.width)[0];
    return {
      source: 'ticketmaster',
      sourceId: e.id,
      mediaType: 'event',
      category: 'events',
      title: e.name,
      poster: img?.url || e.images?.[0]?.url || null,
      year: yearOf(e.dates?.start?.localDate),
      genres: [e.classifications?.[0]?.segment?.name, e.classifications?.[0]?.genre?.name].filter((g) => g && g !== 'Undefined'),
      meta: {
        by: [venue?.name, venue?.city?.name].filter(Boolean).join(', ') || null,
        date: e.dates?.start?.localDate || null,
        time: e.dates?.start?.localTime || null,
        link: e.url || null,
        lat: venue?.location ? Number(venue.location.latitude) : null,
        lon: venue?.location ? Number(venue.location.longitude) : null,
      },
    };
  });
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind');
  const q = String(sp.get('q') || '').trim().slice(0, 120);
  const feed = sp.get('feed') === 'trending';
  if (!q && !feed) return Response.json({ items: [] });
  try {
    let out;
    if (kind === 'book') out = await books(q, feed);
    else if (kind === 'music') out = await music(q, feed);
    else if (kind === 'podcast') out = await podcasts(q, feed);
    else if (kind === 'game') out = await games(q, feed);
    else if (kind === 'place' || kind === 'food' || kind === 'travel') out = q ? await places(q, kind, sp) : [];
    else if (kind === 'event') out = await events(q, feed);
    else return Response.json({ error: 'Unknown shelf.' }, { status: 400 });
    const items = Array.isArray(out) ? out : out.items;
    return Response.json({ items: items.slice(0, 40), note: out.note || null });
  } catch (e) {
    return Response.json({ items: [], error: "That shelf's search is busy right now. Try again in a moment." }, { status: 502 });
  }
}
