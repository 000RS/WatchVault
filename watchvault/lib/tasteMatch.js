'use client';

// Taste DNA: a compact summary of what someone loves across every shelf, and how two people compare.
// Only this summary is shared for matching (when you opt in), never your full history.

import { CATEGORY_LABEL, STARTED, isScreen, kindOf } from './categories';

const keyOf = (e) => `${e.source}:${e.media_type}:${e.source_id}`;
const weight = (e) => {
  let w = e.status === 'completed' ? 3 : e.status === 'watching' ? 2.5 : ['stopped', 'on_hold'].includes(e.status) ? 1.5 : e.status === 'tried' ? 0.5 : e.status === 'dropped' ? -1.5 : 0;
  if (e.rating != null) w += (Number(e.rating) - 6) / 1.5;
  if (e.favourite) w += 2;
  return w;
};
const group = (e) => (isScreen(e) ? 'screen' : kindOf(e));

/** Why someone likes things, read from the genres they keep coming back to. */
const TRAITS = [
  ['heart', 'Emotional storytelling', /drama|romance|slice of life|psychological|biography/i],
  ['fight', 'Action and big fights', /action|adventure|fighting|shooter|war|martial/i],
  ['mind', 'Mysteries and mind games', /mystery|thriller|psychological|crime|puzzle|detective/i],
  ['laugh', 'Laughs', /comedy|humou?r|sitcom|parody/i],
  ['worlds', 'World-building and fantasy', /fantasy|sci-?fi|science fiction|supernatural|mecha|space/i],
  ['dark', 'Dark and scary', /horror|dark|gore|survival/i],
  ['real', 'Real stories', /documentary|history|true crime|biography|news|education/i],
  ['cosy', 'Cosy and warm', /family|kids|slice of life|cozy|simulat|music|food/i],
];

export function tasteVector(entries) {
  const started = entries.filter((e) => STARTED.has(e.status) || e.favourite);
  const shelves = {};
  const genres = {};
  const traits = {};
  for (const e of started) {
    const w = weight(e);
    shelves[e.category] = (shelves[e.category] || 0) + 1;
    for (const g of (e.genres || []).slice(0, 4)) {
      const k = `${group(e)}|${g}`;
      genres[k] = (genres[k] || 0) + w;
      for (const [id, , re] of TRAITS) if (re.test(g)) traits[id] = (traits[id] || 0) + Math.max(w, 0);
    }
  }
  const top = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  const favs = [...started]
    .filter((e) => e.favourite || e.rating >= 8 || (e.status === 'completed' && e.rating == null && (e.rewatch_count || 0) > 0))
    .sort((a, b) => Number(b.favourite) - Number(a.favourite) || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 80)
    .map((e) => [keyOf(e), e.title]);
  return { v: 5, n: started.length, shelves, genres: top(genres, 60), traits: top(traits, 8), favs, at: new Date().toISOString().slice(0, 10) };
}

const cosine = (a, b, filter = () => true) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of Object.entries(a)) if (filter(k) && x > 0) (na += x * x), (dot += x * Math.max(b[k] || 0, 0));
  for (const [k, y] of Object.entries(b)) if (filter(k) && y > 0) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : null;
};

export const TRAIT_LABEL = Object.fromEntries(TRAITS.map(([id, label]) => [id, label]));
export const topTraits = (vec, n = 3) => Object.entries(vec?.traits || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);

/**
 * How two Taste DNAs compare: an overall score, a breakdown per area, what you agree and differ on,
 * and why (the reasons you each love things).
 */
export function compareTaste(a, b) {
  if (!a || !b) return null;
  const groups = [...new Set(Object.keys(a.genres).map((k) => k.split('|')[0]))].filter((g) => Object.keys(b.genres).some((k) => k.startsWith(`${g}|`)));
  const perArea = groups
    .map((g) => {
      const score = cosine(a.genres, b.genres, (k) => k.startsWith(`${g}|`));
      const mine = Object.entries(a.genres).filter(([k, v]) => k.startsWith(`${g}|`) && v > 0);
      const theirs = new Map(Object.entries(b.genres).filter(([k]) => k.startsWith(`${g}|`)));
      const agree = mine.filter(([k]) => (theirs.get(k) || 0) > 0).sort((x, y) => y[1] + theirs.get(y[0]) - x[1] - theirs.get(x[0])).slice(0, 3).map(([k]) => k.split('|')[1]);
      const onlyMe = mine.filter(([k]) => !(theirs.get(k) > 0)).slice(0, 2).map(([k]) => k.split('|')[1]);
      const onlyThem = [...theirs].filter(([k, v]) => v > 0 && !(a.genres[k] > 0)).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k.split('|')[1]);
      return { area: g, score: score == null ? null : Math.round(score * 100), agree, onlyMe, onlyThem };
    })
    .filter((x) => x.score != null)
    .sort((x, y) => y.score - x.score);
  const theirFavs = new Map(b.favs.map(([k, t]) => [k, t]));
  const sharedFavs = a.favs.filter(([k]) => theirFavs.has(k)).map(([, t]) => t);
  const genre = cosine(a.genres, b.genres) ?? 0;
  const traits = cosine(a.traits, b.traits) ?? 0;
  const favBoost = Math.min(1, sharedFavs.length / 8);
  const score = Math.round(Math.max(0, Math.min(1, genre * 0.55 + traits * 0.25 + favBoost * 0.2)) * 100);
  const myWhy = topTraits(a);
  const theirWhy = topTraits(b);
  const sameWhy = myWhy.filter((t) => theirWhy.includes(t));
  const why =
    sameWhy.length > 0
      ? `You both come for ${sameWhy.map((t) => TRAIT_LABEL[t].toLowerCase()).join(' and ')}.`
      : myWhy[0] && theirWhy[0]
        ? `You come for ${TRAIT_LABEL[myWhy[0]].toLowerCase()}; they come for ${TRAIT_LABEL[theirWhy[0]].toLowerCase()}.`
        : null;
  return { score, perArea, sharedFavs, why, myWhy, theirWhy };
}

export const AREA_LABEL = { screen: 'Films & series', book: 'Books', manga: 'Manga', game: 'Games', music: 'Music', podcast: 'Podcasts', place: 'Places & food', event: 'Events', travel: 'Travel', custom: 'Other' };

/** How your taste moved over time: top genres in each half-year. */
export function tasteEvolution(entries, periods = 4) {
  const now = new Date();
  const halves = [];
  for (let i = periods - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i * 6 + 1, 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 6, 1);
    halves.push({ start, end, label: `${start.toLocaleDateString(undefined, { month: 'short' })}–${new Date(end - 86400000).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}` });
  }
  return halves.map((h) => {
    const inside = entries.filter((e) => {
      const d = new Date(e.watched_to || e.created_at);
      return STARTED.has(e.status) && d >= h.start && d < h.end;
    });
    const g = {};
    for (const e of inside) for (const x of (e.genres || []).slice(0, 3)) if (x !== 'Drama' || inside.length < 6) g[x] = (g[x] || 0) + Math.max(weight(e), 0.5);
    const total = Object.values(g).reduce((s, v) => s + v, 0) || 1;
    const top = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, v]) => ({ name, share: Math.round((v / total) * 100) }));
    const shelves = {};
    for (const e of inside) shelves[e.category] = (shelves[e.category] || 0) + 1;
    return { ...h, count: inside.length, top, shelves: Object.entries(shelves).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${n} ${CATEGORY_LABEL[c] || c}`) };
  });
}
