'use client';

// A year (or any date range) of watching, built from the diary plus watch dates on your titles.
// Powers Goals, the Diary heatmap, Stats over time and Wrapped.

import { diary } from './social4';
import { languageName } from './categories';

const cache = new Map();
/** Diary rows for one year (cached for the session). Empty when the v4 upgrade hasn't run. */
export async function diaryForYear(year, userId) {
  const k = `${userId || 'me'}:${year}`;
  if (!cache.has(k)) cache.set(k, diary(userId, { from: `${year}-01-01`, to: `${year}-12-31` }).catch(() => []));
  return cache.get(k);
}
export const forgetDiary = () => cache.clear();

const DEFAULT_RUNTIME = { movie: 110, tv: 40, anime: 24 };
const runtimeOf = (e) => e?.runtime || DEFAULT_RUNTIME[e?.media_type] || 40;
const dayKey = (d) => String(d).slice(0, 10);

/**
 * Everything about one year. `entries` is the whole list, `rows` the year's diary rows.
 * Titles with a watch date in the year count even without diary rows (older data).
 */
export function yearSummary(entries, rows, year) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const y = String(year);
  const events = rows.filter((r) => dayKey(r.watched_on).startsWith(y)).map((r) => ({ ...r, entry: byId.get(r.entry_id) }));
  // Older entries that have a finish date but no diary row yet.
  const logged = new Set(events.filter((r) => r.kind === 'watch').map((r) => r.entry_id));
  for (const e of entries)
    if (e.watched_to && dayKey(e.watched_to).startsWith(y) && !logged.has(e.id))
      events.push({ id: `e${e.id}`, entry_id: e.id, entry: e, kind: 'watch', watched_on: e.watched_to, media_type: e.media_type, runtime: e.runtime, title: e.title, poster_url: e.poster_url });

  const episodeRowsFor = new Map();
  for (const r of events) if (r.kind === 'episode') episodeRowsFor.set(r.entry_id, (episodeRowsFor.get(r.entry_id) || 0) + 1);

  const days = new Map(); // yyyy-mm-dd → minutes
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, minutes: 0, titles: new Set(), episodes: 0 }));
  const titleMinutes = new Map();
  let minutes = 0;
  let episodes = 0;
  let rewatches = 0;
  const finished = new Set();
  for (const r of events) {
    const e = r.entry;
    const rt = r.runtime || runtimeOf(e || r);
    let m = 0;
    if (r.kind === 'episode') {
      m = rt;
      episodes++;
    } else if (r.kind === 'rewatch') {
      m = r.media_type === 'movie' ? rt : rt * Math.min(e?.total_episodes || 10, 12);
      rewatches++;
    } else if (r.media_type === 'movie') {
      m = rt;
      finished.add(r.entry_id);
    } else {
      // Finishing a series: count the episodes we didn't see logged one by one (capped, so a 1,000-episode
      // show finished this year doesn't swamp the year).
      const est = Math.max(0, Math.min(e?.episodes_watched || e?.total_episodes || 12, 26) - (episodeRowsFor.get(r.entry_id) || 0));
      m = est * rt;
      episodes += est;
      finished.add(r.entry_id);
    }
    minutes += m;
    const d = dayKey(r.watched_on);
    // A whole series finished "on" one date was really watched over many days: cap what that day shows.
    const dayM = r.kind === 'watch' && r.media_type !== 'movie' ? Math.min(m, 240) : m;
    days.set(d, (days.get(d) || 0) + dayM);
    const mo = months[Number(d.slice(5, 7)) - 1];
    if (mo) {
      mo.minutes += m;
      mo.titles.add(r.entry_id);
      if (r.kind === 'episode') mo.episodes++;
    }
    if (r.entry_id) titleMinutes.set(r.entry_id, (titleMinutes.get(r.entry_id) || 0) + m);
  }

  // Streaks: consecutive days with anything watched.
  const sortedDays = [...days.keys()].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  let bestEnd = null;
  for (const d of sortedDays) {
    const t = new Date(`${d}T00:00:00Z`).getTime();
    run = prev && t - prev === 86400000 ? run + 1 : 1;
    if (run > best) (best = run), (bestEnd = d);
    prev = t;
  }
  const today = new Date().toISOString().slice(0, 10);
  let current = 0;
  for (let t = new Date(`${today}T00:00:00Z`).getTime(); days.has(new Date(t).toISOString().slice(0, 10)); t -= 86400000) current++;
  if (!current) {
    // A streak still counts if you watched yesterday and not yet today.
    for (let t = new Date(`${today}T00:00:00Z`).getTime() - 86400000; days.has(new Date(t).toISOString().slice(0, 10)); t -= 86400000) current++;
  }

  const bingeDay = [...days.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const titles = [...titleMinutes.entries()]
    .map(([id, m]) => ({ entry: byId.get(id), minutes: m }))
    .filter((x) => x.entry)
    .sort((a, b) => b.minutes - a.minutes);
  const yearEntries = titles.map((t) => t.entry);

  const tally = (fn) => {
    const m = new Map();
    for (const { entry, minutes: mins } of titles) for (const k of fn(entry) || []) if (k) m.set(k, (m.get(k) || 0) + Math.max(mins, 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const people = (key) => {
    const m = new Map();
    for (const { entry } of titles)
      for (const p of entry.credits?.[key] || []) {
        const cur = m.get(p[0]) || { id: p[0], name: p[1], gender: p[2], photo: p[3], titles: [] };
        cur.titles.push(entry);
        m.set(p[0], cur);
      }
    return [...m.values()].sort((a, b) => b.titles.length - a.titles.length);
  };
  const cast = people('c');

  const ratedThisYear = yearEntries.filter((e) => e.rating != null);
  const topRated = [...ratedThisYear].sort((a, b) => b.rating - a.rating || (b.popularity || 0) - (a.popularity || 0));
  const dow = Array.from({ length: 7 }, () => 0);
  for (const [d, m] of days) dow[new Date(`${d}T12:00:00Z`).getUTCDay()] += m;

  return {
    year: Number(year),
    events,
    minutes,
    hours: Math.round(minutes / 60),
    episodes,
    rewatches,
    finished: finished.size,
    titlesTouched: titles.length,
    days,
    activeDays: days.size,
    months: months.map((m) => ({ ...m, titles: m.titles.size })),
    streak: { best, bestEnd, current },
    bingeDay: bingeDay ? { day: bingeDay[0], minutes: bingeDay[1] } : null,
    titles,
    topRated,
    genres: tally((e) => e.genres?.slice(0, 3)),
    languages: tally((e) => [e.original_language]).map(([k, v]) => [languageName(k), v]),
    countries: tally((e) => [e.origin_country]),
    categories: tally((e) => [e.category]),
    actors: cast.filter((p) => p.gender === 2),
    actresses: cast.filter((p) => p.gender === 1),
    cast,
    directors: people('d'),
    studios: people('s'),
    weekday: dow,
    first: [...events].sort((a, b) => dayKey(a.watched_on).localeCompare(dayKey(b.watched_on)))[0] || null,
  };
}

/** Progress toward the yearly goals set in Settings. */
export function goalProgress(summary, goals) {
  if (!goals) return [];
  const now = new Date();
  const startOfYear = new Date(summary.year, 0, 1);
  const frac = summary.year < now.getFullYear() ? 1 : Math.min(1, (now - startOfYear) / (365 * 86400000));
  return [
    ['titles', 'Titles finished', summary.finished],
    ['hours', 'Hours watched', summary.hours],
    ['episodes', 'Episodes', summary.episodes],
  ]
    .filter(([k]) => goals[k])
    .map(([k, label, value]) => {
      const target = goals[k];
      const expected = Math.round(target * frac);
      return { key: k, label, value, target, pct: Math.min(100, Math.round((value / target) * 100)), ahead: value - expected };
    });
}

export const fmtHours = (min) => {
  const h = Math.round(min / 60);
  return h >= 48 ? `${h.toLocaleString()} hours (${Math.round(h / 24)} days)` : `${h} hours`;
};
