// Numbers and the "viewer personality" for the Stats page.

import { CATEGORIES, CATEGORY_LABEL } from './categories';

const DRAMA_SHELVES = ['kdrama', 'turkish', 'indian', 'pakistani', 'cdrama', 'jdrama', 'thai'];
const DEFAULT_EP_MIN = { anime: 24, tv: 45 };

/** Anything you've actually started counts as "watched" (plan-to-watch does not). */
export function isWatched(e) {
  if (e.status === 'plan') return false;
  if (e.status === 'completed') return true;
  if (e.media_type === 'movie') return (e.movie_progress_pct || 0) > 0 || e.status !== 'plan';
  return (e.episodes_watched || 0) > 0 || e.status !== 'plan';
}

export function minutesWatched(e) {
  if (e.media_type === 'movie') {
    const pct = e.status === 'completed' ? 100 : e.movie_progress_pct || 0;
    if (e.movie_minutes_watched) return e.movie_minutes_watched;
    return ((e.runtime || 120) * pct) / 100;
  }
  return (e.episodes_watched || 0) * (e.runtime || DEFAULT_EP_MIN[e.media_type] || 40);
}

export function computeStats(entries) {
  const watched = entries.filter(isWatched);
  const byCategory = CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    count: watched.filter((e) => e.category === c.id).length,
  })).filter((c) => c.count > 0);

  const byStatus = ['completed', 'watching', 'on_hold', 'dropped', 'plan'].map((id) => ({
    id,
    count: entries.filter((e) => e.status === id).length,
  }));

  const minutes = watched.reduce((sum, e) => sum + minutesWatched(e), 0);
  const episodes = watched.reduce((sum, e) => sum + (e.media_type === 'movie' ? 0 : e.episodes_watched || 0), 0);
  const moviesFinished = entries.filter((e) => e.media_type === 'movie' && e.status === 'completed').length;

  const countryCounts = {};
  for (const e of watched) if (e.origin_country) countryCounts[e.origin_country] = (countryCounts[e.origin_country] || 0) + 1;
  const countries = Object.entries(countryCounts)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  const decadeCounts = {};
  for (const e of watched) if (e.year) {
    const d = Math.floor(e.year / 10) * 10;
    decadeCounts[d] = (decadeCounts[d] || 0) + 1;
  }
  const decades = Object.entries(decadeCounts)
    .map(([d, count]) => ({ label: `${d}s`, count, d: Number(d) }))
    .sort((a, b) => a.d - b.d);

  const rated = entries.filter((e) => e.rating != null);
  const avgRating = rated.length ? rated.reduce((s, e) => s + Number(e.rating), 0) / rated.length : null;
  const topRated = [...rated].sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title)).slice(0, 5);

  const status = Object.fromEntries(byStatus.map((s) => [s.id, s.count]));

  return {
    total: entries.length,
    watchedCount: watched.length,
    byCategory,
    byStatus,
    status,
    minutes,
    hours: minutes / 60,
    episodes,
    moviesFinished,
    countries,
    decades,
    avgRating,
    ratedCount: rated.length,
    topRated,
    personality: personality({ watched, status, byCategory, countries, avgRating, ratedCount: rated.length, hours: minutes / 60 }),
  };
}

function share(byCategory, ids, total) {
  if (!total) return 0;
  return byCategory.filter((c) => ids.includes(c.id)).reduce((s, c) => s + c.count, 0) / total;
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function personality({ watched, status, byCategory, countries, avgRating, ratedCount, hours }) {
  const n = watched.length;
  if (n < 5) {
    return {
      name: 'Still warming up',
      blurb: `Add ${5 - n} more title${5 - n === 1 ? '' : 's'} you've watched and your viewer profile will appear here.`,
      traits: [],
    };
  }

  const anime = share(byCategory, ['anime'], n);
  const movies = share(byCategory, ['movies'], n);
  const series = share(byCategory, ['series'], n);
  const drama = share(byCategory, DRAMA_SHELVES, n);
  const top = byCategory.reduce((a, b) => (b.count > a.count ? b : a), byCategory[0]);
  const topShare = top ? top.count / n : 0;

  let name;
  let blurb;
  if (anime >= 0.5) {
    name = 'Certified Otaku';
    blurb = `${pct(anime)} of what you watch is anime. Opening songs are skipped at your own peril, and you have opinions about filler arcs.`;
  } else if (drama >= 0.4) {
    name = 'The Drama Devotee';
    blurb = `${pct(drama)} of your watching is world dramas. Slow-burn romance, family feuds and 100-episode sagas don't scare you.`;
  } else if (movies >= 0.5) {
    name = 'The Cinephile';
    blurb = `Movies make up ${pct(movies)} of your list. You like a story with a proper beginning, middle and end, in one sitting.`;
  } else if (series >= 0.4) {
    name = 'The Binge Strategist';
    blurb = `${pct(series)} of your list is series. "One more episode" is a lifestyle, not a promise.`;
  } else if (countries.length >= 6 && topShare <= 0.45) {
    name = 'The Globetrotter';
    blurb = `You've watched stories from ${countries.length} countries without leaving the couch. Subtitles are your second language.`;
  } else {
    name = 'The All-Rounder';
    blurb = `No single shelf owns you. ${top ? `${CATEGORY_LABEL[top.id]} leads at ${pct(topShare)}, ` : ''}but you'll happily switch genres, formats and countries.`;
  }

  const traits = [];
  const started = status.completed + status.watching + status.on_hold + status.dropped;
  const dropRate = started ? status.dropped / started : 0;
  if (started >= 8 && dropRate >= 0.2) traits.push({ label: 'Ruthless dropper', text: `You drop ${pct(dropRate)} of what you start. Life's too short for bad shows.` });
  if (started >= 10 && dropRate <= 0.05) traits.push({ label: 'The finisher', text: 'You almost never drop anything. Once you start, you see it through.' });
  if (status.plan >= Math.max(10, status.completed)) traits.push({ label: 'Watchlist hoarder', text: `${status.plan} titles waiting to be watched. The list grows faster than the free time.` });
  if (status.watching >= 6) traits.push({ label: 'The juggler', text: `${status.watching} things in progress at once. You know exactly where you left off in every one.` });
  if (ratedCount >= 5 && avgRating >= 8) traits.push({ label: 'Generous critic', text: `Average rating ${avgRating.toFixed(1)}/10. You find something to love in most things.` });
  if (ratedCount >= 5 && avgRating < 6.5) traits.push({ label: 'Hard to impress', text: `Average rating ${avgRating.toFixed(1)}/10. A 9 from you means something.` });
  if (hours >= 1000) traits.push({ label: 'Living legend', text: `About ${Math.round(hours / 24)} full days of watching. That's dedication.` });
  else if (hours >= 250) traits.push({ label: 'Seasoned viewer', text: `About ${Math.round(hours)} hours logged so far.` });
  if (share(byCategory, ['kdrama'], n) >= 0.2) traits.push({ label: 'K-wave rider', text: 'Korean dramas are a big part of your rotation.' });
  if (share(byCategory, ['turkish'], n) >= 0.15) traits.push({ label: 'Dizi lover', text: 'Turkish dramas, long episodes and all, are your thing.' });
  if (countries.length >= 8) traits.push({ label: 'World traveller', text: `Titles from ${countries.length} different countries.` });

  return { name, blurb, traits: traits.slice(0, 4) };
}
