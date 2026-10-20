// Talks to TMDB (through our own /api/tmdb route) and AniList, and turns both
// into one "title" shape the rest of the app uses. The normalize functions are
// pure, so the server routes reuse them.

import { categorize, genreIdsFor, genreNames } from './categories';

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

/**
 * Titles like this one. TMDB's recommendations, plus, for anything not in English,
 * well-loved titles in the same language and genres (a Hindi film brings more Hindi films).
 */
export async function similarTitles(mediaType, id, { language, genres = [], page = 1 } = {}) {
  const empty = { results: [] };
  const genreIds = genreIdsFor(genres, mediaType).filter((g) => g !== 18).slice(0, 2);
  const foreign = language && language !== 'en';
  const [rec, same] = await Promise.all([
    tmdb(`${mediaType}/${id}/recommendations`, { page: String(page) }).catch(() => empty),
    foreign
      ? tmdb(`discover/${mediaType}`, { with_original_language: language, sort_by: 'vote_count.desc', page: String(page), ...(genreIds.length ? { with_genres: genreIds.join('|') } : {}) }).catch(() => empty)
      : Promise.resolve(empty),
  ]);
  let recs = (rec.results || []).map((r) => normalizeTmdb(r, mediaType));
  if (recs.length < 8) {
    const s = await tmdb(`${mediaType}/${id}/similar`).catch(() => empty);
    recs = recs.concat((s.results || []).map((r) => normalizeTmdb(r, mediaType)));
  }
  let items = recs;
  if (foreign) {
    const sameLang = (same.results || []).map((r) => normalizeTmdb(r, mediaType));
    const recSame = recs.filter((r) => r.language === language);
    const recOther = recs.filter((r) => r.language !== language);
    // Same language first, mixing recommendation and discovery, then everything else.
    items = [];
    for (let i = 0; i < Math.max(recSame.length, sameLang.length); i++) {
      if (recSame[i]) items.push(recSame[i]);
      if (sameLang[i]) items.push(sameLang[i]);
    }
    items = items.concat(recOther);
  }
  const seen = new Set([String(id)]);
  return items.filter((i) => i.poster && !seen.has(i.sourceId) && seen.add(i.sourceId));
}

/** Best-known titles in one language, e.g. Hindi films for someone who watches a lot of them. */
export async function bestInLanguage(mediaType, language, page = 1) {
  const d = await tmdb(`discover/${mediaType}`, { with_original_language: language, sort_by: 'vote_count.desc', page: String(page) });
  return (d.results || []).map((r) => normalizeTmdb(r, mediaType)).filter((i) => i.poster);
}

/**
 * Search box results: TMDB first (spelling-tolerant, with people), plus AniList for anime TMDB doesn't have.
 * Returns { items, people, didYouMean }.
 */
export async function searchEverything(q, { type = 'all', year } = {}) {
  const qs = new URLSearchParams({ q, type, ...(year ? { year: String(year) } : {}) });
  const wantAnime = type === 'all' || type === 'anime';
  const [main, ani] = await Promise.all([
    fetch(`/api/search?${qs}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Search is unavailable right now.');
      return d;
    }),
    wantAnime ? searchAnime(q, 8).catch(() => []) : Promise.resolve([]),
  ]);
  let items = main.items || [];
  const known = new Set(items.flatMap((i) => [simple(i.title), simple(i.originalTitle)]));
  const extra = ani.filter((a) => !a.names.some((n) => known.has(simple(n))) && (!year || a.year === Number(year)));
  items = items.concat(extra.slice(0, type === 'anime' ? 8 : 3));
  return { items, people: type === 'all' ? main.people || [] : [], didYouMean: main.didYouMean || null };
}

export async function searchCatalog(q, opts = {}) {
  return (await searchEverything(q, opts)).items;
}

const simple = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------------- Browse ("tick off what you've seen") ---------------- */

const NOT_TV_SHOWS = '16,10767,10763,10764'; // animation, talk, news, reality

export const BROWSE_TYPES = [
  { id: 'movies', label: 'Movies', media: 'movie', params: { without_genres: '16' }, category: 'movies' },
  { id: 'series', label: 'Series', media: 'tv', params: { without_genres: NOT_TV_SHOWS }, category: 'series' },
  { id: 'anime', label: 'Anime', media: 'tv', params: { with_genres: '16', with_origin_country: 'JP' }, category: 'anime' },
  { id: 'anime_movies', label: 'Anime films', media: 'movie', params: { with_genres: '16', with_origin_country: 'JP' }, category: 'anime' },
  { id: 'animation_series', label: 'Animated series', media: 'tv', params: { with_genres: '16' }, category: 'animation', notAnime: true },
  { id: 'animation_movies', label: 'Animated films', media: 'movie', params: { with_genres: '16' }, category: 'animation', notAnime: true },
  { id: 'kdrama', label: 'K-Drama', media: 'tv', params: { with_origin_country: 'KR', without_genres: NOT_TV_SHOWS }, category: 'kdrama' },
  { id: 'turkish', label: 'Turkish', media: 'tv', params: { with_origin_country: 'TR', without_genres: NOT_TV_SHOWS }, category: 'turkish' },
  { id: 'indian', label: 'Indian series', media: 'tv', params: { with_origin_country: 'IN', without_genres: '10767,10763,10764' }, category: 'indian' },
  { id: 'indian_movies', label: 'Indian films', media: 'movie', params: { with_origin_country: 'IN' }, category: 'movies' },
  { id: 'pakistani', label: 'Pakistani', media: 'tv', params: { with_origin_country: 'PK', without_genres: '10767,10763,10764' }, category: 'pakistani' },
  { id: 'cdrama', label: 'C-Drama', media: 'tv', params: { with_origin_country: 'CN', without_genres: NOT_TV_SHOWS }, category: 'cdrama' },
  { id: 'jdrama', label: 'J-Drama', media: 'tv', params: { with_origin_country: 'JP', without_genres: NOT_TV_SHOWS }, category: 'jdrama' },
  { id: 'thai', label: 'Thai', media: 'tv', params: { with_origin_country: 'TH', without_genres: NOT_TV_SHOWS }, category: 'thai' },
];

export const BROWSE_SORTS = [
  { id: 'taste', label: 'Matched to your taste', param: 'vote_count.desc' },
  { id: 'known', label: 'Best known', param: 'vote_count.desc' },
  { id: 'trending', label: 'Popular now', param: 'popularity.desc' },
  { id: 'rated', label: 'Highest rated', param: 'vote_average.desc' },
  { id: 'gems', label: 'Hidden gems', param: 'vote_average.desc' },
  { id: 'newest', label: 'Newest', param: 'primary_release_date.desc' },
];

export const LANGUAGES = [
  ['en', 'English'], ['hi', 'Hindi'], ['ur', 'Urdu'], ['ta', 'Tamil'], ['te', 'Telugu'], ['ml', 'Malayalam'], ['kn', 'Kannada'], ['bn', 'Bengali'],
  ['pa', 'Punjabi'], ['mr', 'Marathi'], ['ko', 'Korean'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['th', 'Thai'], ['tr', 'Turkish'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['fa', 'Persian'], ['ru', 'Russian'], ['id', 'Indonesian'],
  ['tl', 'Filipino'], ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'], ['pl', 'Polish'], ['nl', 'Dutch'],
];

/**
 * Discover titles with any mix of filters.
 * f = { typeId, year, decade, genre, sort, page, language, minRating, provider, tasteGenres }
 */
export async function browseTitles(f) {
  const { typeId, year, decade, genre, sort = 'known', page = 1, language, minRating, provider, tasteGenres = [] } = f;
  const t = BROWSE_TYPES.find((x) => x.id === typeId) || BROWSE_TYPES[0];
  const isMovie = t.media === 'movie';
  const sortDef = BROWSE_SORTS.find((s) => s.id === sort) || BROWSE_SORTS[1];
  const p = { ...t.params, page: String(page), include_adult: 'false', sort_by: sortDef.param };
  if (sort === 'newest') {
    p.sort_by = isMovie ? 'primary_release_date.desc' : 'first_air_date.desc';
    p['vote_count.gte'] = '20';
    p[isMovie ? 'primary_release_date.lte' : 'first_air_date.lte'] = new Date().toISOString().slice(0, 10);
  }
  if (sort === 'rated') p['vote_count.gte'] = isMovie ? '500' : '150';
  if (sort === 'gems') {
    p['vote_count.gte'] = isMovie ? '80' : '40';
    p['vote_count.lte'] = isMovie ? '1500' : '600';
  }
  if (genre) p.with_genres = [p.with_genres, genre].filter(Boolean).join(',');
  else if (sort === 'taste' && tasteGenres.length) p.with_genres = [p.with_genres, tasteGenres.join('|')].filter(Boolean).join(',');
  if (language) p.with_original_language = language;
  if (minRating) {
    p['vote_average.gte'] = String(minRating);
    p['vote_count.gte'] ||= isMovie ? '100' : '40';
  }
  if (provider) {
    p.with_watch_providers = String(provider);
    p.watch_region = REGION;
    p.with_watch_monetization_types = 'flatrate|free|ads';
  }
  const from = year ? `${year}-01-01` : decade ? `${decade}-01-01` : null;
  const to = year ? `${year}-12-31` : decade ? `${Number(decade) + 9}-12-31` : null;
  if (from) p[isMovie ? 'primary_release_date.gte' : 'first_air_date.gte'] = from;
  if (to) p[isMovie ? 'primary_release_date.lte' : 'first_air_date.lte'] = to;
  const d = await tmdb(`discover/${t.media}`, p);
  let items = (d.results || []).map((r) => normalizeTmdb(r, t.media)).filter((i) => i.poster);
  if (t.notAnime) items = items.filter((i) => i.category !== 'anime');
  return { items, totalPages: Math.min(d.total_pages || 1, 500) };
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

/* ---------------- Full details, people, studios, collections ---------------- */

export const REGION = process.env.NEXT_PUBLIC_REGION || 'NZ';

const crewJobs = (crew = [], jobs) => {
  const seen = new Set();
  return crew.filter((c) => jobs.includes(c.job) && !seen.has(c.id) && seen.add(c.id)).map((c) => ({ id: c.id, name: c.name, job: c.job }));
};

/** Title plus cast, key crew, studios, franchise and where to watch, in one request. */
export async function getTitleFull(source, mediaType, id) {
  if (source !== 'tmdb') return { title: await getTitle(source, mediaType, id), cast: [], crew: [], companies: [], providers: null, collection: null };
  const r = await tmdb(`${mediaType}/${id}`, { append_to_response: 'credits,watch/providers' });
  const title = normalizeTmdb(r, mediaType);
  const credits = r.credits || {};
  const crew = [
    ...(r.created_by || []).map((c) => ({ id: c.id, name: c.name, job: 'Creator' })),
    ...crewJobs(credits.crew, ['Director']),
    ...crewJobs(credits.crew, ['Screenplay', 'Writer', 'Novel', 'Story']).slice(0, 3),
  ].slice(0, 6);
  const wp = r['watch/providers']?.results?.[REGION] || null;
  return {
    title,
    cast: (credits.cast || []).slice(0, 12).map((c) => ({ id: c.id, name: c.name, character: c.character, photo: img(c.profile_path, 'w185') })),
    crew,
    companies: (r.production_companies || []).slice(0, 4).map((c) => ({ id: c.id, name: c.name })),
    networks: (r.networks || []).slice(0, 3).map((c) => ({ id: c.id, name: c.name })),
    collection: r.belongs_to_collection ? { id: r.belongs_to_collection.id, name: r.belongs_to_collection.name } : null,
    providers: wp
      ? {
          link: wp.link,
          stream: (wp.flatrate || []).concat(wp.free || [], wp.ads || []).map(prov),
          rent: (wp.rent || []).map(prov),
          buy: (wp.buy || []).map(prov),
        }
      : null,
  };
}
const prov = (p) => ({ id: p.provider_id, name: p.provider_name, logo: img(p.logo_path, 'w92') });

/** Streaming services available in your region, most popular first. */
export async function streamingServices(mediaType = 'movie') {
  const d = await tmdb(`watch/providers/${mediaType}`, { watch_region: REGION });
  return (d.results || [])
    .sort((a, b) => (a.display_priorities?.[REGION] ?? a.display_priority ?? 999) - (b.display_priorities?.[REGION] ?? b.display_priority ?? 999))
    .slice(0, 30)
    .map(prov);
}

export async function searchPeople(q) {
  const d = await tmdb('search/person', { query: q, include_adult: 'false' });
  return (d.results || []).map(normalizePerson);
}

export function normalizePerson(p) {
  return {
    id: p.id,
    name: p.name,
    photo: img(p.profile_path, 'w185'),
    dept: p.known_for_department || null,
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 3),
    popularity: p.popularity || 0,
  };
}

/** A person and everything they've made, split by role. */
export async function personFull(id) {
  const [p, c] = await Promise.all([tmdb(`person/${id}`), tmdb(`person/${id}/combined_credits`)]);
  const toItem = (r) => normalizeTmdb(r, r.media_type);
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((i) => i.poster && !seen.has(`${i.mediaType}${i.sourceId}`) && seen.add(`${i.mediaType}${i.sourceId}`));
  };
  const byVotes = (a, b) => (b.voteCount || 0) - (a.voteCount || 0);
  // Talk shows and award ceremonies clutter acting credits
  const real = (r) => !(r.genre_ids || []).some((g) => g === 10767 || g === 10763 || g === 10764);
  const acting = dedupe((c.cast || []).filter(real).map(toItem)).sort(byVotes);
  const crewBy = (jobs) => dedupe((c.crew || []).filter((r) => jobs.includes(r.job)).map(toItem)).sort(byVotes);
  return {
    person: { id: p.id, name: p.name, photo: img(p.profile_path, 'h632'), bio: p.biography || '', dept: p.known_for_department, born: p.birthday, place: p.place_of_birth },
    roles: [
      { id: 'acting', label: 'Acting', items: acting },
      { id: 'directing', label: 'Directing', items: crewBy(['Director']) },
      { id: 'writing', label: 'Writing', items: crewBy(['Screenplay', 'Writer', 'Story', 'Novel', 'Creator', 'Characters']) },
      { id: 'producing', label: 'Producing', items: crewBy(['Producer', 'Executive Producer']) },
    ].filter((r) => r.items.length),
  };
}

/** Studio or production company by name (Marvel Studios, Yash Raj Films…). Cached on the device. */
export async function findCompany(name) {
  const key = `wv:company:${name.toLowerCase()}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit) return hit;
  } catch {
    /* no cache */
  }
  const d = await tmdb('search/company', { query: name });
  const n = name.toLowerCase();
  const list = d.results || [];
  const best = list.find((c) => c.name.toLowerCase() === n) || list.find((c) => c.logo_path && c.name.toLowerCase().startsWith(n)) || list[0];
  const out = best ? { id: best.id, name: best.name, logo: img(best.logo_path, 'w185') } : null;
  try {
    if (out) localStorage.setItem(key, JSON.stringify(out));
  } catch {
    /* fine */
  }
  return out;
}

export async function companyTitles(id, mediaType, page = 1) {
  const d = await tmdb(`discover/${mediaType}`, { with_companies: String(id), sort_by: 'vote_count.desc', page: String(page), include_adult: 'false' });
  return { items: (d.results || []).map((r) => normalizeTmdb(r, mediaType)).filter((i) => i.poster), totalPages: d.total_pages || 1 };
}

export async function companyInfo(id) {
  const c = await tmdb(`company/${id}`);
  return { id: c.id, name: c.name, logo: img(c.logo_path, 'w300'), country: c.origin_country, about: c.description || '' };
}

/** A film franchise in release order (Star Wars, Harry Potter…). */
export async function collectionFull(id) {
  const c = await tmdb(`collection/${id}`);
  const parts = (c.parts || []).map((r) => normalizeTmdb(r, 'movie')).filter((i) => i.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { id: c.id, name: c.name, overview: c.overview, backdrop: img(c.backdrop_path, 'w1280'), parts };
}
