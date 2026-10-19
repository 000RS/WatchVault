// Talks to TMDB (through our own /api/tmdb route) and AniList, and turns both
// into one "title" shape the rest of the app uses. The normalize functions are
// pure, so the server routes reuse them.

import { categorize, genreNames } from './categories';

const IMG = 'https://image.tmdb.org/t/p/';
const ANILIST = 'https://graphql.anilist.co';

export const img = (path, size = 'w342') => (path ? `${IMG}${size}${path}` : null);

/* ---------------- TMDB (browser) ---------------- */

export async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ path, language: 'en-US', ...params }).toString();
  const res = await fetch(`/api/tmdb?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.status_message || `Couldn't load titles (${res.status}).`);
  return data;
}

function yearOf(date) {
  const y = parseInt(String(date || '').slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function normalizeTmdb(r, typeHint) {
  const mediaType = r.media_type || typeHint;
  const isMovie = mediaType === 'movie';
  const countries = r.origin_country?.length ? r.origin_country : (r.production_countries || []).map((c) => c.iso_3166_1);
  const genreIds = r.genre_ids || (r.genres || []).map((g) => g.id);
  const seasons = (r.seasons || [])
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)
    .map((s) => ({ number: s.season_number, episodes: s.episode_count || 0, name: s.name, airDate: s.air_date }));

  return {
    source: 'tmdb',
    sourceId: String(r.id),
    mediaType,
    title: (isMovie ? r.title : r.name) || r.title || r.name || 'Untitled',
    originalTitle: (isMovie ? r.original_title : r.original_name) || null,
    poster: img(r.poster_path),
    posterPath: r.poster_path || null,
    backdrop: img(r.backdrop_path, 'w1280'),
    year: yearOf(isMovie ? r.release_date : r.first_air_date),
    date: (isMovie ? r.release_date : r.first_air_date) || null,
    countries: countries || [],
    language: r.original_language || null,
    overview: r.overview || '',
    genres: r.genres?.length ? r.genres.map((g) => g.name) : genreNames(genreIds, mediaType),
    genreIds,
    category: categorize({ source: 'tmdb', mediaType, countries, language: r.original_language, genreIds }),
    runtime: isMovie ? r.runtime || null : (r.episode_run_time || [])[0] || r.last_episode_to_air?.runtime || null,
    totalEpisodes: isMovie ? null : r.number_of_episodes ?? (seasons.length ? seasons.reduce((a, s) => a + s.episodes, 0) : null),
    totalSeasons: isMovie ? null : r.number_of_seasons ?? (seasons.length || null),
    seasons,
    popularity: r.popularity ?? null,
    voteCount: r.vote_count ?? null,
    rating: r.vote_average ?? null,
    airing: r.status || null,
    nextEpisode: r.next_episode_to_air
      ? { date: r.next_episode_to_air.air_date, season: r.next_episode_to_air.season_number, episode: r.next_episode_to_air.episode_number }
      : null,
    detailed: Boolean(r.genres || r.seasons || r.runtime !== undefined),
  };
}

/* ---------------- AniList (browser or server) ---------------- */

export const ANI_FIELDS = `
  id idMal
  title { romaji english native }
  synonyms
  coverImage { large }
  bannerImage
  startDate { year month day }
  episodes duration format status countryOfOrigin genres popularity
  description(asHtml: false)
  nextAiringEpisode { episode airingAt }
`;

export async function anilist(query, variables = {}) {
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error('Anime lookups are busy right now. Try again in a minute.');
  if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message || `Anime lookup failed (${res.status}).`);
  return json.data;
}

const FORMAT = { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const ANI_STATUS = { FINISHED: 'Ended', RELEASING: 'Airing', NOT_YET_RELEASED: 'Upcoming', CANCELLED: 'Cancelled', HIATUS: 'On hiatus' };

export function normalizeAni(m) {
  const sd = m.startDate || {};
  return {
    source: 'anilist',
    sourceId: String(m.id),
    malId: m.idMal || null,
    mediaType: 'anime',
    title: m.title?.english || m.title?.romaji || m.title?.native || 'Untitled',
    originalTitle: m.title?.native || m.title?.romaji || null,
    names: [m.title?.english, m.title?.romaji, m.title?.native, ...(m.synonyms || [])].filter(Boolean),
    poster: m.coverImage?.large || null,
    backdrop: m.bannerImage || null,
    year: sd.year || null,
    date: sd.year ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}` : null,
    countries: m.countryOfOrigin ? [m.countryOfOrigin] : [],
    language: 'ja',
    overview: String(m.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(),
    genres: m.genres || [],
    genreIds: [],
    category: 'anime',
    format: FORMAT[m.format] || m.format || null,
    isMovie: m.format === 'MOVIE',
    runtime: m.duration || null,
    totalEpisodes: m.episodes ?? null,
    totalSeasons: null,
    seasons: [],
    popularity: m.popularity ? m.popularity / 1000 : null,
    airing: ANI_STATUS[m.status] || m.status || null,
    nextEpisode: m.nextAiringEpisode
      ? { date: new Date(m.nextAiringEpisode.airingAt * 1000).toISOString().slice(0, 10), episode: m.nextAiringEpisode.episode }
      : null,
    detailed: true,
  };
}

export async function searchAnime(q, perPage = 10) {
  const data = await anilist(
    `query ($q: String, $n: Int) { Page(perPage: $n) { media(search: $q, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${ANI_FIELDS} } } }`,
    { q, n: perPage }
  );
  return (data.Page?.media || []).map(normalizeAni);
}

export async function anilistUserList(userName) {
  const data = await anilist(
    `query ($u: String) { MediaListCollection(userName: $u, type: ANIME) {
      lists { entries { status progress score(format: POINT_10_DECIMAL) media { ${ANI_FIELDS} } } } } }`,
    { u: userName }
  );
  const STATUS = { CURRENT: 'watching', REPEATING: 'watching', COMPLETED: 'completed', PLANNING: 'plan', PAUSED: 'on_hold', DROPPED: 'dropped' };
  const rows = [];
  for (const list of data.MediaListCollection?.lists || []) {
    for (const e of list.entries || []) rows.push({ ani: normalizeAni(e.media), status: STATUS[e.status] || 'plan', episodes: e.progress || 0, rating: e.score || null });
  }
  return rows;
}

/* ---------------- Unified helpers (browser) ---------------- */

export async function getTitle(source, mediaType, id) {
  if (source === 'anilist') {
    const data = await anilist(`query ($id: Int) { Media(id: $id, type: ANIME) { ${ANI_FIELDS} } }`, { id: Number(id) });
    if (!data.Media) throw new Error('This title is no longer listed.');
    return normalizeAni(data.Media);
  }
  return normalizeTmdb(await tmdb(`${mediaType}/${id}`), mediaType);
}

export async function similarTitles(mediaType, id) {
  const d = await tmdb(`${mediaType}/${id}/recommendations`);
  let items = (d.results || []).map((r) => normalizeTmdb(r, mediaType));
  if (items.length < 6) {
    const s = await tmdb(`${mediaType}/${id}/similar`).catch(() => ({ results: [] }));
    items = items.concat((s.results || []).map((r) => normalizeTmdb(r, mediaType)));
  }
  const seen = new Set();
  return items.filter((i) => i.poster && !seen.has(i.sourceId) && seen.add(i.sourceId));
}

/** Search box results: TMDB first, AniList only for anime TMDB doesn't have. */
export async function searchCatalog(q, { type = 'all', year } = {}) {
  const tasks = [];
  if (type === 'movie') tasks.push(tmdb('search/movie', { query: q, include_adult: 'false', ...(year ? { primary_release_year: year } : {}) }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'movie'))));
  else if (type === 'tv') tasks.push(tmdb('search/tv', { query: q, include_adult: 'false', ...(year ? { first_air_date_year: year } : {}) }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'tv'))));
  else
    tasks.push(
      tmdb('search/multi', { query: q, include_adult: 'false' }).then((d) =>
        (d.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((r) => normalizeTmdb(r)).filter((i) => !year || i.year === Number(year))
      )
    );
  const wantAnime = type === 'all' || type === 'anime';
  if (wantAnime) tasks.push(searchAnime(q, 8).catch(() => []));
  const [main, ani = []] = await Promise.all(tasks);
  let items = main;
  if (type === 'anime') items = items.filter((i) => i.category === 'anime');
  const known = new Set(items.map((i) => simple(i.title)).concat(items.map((i) => simple(i.originalTitle))));
  const extra = ani.filter((a) => !a.names.some((n) => known.has(simple(n))) && (!year || a.year === Number(year)));
  return items.concat(extra.slice(0, type === 'anime' ? 8 : 4));
}

const simple = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------------- Browse ("tick off what you've seen") ---------------- */

export const BROWSE_TYPES = [
  { id: 'movies', label: 'Movies', media: 'movie', params: {} },
  { id: 'series', label: 'Series', media: 'tv', params: { without_genres: '16' } },
  { id: 'anime', label: 'Anime', media: 'tv', params: { with_genres: '16', with_origin_country: 'JP' } },
  { id: 'anime_movies', label: 'Anime films', media: 'movie', params: { with_genres: '16', with_origin_country: 'JP' }, category: 'anime' },
  { id: 'kdrama', label: 'K-Drama', media: 'tv', params: { with_origin_country: 'KR', without_genres: '16' } },
  { id: 'turkish', label: 'Turkish', media: 'tv', params: { with_origin_country: 'TR' } },
  { id: 'indian', label: 'Indian', media: 'tv', params: { with_origin_country: 'IN' } },
  { id: 'pakistani', label: 'Pakistani', media: 'tv', params: { with_origin_country: 'PK' } },
  { id: 'cdrama', label: 'C-Drama', media: 'tv', params: { with_origin_country: 'CN', without_genres: '16' } },
  { id: 'jdrama', label: 'J-Drama', media: 'tv', params: { with_origin_country: 'JP', without_genres: '16' } },
  { id: 'thai', label: 'Thai', media: 'tv', params: { with_origin_country: 'TH' } },
];

export const BROWSE_SORTS = [
  { id: 'known', label: 'Best known', param: 'vote_count.desc' },
  { id: 'trending', label: 'Popular now', param: 'popularity.desc' },
  { id: 'rated', label: 'Highest rated', param: 'vote_average.desc' },
];

export async function browseTitles({ typeId, year, decade, genre, sort = 'known', page = 1 }) {
  const t = BROWSE_TYPES.find((x) => x.id === typeId) || BROWSE_TYPES[0];
  const isMovie = t.media === 'movie';
  const p = { ...t.params, page: String(page), include_adult: 'false', sort_by: (BROWSE_SORTS.find((s) => s.id === sort) || BROWSE_SORTS[0]).param };
  if (sort === 'rated') p['vote_count.gte'] = isMovie ? '500' : '150';
  if (genre) p.with_genres = [p.with_genres, genre].filter(Boolean).join(',');
  const from = year ? `${year}-01-01` : decade ? `${decade}-01-01` : null;
  const to = year ? `${year}-12-31` : decade ? `${Number(decade) + 9}-12-31` : null;
  if (from) p[isMovie ? 'primary_release_date.gte' : 'first_air_date.gte'] = from;
  if (to) p[isMovie ? 'primary_release_date.lte' : 'first_air_date.lte'] = to;
  const d = await tmdb(`discover/${t.media}`, p);
  return { items: (d.results || []).map((r) => normalizeTmdb(r, t.media)).filter((i) => i.poster), totalPages: d.total_pages || 1 };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** Shelves for "New". Each loads on its own. */
export function newShelves() {
  const today = isoDaysAgo(0);
  const recentTv = (params, days = 90) => () =>
    tmdb('discover/tv', { 'first_air_date.gte': isoDaysAgo(days), 'first_air_date.lte': today, sort_by: 'popularity.desc', ...params }).then((d) =>
      (d.results || []).map((r) => normalizeTmdb(r, 'tv')).filter((i) => i.poster)
    );
  const movies = (path) => () => tmdb(path, { region: process.env.NEXT_PUBLIC_REGION || 'NZ' }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'movie')).filter((i) => i.poster));
  return [
    { id: 'cinema', category: 'movies', title: 'In cinemas', load: movies('movie/now_playing') },
    { id: 'upcoming', category: 'movies', title: 'Coming soon', load: movies('movie/upcoming') },
    {
      id: 'trending',
      category: 'series',
      title: 'Series everyone is watching',
      load: () => tmdb('trending/tv/week').then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'tv')).filter((i) => i.poster && i.category === 'series')),
    },
    { id: 'anime', category: 'anime', title: 'New anime', load: () => tmdb('discover/tv', { with_genres: '16', with_origin_country: 'JP', 'air_date.gte': isoDaysAgo(10), 'air_date.lte': today, sort_by: 'popularity.desc' }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'tv')).filter((i) => i.poster)) },
    { id: 'kdrama', category: 'kdrama', title: 'New K-Dramas', load: recentTv({ with_origin_country: 'KR' }) },
    { id: 'turkish', category: 'turkish', title: 'New Turkish dramas', load: recentTv({ with_origin_country: 'TR' }) },
    { id: 'indian', category: 'indian', title: 'New Indian series', load: recentTv({ with_origin_country: 'IN' }) },
    { id: 'pakistani', category: 'pakistani', title: 'New Pakistani dramas', load: recentTv({ with_origin_country: 'PK' }, 180) },
    { id: 'cdrama', category: 'cdrama', title: 'New C-Dramas', load: recentTv({ with_origin_country: 'CN', without_genres: '16' }) },
    { id: 'jdrama', category: 'jdrama', title: 'New J-Dramas', load: recentTv({ with_origin_country: 'JP', without_genres: '16' }) },
  ];
}
