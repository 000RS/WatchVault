// Shelves your list is split into, in display order.
export const CATEGORIES = [
  { id: 'anime', label: 'Anime' },
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'kdrama', label: 'K-Drama' },
  { id: 'turkish', label: 'Turkish' },
  { id: 'indian', label: 'Indian' },
  { id: 'pakistani', label: 'Pakistani' },
  { id: 'cdrama', label: 'C-Drama' },
  { id: 'jdrama', label: 'J-Drama' },
  { id: 'thai', label: 'Thai' },
  { id: 'other', label: 'Other' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const STATUSES = [
  { id: 'watching', label: 'Watching' },
  { id: 'completed', label: 'Completed' },
  { id: 'plan', label: 'Plan to watch' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'dropped', label: 'Dropped' },
];

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

const INDIAN_LANGS = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'or', 'as']);
const ANIMATION_GENRE = 16;

/**
 * Pick a shelf for a title from where it was made.
 * Anime always comes from AniList; TMDB titles are sorted by country.
 */
export function categorize({ source, mediaType, countries = [], language, genreIds = [] }) {
  if (source === 'anilist') return 'anime';

  const c = new Set((countries || []).map((x) => String(x).toUpperCase()));
  const animated = genreIds.includes(ANIMATION_GENRE);

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

export function progressLabel(e) {
  if (!e) return '';
  if (e.media_type === 'movie') {
    const pct = e.movie_progress_pct ?? (e.status === 'completed' ? 100 : 0);
    if (pct >= 100) return 'Finished';
    if (pct <= 0) return 'Not started';
    const mins = e.movie_minutes_watched;
    const words = pct === 50 ? 'Half watched' : pct === 25 ? 'A quarter in' : pct === 75 ? 'Three-quarters in' : `${pct}% watched`;
    return mins && e.runtime ? `${words} · ${mins} of ${e.runtime} min` : words;
  }
  if (e.media_type === 'tv' && e.current_season) {
    const base = `S${e.current_season} · E${e.current_episode ?? 0}`;
    return e.total_episodes ? `${base} · ${e.episodes_watched ?? 0}/${e.total_episodes} eps` : base;
  }
  const watched = e.episodes_watched ?? 0;
  if (!watched && e.status === 'plan') return 'Not started';
  return `Ep ${watched}${e.total_episodes ? ` / ${e.total_episodes}` : ''}`;
}

/** Episodes watched across all seasons, given season counts and the current spot. */
export function episodesUpTo(seasonCounts, season, episode) {
  if (!season) return episode || 0;
  let total = 0;
  for (let i = 0; i < season - 1; i++) total += seasonCounts?.[i] || 0;
  return total + (episode || 0);
}
