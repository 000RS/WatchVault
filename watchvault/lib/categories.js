// Shelves, statuses, genres and the small helpers that describe progress.

export const CATEGORIES = [
  { id: 'movies', label: 'Movies', short: 'Movie' },
  { id: 'series', label: 'Series', short: 'Series' },
  { id: 'anime', label: 'Anime', short: 'Anime' },
  { id: 'animation', label: 'Animation', short: 'Animation' },
  { id: 'kdrama', label: 'K-Drama', short: 'K-Drama' },
  { id: 'turkish', label: 'Turkish drama', short: 'Turkish' },
  { id: 'indian', label: 'Indian', short: 'Indian' },
  { id: 'pakistani', label: 'Pakistani drama', short: 'Pakistani' },
  { id: 'cdrama', label: 'C-Drama', short: 'C-Drama' },
  { id: 'jdrama', label: 'J-Drama', short: 'J-Drama' },
  { id: 'thai', label: 'Thai drama', short: 'Thai' },
  { id: 'books', label: 'Books', short: 'Book', kind: 'book' },
  { id: 'manga', label: 'Manga & comics', short: 'Manga', kind: 'manga' },
  { id: 'games', label: 'Games', short: 'Game', kind: 'game' },
  { id: 'music', label: 'Music', short: 'Music', kind: 'music' },
  { id: 'podcasts', label: 'Podcasts', short: 'Podcast', kind: 'podcast' },
  { id: 'food', label: 'Food & drink', short: 'Food', kind: 'place' },
  { id: 'places', label: 'Places', short: 'Place', kind: 'place' },
  { id: 'events', label: 'Events & experiences', short: 'Event', kind: 'event' },
  { id: 'travel', label: 'Travel', short: 'Trip', kind: 'travel' },
  { id: 'other', label: 'Other', short: 'Other', kind: 'custom' },
];

/* ---------------- Kinds: what sort of thing an entry is ---------------- */

export const SCREEN_TYPES = new Set(['movie', 'tv', 'anime']);
/** Movies, series and anime: the things most of the app was built around. */
export const isScreen = (e) => SCREEN_TYPES.has(e?.media_type || e?.mediaType);
export const SCREEN_SHELVES = new Set(CATEGORIES.filter((c) => !c.kind).map((c) => c.id));

/** Words for each kind, so a book is "read" and a café is "visited". */
export const KINDS = {
  screen: { noun: 'title', unit: 'episodes', verbs: { completed: 'Completed', watching: 'Watching', plan: 'Plan to watch', on_hold: 'On hold', stopped: 'Stopped', tried: 'Tried', dropped: 'Dropped', clips: 'Seen clips' } },
  book: { noun: 'book', unit: 'pages', icon: '📖', verbs: { completed: 'Read', watching: 'Reading', plan: 'Want to read', on_hold: 'Paused', stopped: 'Stopped', dropped: "Didn't finish" } },
  manga: { noun: 'series', unit: 'chapters', icon: '📚', verbs: { completed: 'Read', watching: 'Reading', plan: 'Want to read', on_hold: 'Paused', stopped: 'Caught up / stopped', tried: 'Tried', dropped: 'Dropped' } },
  game: { noun: 'game', unit: 'hours', icon: '🎮', verbs: { completed: 'Finished', watching: 'Playing', plan: 'Want to play', on_hold: 'Paused', stopped: 'Stopped', tried: 'Tried', dropped: 'Dropped' } },
  music: { noun: 'album or song', unit: null, icon: '🎵', verbs: { completed: 'Listened', watching: 'On repeat', plan: 'Want to listen', dropped: 'Not for me' } },
  podcast: { noun: 'podcast', unit: 'episodes', icon: '🎙️', verbs: { completed: 'Finished', watching: 'Listening', plan: 'Want to listen', on_hold: 'Paused', tried: 'Tried', dropped: 'Dropped' } },
  place: { noun: 'place', unit: 'visits', icon: '📍', verbs: { completed: 'Been there', watching: 'Regular spot', plan: 'Want to go', dropped: 'Not for me' } },
  event: { noun: 'event', unit: null, icon: '🎟️', verbs: { completed: 'Went', watching: 'Going', plan: 'Interested', dropped: 'Missed it' } },
  travel: { noun: 'destination', unit: null, icon: '🧭', verbs: { completed: 'Been there', watching: 'Planning', plan: 'Dream trip', dropped: 'Not for me' } },
  custom: { noun: 'thing', unit: null, icon: '✦', verbs: { completed: 'Done', watching: 'In progress', plan: 'Want to', on_hold: 'Paused', dropped: 'Abandoned' } },
};
const KIND_OF_TYPE = { movie: 'screen', tv: 'screen', anime: 'screen', book: 'book', manga: 'manga', game: 'game', music: 'music', podcast: 'podcast', place: 'place', event: 'event', travel: 'travel', custom: 'custom' };
export const kindOf = (e) => KIND_OF_TYPE[e?.media_type || e?.mediaType] || 'screen';
export const kindInfo = (e) => KINDS[kindOf(e)];
/** The status label in the words of that kind ("Read", "Been there"). */
export const statusLabel = (e, status = e?.status) => kindInfo(e).verbs[status] || KINDS.screen.verbs[status] || status;
/** The statuses that make sense for this kind, in the usual order. */
export const statusesFor = (e) => {
  const v = kindInfo(e).verbs;
  return Object.keys(v).map((id) => ({ id, label: v[id], hint: kindOf(e) === 'screen' ? STATUS_HINTS[id] : null }));
};
const STATUS_HINTS = {
  completed: 'Watched to the end', watching: 'Watching it now', plan: 'On your watchlist', on_hold: 'Paused, you mean to come back',
  stopped: 'Watched a good part, then stopped', tried: 'Watched a few episodes to see', dropped: "Gave it a chance, didn't like it", clips: 'Know it from reels, TikTok or YouTube',
};
/** "4 movies, 2 K-Dramas": shelf names as they read mid-sentence. */
const COUNT_WORDS = {
  movies: ['movie', 'movies'], series: ['series', 'series'], anime: ['anime', 'anime'], animation: ['animated title', 'animated titles'], other: ['other title', 'other titles'],
  kdrama: ['K-Drama', 'K-Dramas'], turkish: ['Turkish drama', 'Turkish dramas'], indian: ['Indian title', 'Indian titles'],
  pakistani: ['Pakistani drama', 'Pakistani dramas'], cdrama: ['C-Drama', 'C-Dramas'], jdrama: ['J-Drama', 'J-Dramas'], thai: ['Thai drama', 'Thai dramas'],
  books: ['book', 'books'], manga: ['manga', 'manga'], games: ['game', 'games'], music: ['album', 'albums'], podcasts: ['podcast', 'podcasts'],
  food: ['food spot', 'food spots'], places: ['place', 'places'], events: ['event', 'events'], travel: ['destination', 'destinations'],
};
export function countLabel(c) {
  const w = COUNT_WORDS[c.id] || [c.label, c.label];
  return `${c.count} ${c.count === 1 ? w[0] : w[1]}`;
}

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
export const CATEGORY_SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short]));

export const STATUSES = [
  { id: 'completed', label: 'Completed', hint: 'Watched to the end' },
  { id: 'watching', label: 'Watching', hint: 'Watching it now' },
  { id: 'plan', label: 'Plan to watch', hint: 'On your watchlist' },
  { id: 'on_hold', label: 'On hold', hint: 'Paused, you mean to come back' },
  { id: 'stopped', label: 'Stopped', hint: 'Watched a good part, then stopped' },
  { id: 'tried', label: 'Tried', hint: 'Watched a few episodes to see' },
  { id: 'dropped', label: 'Dropped', hint: "Gave it a chance, didn't like it" },
  { id: 'clips', label: 'Seen clips', hint: 'Know it from reels, TikTok or YouTube' },
];
/** Statuses that mean you actually started watching. */
export const STARTED = new Set(['completed', 'watching', 'on_hold', 'stopped', 'tried', 'dropped']);
/** Statuses that are an ending other than finishing. */
export const UNFINISHED = new Set(['on_hold', 'stopped', 'tried', 'dropped']);
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

// TMDB genre ids are fixed, so a static map saves a request.
export const MOVIE_GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
export const TV_GENRES = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};
/** Genre names back to TMDB ids for the given media type (TV and movie lists differ). */
export function genreIdsFor(names = [], mediaType) {
  const map = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const alias = { 'Science Fiction': 'Sci-Fi & Fantasy', 'Sci-Fi & Fantasy': 'Science Fiction', Action: 'Action & Adventure', 'Action & Adventure': 'Action', Adventure: 'Action & Adventure', Fantasy: 'Sci-Fi & Fantasy', War: 'War & Politics', 'War & Politics': 'War' };
  const ids = [];
  for (const n of names || []) {
    const hit = Object.entries(map).find(([, v]) => v === n || v === alias[n]);
    if (hit && !ids.includes(Number(hit[0]))) ids.push(Number(hit[0]));
  }
  return ids;
}

export function languageName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  } catch {
    return code;
  }
}

export function genreNames(ids = [], mediaType) {
  const map = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return ids.map((id) => map[id] || MOVIE_GENRES[id] || TV_GENRES[id]).filter(Boolean);
}

const INDIAN_LANGS = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'or', 'as']);
const ANIMATION = 16;

/** Pick a shelf for a title from where it was made. */
export function categorize({ source, mediaType, countries = [], language, genreIds = [] }) {
  if (source === 'anilist') return 'anime';
  const c = new Set((countries || []).map((x) => String(x).toUpperCase()));
  const animated = genreIds.includes(ANIMATION);
  if (animated && (c.has('JP') || language === 'ja')) return 'anime';
  if (animated) return 'animation';
  if (mediaType === 'movie') return 'movies';
  if (c.has('KR') || language === 'ko') return 'kdrama';
  if (c.has('TR') || language === 'tr') return 'turkish';
  if (c.has('PK') || language === 'ur') return 'pakistani';
  if (c.has('IN') || INDIAN_LANGS.has(language)) return 'indian';
  if (c.has('CN') || c.has('TW') || c.has('HK') || language === 'zh' || language === 'cn') return 'cdrama';
  if (c.has('JP') || language === 'ja') return 'jdrama';
  if (c.has('TH') || language === 'th') return 'thai';
  return 'series';
}

/** Episodes watched across all seasons, given season counts and the current spot. */
export function episodesUpTo(seasonCounts, season, episode) {
  if (!season) return episode || 0;
  let total = 0;
  for (let i = 0; i < season - 1; i++) total += seasonCounts?.[i] || 0;
  return total + (episode || 0);
}

/** Turn "750 episodes watched" into season 21, episode 4 using the season sizes. */
export function spotFromEpisodes(seasonCounts, episodes) {
  if (!seasonCounts?.length || !episodes) return { season: episodes ? 1 : null, episode: episodes || 0 };
  let left = episodes;
  for (let i = 0; i < seasonCounts.length; i++) {
    const n = seasonCounts[i] || 0;
    if (left <= n || i === seasonCounts.length - 1) return { season: i + 1, episode: Math.min(left, n || left) };
    left -= n;
  }
  return { season: 1, episode: episodes };
}

/** Seasons fully finished, for "3 of 10 seasons". */
export function seasonsFinished(e) {
  const counts = e.season_episode_counts;
  if (!counts?.length) return null;
  if (e.status === 'completed') return counts.length;
  if (!e.current_season) return 0;
  const done = (e.current_episode || 0) >= (counts[e.current_season - 1] || Infinity);
  return done ? e.current_season : e.current_season - 1;
}

export function progressLabel(e) {
  if (!e) return '';
  if (!isScreen(e)) {
    const k = kindInfo(e);
    const n = e.episodes_watched || 0;
    if (k.unit && n && e.status !== 'completed') return e.total_episodes ? `${n} of ${e.total_episodes} ${k.unit}` : `${n} ${k.unit}`;
    if (e.media_type === 'place' && n > 1) return `${n} visits`;
    return statusLabel(e);
  }
  if (e.status === 'clips') return 'Seen clips';
  if (e.status === 'plan') return 'Not started';
  if (e.media_type === 'movie') {
    const pct = e.status === 'completed' ? 100 : e.movie_progress_pct ?? 0;
    if (pct >= 100) return 'Finished';
    if (pct <= 0) return e.status === 'plan' ? 'Not started' : 'Started';
    if (pct === 50) return 'Halfway';
    return `${pct}% watched`;
  }
  if (e.status === 'completed') {
    if (e.total_seasons > 1) return `All ${e.total_seasons} seasons`;
    return e.total_episodes ? `All ${e.total_episodes} episodes` : 'Finished';
  }
  if (e.current_season && e.season_episode_counts?.length > 1) {
    return `Season ${e.current_season}, episode ${e.current_episode || 0}`;
  }
  const w = e.episodes_watched ?? 0;
  if (!w) return 'No episodes logged';
  if ((e.status === 'stopped' || e.status === 'on_hold') && e.current_season && (e.current_episode || 0) >= (e.season_episode_counts?.[e.current_season - 1] || Infinity))
    return `Stopped after season ${e.current_season}`;
  return e.total_episodes ? `${w} of ${e.total_episodes} episodes` : `${w} episodes`;
}

export function completionPct(e) {
  if (e.status === 'completed') return 100;
  if (e.status === 'clips' || e.status === 'plan') return null;
  if (!isScreen(e) && !['book', 'manga', 'podcast'].includes(e.media_type)) return null;
  if (e.media_type === 'movie') return e.movie_progress_pct ?? 0;
  if (!e.total_episodes) return null;
  return Math.min(100, Math.round(((e.episodes_watched || 0) / e.total_episodes) * 100));
}

export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];

/**
 * A better status for a title you marked dropped, from how far you got:
 * a few episodes is a try-out, a full season or more is a stop, anything between stays dropped.
 */
export function suggestStatus(e) {
  if (!isScreen(e)) return null;
  if (e.status !== 'dropped' && e.status !== 'on_hold') return null;
  if (e.media_type === 'movie') return null;
  const eps = e.episodes_watched || 0;
  if (eps <= 4) return e.status === 'dropped' ? 'tried' : null;
  const done = seasonsFinished(e) || 0;
  if (done >= 1 && e.status === 'dropped') return 'stopped';
  if (!e.season_episode_counts?.length && eps >= 12 && e.status === 'dropped') return 'stopped';
  return null;
}
