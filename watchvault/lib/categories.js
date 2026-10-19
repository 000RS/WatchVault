// Shelves, statuses, genres and the small helpers that describe progress.

export const CATEGORIES = [
  { id: 'movies', label: 'Movies', short: 'Movie' },
  { id: 'series', label: 'Series', short: 'Series' },
  { id: 'anime', label: 'Anime', short: 'Anime' },
  { id: 'kdrama', label: 'K-Drama', short: 'K-Drama' },
  { id: 'turkish', label: 'Turkish drama', short: 'Turkish' },
  { id: 'indian', label: 'Indian', short: 'Indian' },
  { id: 'pakistani', label: 'Pakistani drama', short: 'Pakistani' },
  { id: 'cdrama', label: 'C-Drama', short: 'C-Drama' },
  { id: 'jdrama', label: 'J-Drama', short: 'J-Drama' },
  { id: 'thai', label: 'Thai drama', short: 'Thai' },
  { id: 'other', label: 'Other', short: 'Other' },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
export const CATEGORY_SHORT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short]));

export const STATUSES = [
  { id: 'completed', label: 'Completed' },
  { id: 'watching', label: 'Watching' },
  { id: 'plan', label: 'Plan to watch' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'dropped', label: 'Dropped' },
];
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
  if (!w) return e.status === 'plan' ? 'Not started' : 'No episodes logged';
  return e.total_episodes ? `${w} of ${e.total_episodes} episodes` : `${w} episodes`;
}

export function completionPct(e) {
  if (e.status === 'completed') return 100;
  if (e.media_type === 'movie') return e.movie_progress_pct ?? 0;
  if (!e.total_episodes) return null;
  return Math.min(100, Math.round(((e.episodes_watched || 0) / e.total_episodes) * 100));
}

export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];
