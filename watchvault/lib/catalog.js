// One place that talks to TMDB (via our proxy) and AniList, and turns
// both into the same "title" shape the rest of the app uses.

import { categorize } from './categories';

const IMG = 'https://image.tmdb.org/t/p/';
const ANILIST = 'https://graphql.anilist.co';
const REGION = process.env.NEXT_PUBLIC_REGION || 'NZ';

/* ---------------- TMDB ---------------- */

export async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ path, language: 'en-US', ...params }).toString();
  const res = await fetch(`/api/tmdb?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.status_message || `TMDB request failed (${res.status})`);
  return data;
}

function yearOf(date) {
  const y = parseInt(String(date || '').slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function normalizeTmdb(r, typeHint) {
  const mediaType = r.media_type || typeHint;
  const isMovie = mediaType === 'movie';
  const countries =
    r.origin_country?.length ? r.origin_country : (r.production_countries || []).map((c) => c.iso_3166_1);
  const genreIds = r.genre_ids || (r.genres || []).map((g) => g.id);
  const seasons = (r.seasons || [])
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)
    .map((s) => ({ number: s.season_number, episodes: s.episode_count || 0, name: s.name, airDate: s.air_date }));

  return {
    source: 'tmdb',
    sourceId: String(r.id),
    mediaType,
    title: isMovie ? r.title : r.name,
    originalTitle: isMovie ? r.original_title : r.original_name,
    poster: r.poster_path ? `${IMG}w342${r.poster_path}` : null,
    backdrop: r.backdrop_path ? `${IMG}w1280${r.backdrop_path}` : null,
    year: yearOf(isMovie ? r.release_date : r.first_air_date),
    date: isMovie ? r.release_date : r.first_air_date,
    countries: countries || [],
    language: r.original_language || null,
    overview: r.overview || '',
    genres: (r.genres || []).map((g) => g.name),
    category: categorize({ source: 'tmdb', mediaType, countries, language: r.original_language, genreIds }),
    runtime: isMovie ? r.runtime || null : (r.episode_run_time || [])[0] || null,
    totalEpisodes: isMovie ? null : r.number_of_episodes ?? null,
    totalSeasons: isMovie ? null : r.number_of_seasons ?? (seasons.length || null),
    seasons,
    airing: r.status || null,
    nextEpisode: r.next_episode_to_air
      ? { date: r.next_episode_to_air.air_date, season: r.next_episode_to_air.season_number, episode: r.next_episode_to_air.episode_number }
      : null,
    link: `https://www.themoviedb.org/${mediaType}/${r.id}`,
  };
}

/* ---------------- AniList ---------------- */

const MEDIA_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { large }
  bannerImage
  startDate { year month day }
  episodes duration format status countryOfOrigin genres
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
  if (!res.ok || json.errors) {
    const msg = json.errors?.[0]?.message || `AniList request failed (${res.status})`;
    if (res.status === 429) throw new Error('AniList is rate-limiting requests. Wait a minute and try again.');
    throw new Error(msg);
  }
  return json.data;
}

const FORMAT_LABEL = { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const ANI_STATUS = { FINISHED: 'Ended', RELEASING: 'Airing', NOT_YET_RELEASED: 'Upcoming', CANCELLED: 'Cancelled', HIATUS: 'On hiatus' };

function cleanDescription(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeAni(m) {
  const sd = m.startDate || {};
  const date = sd.year ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}` : null;
  return {
    source: 'anilist',
    sourceId: String(m.id),
    malId: m.idMal || null,
    mediaType: 'anime',
    title: m.title?.english || m.title?.romaji || m.title?.native || 'Untitled',
    originalTitle: m.title?.native || m.title?.romaji || null,
    altTitle: m.title?.english && m.title?.romaji !== m.title?.english ? m.title?.romaji : null,
    poster: m.coverImage?.large || null,
    backdrop: m.bannerImage || null,
    year: sd.year || null,
    date,
    countries: m.countryOfOrigin ? [m.countryOfOrigin] : [],
    language: null,
    overview: cleanDescription(m.description),
    genres: m.genres || [],
    category: 'anime',
    format: FORMAT_LABEL[m.format] || m.format || null,
    runtime: m.duration || null,
    totalEpisodes: m.episodes ?? null,
    totalSeasons: null,
    seasons: [],
    airing: ANI_STATUS[m.status] || m.status || null,
    nextEpisode: m.nextAiringEpisode
      ? { date: new Date(m.nextAiringEpisode.airingAt * 1000).toISOString().slice(0, 10), episode: m.nextAiringEpisode.episode }
      : null,
    link: `https://anilist.co/anime/${m.id}`,
  };
}

export async function searchAnime(q, perPage = 20) {
  const data = await anilist(
    `query ($q: String, $perPage: Int) {
      Page(perPage: $perPage) { media(search: $q, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} } }
    }`,
    { q, perPage }
  );
  return (data.Page?.media || []).map(normalizeAni);
}

export async function animeByMalIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await anilist(
      `query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { ${MEDIA_FIELDS} } } }`,
      { ids: chunk }
    );
    out.push(...(data.Page?.media || []).map(normalizeAni));
    if (i + 50 < ids.length) await sleep(800);
  }
  return out;
}

export async function anilistUserList(userName) {
  const data = await anilist(
    `query ($u: String) {
      MediaListCollection(userName: $u, type: ANIME) {
        lists { entries { status progress score(format: POINT_10_DECIMAL) notes media { ${MEDIA_FIELDS} } } }
      }
    }`,
    { u: userName }
  );
  const STATUS = { CURRENT: 'watching', REPEATING: 'watching', COMPLETED: 'completed', PLANNING: 'plan', PAUSED: 'on_hold', DROPPED: 'dropped' };
  const rows = [];
  for (const list of data.MediaListCollection?.lists || []) {
    for (const e of list.entries || []) {
      rows.push({
        item: normalizeAni(e.media),
        status: STATUS[e.status] || 'plan',
        episodes: e.progress || 0,
        rating: e.score || null,
        notes: e.notes || null,
      });
    }
  }
  return rows;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Unified ---------------- */

export async function searchAll(q) {
  const [tm, ani] = await Promise.allSettled([
    tmdb('search/multi', { query: q, include_adult: 'false' }),
    searchAnime(q),
  ]);
  const errors = [];
  let tmdbItems = [];
  let animeItems = [];

  if (tm.status === 'fulfilled') {
    tmdbItems = (tm.value.results || [])
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => normalizeTmdb(r));
  } else errors.push(tm.reason?.message || 'TMDB search failed');

  if (ani.status === 'fulfilled') animeItems = ani.value;
  else errors.push(ani.reason?.message || 'AniList search failed');

  // AniList is the better source for anime, so hide TMDB's anime duplicates when AniList answered.
  if (ani.status === 'fulfilled') tmdbItems = tmdbItems.filter((i) => i.category !== 'anime');

  return { items: [...tmdbItems, ...animeItems], errors };
}

export async function getTitle(source, mediaType, id) {
  if (source === 'anilist') {
    const data = await anilist(`query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`, { id: Number(id) });
    if (!data.Media) throw new Error('Title not found on AniList.');
    return normalizeAni(data.Media);
  }
  const r = await tmdb(`${mediaType}/${id}`);
  return normalizeTmdb(r, mediaType);
}

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Shelves for the "New" page. Each one loads on its own so one failure doesn't blank the page. */
export function releaseShelves() {
  const today = isoDaysAgo(0);
  const since = isoDaysAgo(90);
  const recentTv = (country, extra = {}) => () =>
    tmdb('discover/tv', {
      with_origin_country: country,
      'first_air_date.gte': since,
      'first_air_date.lte': today,
      sort_by: 'popularity.desc',
      include_null_first_air_dates: 'false',
      ...extra,
    }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'tv')));

  return [
    {
      id: 'anime',
      title: 'Airing anime right now',
      load: () =>
        anilist(
          `query { Page(perPage: 24) { media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) { ${MEDIA_FIELDS} } } }`
        ).then((d) => (d.Page?.media || []).map(normalizeAni)),
    },
    {
      id: 'cinema',
      title: 'In cinemas now',
      load: () => tmdb('movie/now_playing', { region: REGION }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'movie'))),
    },
    {
      id: 'upcoming',
      title: 'Coming soon',
      load: () => tmdb('movie/upcoming', { region: REGION }).then((d) => (d.results || []).map((r) => normalizeTmdb(r, 'movie'))),
    },
    {
      id: 'trending-tv',
      title: 'Trending series this week',
      load: () =>
        tmdb('trending/tv/week').then((d) =>
          (d.results || []).map((r) => normalizeTmdb(r, 'tv')).filter((i) => i.category !== 'anime')
        ),
    },
    { id: 'kdrama', title: 'New K-Dramas', load: recentTv('KR') },
    { id: 'turkish', title: 'New Turkish dramas', load: recentTv('TR') },
    { id: 'indian', title: 'New Indian series', load: recentTv('IN') },
    { id: 'pakistani', title: 'New Pakistani dramas', load: recentTv('PK', { 'first_air_date.gte': isoDaysAgo(180) }) },
    { id: 'cdrama', title: 'New C-Dramas', load: recentTv('CN') },
    { id: 'jdrama', title: 'New J-Dramas', load: recentTv('JP', { without_genres: '16' }) },
  ];
}
