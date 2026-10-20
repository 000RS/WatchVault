// Fuzzy title matching: how close is what someone typed to a real title?
// Pure functions, shared by the server matcher and tests.

const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'no', 'wa', 'ga', 'to', 'in', 'on', 'x']);

export function norm(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/½/g, ' 1/2 ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const squash = (s) => norm(s).replace(/[^a-z0-9]/g, '');

// Rough sound-alike form so "hayikyu" and "haikyu", "koruko" and "kuroko" meet.
export function loose(s) {
  return squash(s)
    .replace(/ph/g, 'f')
    .replace(/ck|q/g, 'k')
    .replace(/c(?=[aou])/g, 'k')
    .replace(/[yi]+/g, 'i')
    .replace(/ou|oo|uu/g, 'u')
    .replace(/ei|ee/g, 'i')
    .replace(/(.)\1+/g, '$1');
}

// Edit distance that also counts swapped neighbours ("freind" vs "friend") as one edit.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function tokens(s) {
  return norm(s)
    .split(' ')
    .filter((t) => t && !SMALL.has(t));
}

/** Similarity between 0 and 1. */
export function similarity(query, title) {
  const q = norm(query);
  const t = norm(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const qs = squash(q);
  const ts = squash(t);
  if (qs === ts) return 0.99;

  let best = Math.max(ratio(qs, ts), ratio(loose(q), loose(t)) * 0.97);

  // The main title without its subtitle: "Shimoneta" from "Shimoneta: A Boring World…"
  const main = String(title).split(/\s*[:：(\[]|\s[-–—]\s/)[0];
  if (main && main.length >= 3 && main !== title) {
    const ms = squash(main);
    const mainScore = Math.max(ratio(qs, ms), ratio(loose(q), loose(main)) * 0.97);
    best = Math.max(best, mainScore * 0.96);
  }

  // Word overlap, tolerant of small typos in each word.
  const qt = tokens(q);
  const tt = tokens(t);
  if (qt.length && tt.length) {
    let hit = 0;
    for (const w of qt) {
      const m = Math.max(...tt.map((x) => (x === w ? 1 : ratio(loose(w), loose(x)))));
      if (m >= 0.8) hit += m;
    }
    const recall = hit / qt.length; // how much of what was typed is in the title
    const precision = hit / tt.length; // how much of the title was typed
    const f = (2 * recall * precision) / (recall + precision || 1);
    best = Math.max(best, f * 0.96, recall >= 0.99 && precision >= 0.5 ? 0.9 : 0);
  }

  // Typed the start of a longer title: "Higehiro" vs "Higehiro: After Being Rejected…"
  if (ts.startsWith(qs) && qs.length >= 5) best = Math.max(best, 0.86 + 0.1 * (qs.length / ts.length));
  if (qs.startsWith(ts) && ts.length >= 5) best = Math.max(best, 0.8);

  // Initials: "FMA" → "Fullmetal Alchemist", "GTO" → "Great Teacher Onizuka"
  if (qs.length <= 5 && /^[a-z]+$/.test(qs)) {
    const initials = norm(t).split(' ').map((w) => w[0]).join('');
    if (initials.startsWith(qs)) best = Math.max(best, 0.84);
  }
  return Math.min(1, best);
}

export function bestSimilarity(query, names) {
  return Math.max(0, ...names.filter(Boolean).map((n) => similarity(query, n)));
}

/** Score a TMDB candidate for a typed line. */
export function scoreCandidate(c, { q, year, kind, extraNames = [] }) {
  const names = [c.title, c.originalTitle, ...(c.altTitles || [])];
  let s = Math.max(bestSimilarity(q, names), extraNames.length ? bestSimilarity(c.title, extraNames) * 0.98 : 0, extraNames.length ? bestSimilarity(c.originalTitle, extraNames) * 0.98 : 0);
  if (year && c.year) {
    if (c.year === year) s += 0.06;
    else if (Math.abs(c.year - year) <= 1) s += 0.03;
    else s -= 0.05;
  }
  if (kind === 'anime') s += c.category === 'anime' ? 0.05 : -0.08;
  else if (kind === 'movie') s += c.mediaType === 'movie' ? 0.03 : -0.04;
  else if (kind === 'tv') s += c.mediaType === 'tv' ? 0.03 : -0.04;
  // Well-known titles win ties.
  s += Math.min(0.05, Math.log10((c.voteCount || 0) + 1) / 80);
  return Math.max(0, Math.min(1, s));
}

/** Search phrases worth trying when the first search finds nothing good. */
export function queryVariants(q) {
  const base = String(q || '').trim();
  const out = new Set([base]);
  const cleaned = base
    .replace(/\b(season|series|part|cour)\s*\d+\b/gi, '')
    .replace(/\bs\d{1,2}\b/gi, '')
    .replace(/\b(the\s+)?(movie|film|anime|ova|tv|series|the animation)\b/gi, '')
    .replace(/[([].*?[)\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned) out.add(cleaned);
  const words = cleaned.split(' ');
  if (words.length > 3) out.add(words.slice(0, 3).join(' '));
  if (words.length > 1) out.add(words.slice(0, 2).join(' '));
  return [...out].filter((v) => v.length >= 2);
}

/**
 * Other ways people spell the same title, mostly for names written in English letters
 * from Hindi, Urdu, Arabic, Japanese and so on: "chota bheem" → "chhota bheem", "dil wale" → "dilwale".
 */
export function spellingVariants(q) {
  const base = String(q || '').toLowerCase().trim();
  if (!base) return [];
  const rules = [
    [/ch(?!h)/g, 'chh'],
    [/chh/g, 'ch'],
    [/ee/g, 'i'],
    [/(?<=[bcdfghjklmnpqrstvwxyz])i(?=[bcdfghjklmnpqrstvwxyz]|\b)/g, 'ee'],
    [/oo/g, 'u'],
    [/(?<=[bcdfghjklmnpqrstvwxyz])u(?=[bcdfghjklmnpqrstvwxyz]|\b)/g, 'oo'],
    [/aa/g, 'a'],
    [/(?<=[bcdfghjklmnpqrstvwxyz])a(?=[bcdfghjklmnpqrstvwxyz])/g, 'aa'],
    [/w/g, 'v'],
    [/v/g, 'w'],
    [/z/g, 'j'],
    [/ph/g, 'f'],
    [/q/g, 'k'],
    [/(?<=[kgdtbp])h/g, ''],
    [/(?<=[kgdtbp])(?!h)(?=[aeiou])/g, 'h'],
    [/y/g, 'i'],
    [/(.)\1/g, '$1'],
    [/ /g, ''],
    [/(?<=[a-z]{3})(?=[a-z]{3,}$)/, ' '],
  ];
  const out = new Set();
  for (const [re, to] of rules) {
    const v = base.replace(re, to).replace(/\s+/g, ' ').trim();
    if (v && v !== base) out.add(v);
  }
  // A couple of two-step variants for the most common pairings
  for (const v of [...out].slice(0, 6)) {
    for (const [re, to] of rules.slice(0, 8)) {
      const w = v.replace(re, to).trim();
      if (w && w !== base) out.add(w);
    }
  }
  return [...out].slice(0, 14);
}
