// Pulls watch-list lines out of whatever people have: pasted notes, Excel/CSV,
// Word, MyAnimeList exports, Letterboxd and IMDb CSVs. Each line becomes
// { id, raw, q, year, kind, status, episodes, seasons, season, episode, pct, rating }.
// Matching to real titles happens later on the server.

const STATUS_PHRASES = [
  ['plan to watch', 'plan'], ['want to watch', 'plan'], ['to watch', 'plan'], ['watch later', 'plan'], ['watchlist', 'plan'],
  ['wishlist', 'plan'], ['ptw', 'plan'], ['planned', 'plan'], ['planning', 'plan'], ['plan', 'plan'], ['later', 'plan'],
  ['currently watching', 'watching'], ['in progress', 'watching'], ['watching', 'watching'], ['ongoing', 'watching'], ['current', 'watching'],
  ['on hold', 'on_hold'], ['on-hold', 'on_hold'], ['paused', 'on_hold'], ['hold', 'on_hold'],
  ['dropped', 'dropped'], ['abandoned', 'dropped'], ['quit', 'dropped'], ['drop', 'dropped'], ['not for me', 'dropped'],
  ['stopped', 'stopped'], ['stopped at', 'stopped'],
  ['tried', 'tried'], ['try out', 'tried'], ['tryout', 'tried'], ['try-out', 'tried'], ['sampled', 'tried'],
  ['seen clips', 'clips'], ['clips', 'clips'], ['reels', 'clips'], ['tiktok', 'clips'], ['shorts', 'clips'],
  ['completed', 'completed'], ['complete', 'completed'], ['finished', 'completed'], ['watched', 'completed'], ['seen', 'completed'], ['done', 'completed'],
];
const KIND_WORDS = {
  movie: 'movie', movies: 'movie', film: 'movie', films: 'movie', feature: 'movie',
  anime: 'anime', animes: 'anime', manga: 'anime',
  series: 'tv', show: 'tv', shows: 'tv', tv: 'tv', tvseries: 'tv', tvminiseries: 'tv', miniseries: 'tv', drama: 'tv', dramas: 'tv',
  kdrama: 'tv', kdramas: 'tv', cdrama: 'tv', jdrama: 'tv', dizi: 'tv', sitcom: 'tv', docuseries: 'tv',
};
const FILLER = new Set([
  'list', 'lists', 'my', 'i', 'ive', 'i have', 'have', 'all', 'to', 'of', 'the', 'or', 'more', 'less', 'than', 'and', 'things', 'stuff',
  'titles', 'title', 'a', 'already', 'so', 'far', 'that', 'what', 'we', 'top', 'favourite', 'favorite', 'favourites', 'favorites', 'best',
  'season', 'seasons', 'episode', 'episodes', 'eps', 'ep', 'or', 'upto', 'up', 'atleast', 'least', 'at', 'k', 'turkish', 'korean', 'indian',
  'pakistani', 'chinese', 'japanese', 'thai', 'english', 'hindi', 'urdu', 'tv', 'name', 've', 's', 'd', 'whole', 'entire', 'total',
]);

const TITLE_HEADERS = ['title', 'name', 'titles', 'film', 'film title', 'movie title', 'series title', 'show', 'show title', 'anime title', 'series name', 'movie name', 'anime name', 'original title'];
const COL_ROLES = [
  ['year', ['year', 'release year', 'released', 'release date', 'year released', 'first aired']],
  ['status', ['status', 'my status', 'watch status', 'state']],
  ['episodes', ['episodes', 'episodes watched', 'eps', 'ep', 'progress', 'watched episodes', 'my watched episodes', 'episode']],
  ['seasons', ['seasons', 'season', 'seasons watched']],
  ['rating', ['rating', 'my rating', 'your rating', 'score', 'my score', 'stars']],
  ['type', ['type', 'title type', 'kind', 'format', 'category', 'media type']],
  ['imdb', ['imdb id', 'const', 'imdb', 'imdb_id', 'imdbid']],
  ['tmdb', ['tmdb', 'tmdb id', 'tmdb_id', 'tmdbid']],
  ['watched', ['watched date', 'date watched', 'watcheddate', 'last watched', 'watched at', 'watched_at', 'last_watched_at', 'date']],
  ['rewatch', ['rewatch']],
  ['review', ['review', 'memo']],
  ['skip', ['notes', 'note', 'comments', 'url', 'link', 'id', 'genres', 'genre', 'directors', 'date rated', 'runtime', 'runtime (mins)', 'imdb rating', 'num votes', 'description', 'tags', 'letterboxd uri', 'position', 'simkl_id', 'tvdb', 'watchlist', 'lastepwatched']],
];

let counter = 0;
const nextId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

const lc = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function statusIn(text) {
  const t = ` ${lc(text).replace(/[^a-z\- ]/g, ' ')} `;
  for (const [p, s] of STATUS_PHRASES) if (t.includes(` ${p} `)) return s;
  return null;
}

function kindIn(text) {
  const words = lc(text).replace(/[^a-z ]/g, '').split(' ');
  for (const w of words) if (KIND_WORDS[w]) return KIND_WORDS[w];
  if (/\bk-?drama|c-?drama|j-?drama\b/i.test(text)) return 'tv';
  if (/\btv ?(series|mini ?series|show)\b/i.test(text)) return 'tv';
  return null;
}

/** Numbers about progress/rating that might trail a title. Returns what it found and the text without it. */
function takeAttributes(text) {
  let t = ` ${text} `;
  const a = {};
  const grab = (re, fn) => {
    t = t.replace(re, (...m) => {
      fn(m);
      return ' ';
    });
  };
  grab(/\bS(\d{1,2})\s*[ .x-]?\s*E(\d{1,4})\b/i, (m) => ((a.season = +m[1]), (a.episode = +m[2])));
  grab(/\bseason\s*(\d{1,2})\s*,?\s*(?:ep|episode)\s*(\d{1,4})\b/i, (m) => ((a.season = +m[1]), (a.episode = +m[2])));
  grab(/\b(?:seasons?)\s*(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\b/i, (m) => (a.seasons = Math.max(+m[1], +m[2])));
  grab(/\b(\d{1,2})\s*seasons?\b(?!\s*\d)/i, (m) => (a.seasons = +m[1]));
  grab(/\b(?:season|s)\s*(\d{1,2})\b(?:\s*(?:or more|\+|and more))?/i, (m) => (a.seasons = +m[1]));
  grab(/\b(?:ep|eps|episode|episodes)\.?\s*(\d{1,4})\b/i, (m) => (a.episodes = +m[1]));
  grab(/\b(\d{1,4})\s*(?:\+|or more|and more|or above)?\s*(?:eps|episodes|ep)\b(?:\s*(?:or more|\+))?/i, (m) => (a.episodes = +m[1]));
  grab(/\b(?:less than or =|less than or equal to|<=|up to|upto)\s*(\d{1,4})\s*(?:eps|episodes)?\b/i, (m) => (a.episodes = +m[1]));
  grab(/\b(\d{1,3})\s*%/i, (m) => (a.pct = Math.min(100, +m[1])));
  grab(/\b(?:half[- ]?watched|halfway|half way|half)\b/i, () => (a.pct = 50));
  grab(/\b(\d{1,2}(?:\.\d)?)\s*\/\s*10\b/, (m) => (a.rating = Math.min(10, +m[1])));
  grab(/\b(\d(?:\.\d)?)\s*\/\s*5\b/, (m) => (a.rating = Math.min(10, +m[1] * 2)));
  grab(/(★+)(☆*)/, (m) => (a.rating = Math.min(10, m[1].length * 2)));
  grab(/\brated\s*(\d{1,2}(?:\.\d)?)\b/i, (m) => (a.rating = Math.min(10, +m[1])));
  return { attrs: a, rest: t.replace(/\s+/g, ' ').trim() };
}

function isAttributeOnly(segment) {
  const s = lc(segment);
  if (!s) return true;
  if (/^[([]?\s*(19|20)\d{2}\s*[)\]]?$/.test(s)) return true;
  const { rest } = takeAttributes(segment);
  const words = lc(rest).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  return words.every((w) => FILLER.has(w) || KIND_WORDS[w] || STATUS_PHRASES.some(([p]) => p === w || p.split(' ').includes(w)));
}

/** Parse one line. Returns null for blanks, { header: true, ... } for section headings. */
export function parseLine(raw, ctx = {}) {
  let line = String(raw ?? '').replace(/ /g, ' ').trim();
  if (!line) return null;
  line = line
    .replace(/^\s*(?:[-*•·▪►▸→✓✔☑✗✘☐]|\[[ xX✓]?\]|\(\s*[xX✓]?\s*\))\s*/, '')
    .replace(/^\s*#?\d{1,4}\s*[.)\]:]\s+/, '')
    .trim();
  if (!line) return null;

  const isHeading = /:\s*$/.test(line);
  line = line.replace(/:\s*$/, '');

  // Split off trailing fields: "Title | completed | 12", "Title - dropped", "Title, 2019"
  const fields = [];
  const parts = line.split(/\s*[|\t]\s*/);
  let title = parts.shift();
  fields.push(...parts);
  for (;;) {
    const m = title.match(/^(.*\S)\s*(?:\s[-–—]\s|,\s|;\s|\s\(|\s\[)([^,;\-–—]*?)[)\]]?\s*$/);
    if (!m || !isAttributeOnly(m[2]) || !m[1].trim()) break;
    fields.unshift(m[2]);
    title = m[1];
  }

  const out = { status: null, kind: null };
  for (const f of fields) {
    const y = String(f).match(/^\s*[([]?\s*((?:19|20)\d{2})\s*[)\]]?\s*$/);
    if (y) {
      out.year = +y[1];
      continue;
    }
    const { attrs } = takeAttributes(String(f));
    Object.assign(out, attrs);
    if (/^\s*\d{1,4}\s*$/.test(f) && out.episodes == null && !attrs.rating) out.episodes = +f;
    out.status ||= statusIn(f);
    out.kind ||= kindIn(f);
  }

  // Inline extras inside the title itself: "(2019)", "S2 E5", "ep 750", "(dropped)"
  title = title.replace(/[([]\s*((?:19|20)\d{2})\s*[)\]]/, (_, y) => {
    out.year ??= +y;
    return ' ';
  });
  const statusTail = title.match(/[([]\s*([a-z\- ]+?)\s*[)\]]\s*$/i);
  if (statusTail && (statusIn(statusTail[1]) || kindIn(statusTail[1]))) {
    out.status ||= statusIn(statusTail[1]);
    out.kind ||= kindIn(statusTail[1]);
    title = title.slice(0, statusTail.index);
  }
  const { attrs, rest } = takeAttributes(title);
  for (const [k, v] of Object.entries(attrs)) out[k] ??= v;
  title = rest.replace(/^[\s"'“”‘’.,:;\-–—]+|[\s"'“”‘’.,:;\-–—]+$/g, '').trim();

  // A heading like "Completed:", "MOVIES", "Dropped anime", "5 or more episodes"
  const words = lc(title).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const looksLikeHeading =
    isHeading ||
    !words.length ||
    words.every((w) => FILLER.has(w) || KIND_WORDS[w] || STATUS_PHRASES.some(([p]) => p.split(' ').includes(w)));
  if (looksLikeHeading && (isHeading || statusIn(title) || kindIn(title) || Object.keys(attrs).length || !words.length)) {
    return { header: true, status: statusIn(title) || out.status, kind: kindIn(title) || out.kind, episodes: out.episodes, seasons: out.seasons, pct: out.pct };
  }
  if (!title) return null;

  return {
    id: nextId(),
    raw: String(raw).trim(),
    q: title,
    year: out.year ?? null,
    kind: out.kind || ctx.kind || null,
    status: out.status || null,
    ctxStatus: ctx.status || null,
    episodes: out.episodes ?? ctx.episodes ?? null,
    seasons: out.seasons ?? ctx.seasons ?? null,
    season: out.season ?? null,
    episode: out.episode ?? null,
    pct: out.pct ?? ctx.pct ?? null,
    rating: out.rating ?? null,
    ownProgress: out.episodes != null || out.seasons != null || out.season != null || (out.pct != null && out.pct < 100),
  };
}

function finalize(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${lc(it.q)}|${it.year || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hasProgress = it.episodes != null || it.seasons != null || it.season != null || (it.pct != null && it.pct < 100);
    // Partial progress under a "Completed" heading means part-way through (it becomes Completed later if the progress reaches the end).
    const ctx = it.ctxStatus === 'completed' && it.ownProgress ? 'watching' : it.ctxStatus;
    it.status = it.status || ctx || (hasProgress ? 'watching' : null);
    delete it.ctxStatus;
    delete it.ownProgress;
    out.push(it);
  }
  return out;
}

export function extractFromText(text) {
  let lines = String(text || '').replace(/\r/g, '').split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  // One long line of comma-separated titles
  if (nonEmpty.length <= 2 && (text.match(/[,;]/g) || []).length >= 2) lines = text.split(/[,;\n]/);
  const items = [];
  let ctx = {};
  for (const l of lines) {
    const p = parseLine(l, ctx);
    if (!p) continue;
    if (p.header) {
      ctx = { status: p.status || null, kind: p.kind || ctx.kind || null, episodes: p.episodes ?? null, seasons: p.seasons ?? null, pct: p.pct ?? null };
      continue;
    }
    items.push(p);
  }
  return finalize(items);
}

/* ---------------- Tables (Excel, CSV, Letterboxd, IMDb) ---------------- */

function roleOf(header) {
  const h = lc(header).replace(/[^a-z0-9()% ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return null;
  if (TITLE_HEADERS.includes(h)) return 'title';
  for (const [role, names] of COL_ROLES) if (names.includes(h)) return role;
  return null;
}

function isIndexColumn(values) {
  const nums = values.filter((v) => v !== null && v !== '').map((v) => Number(v));
  if (nums.length < 3 || nums.some((n) => !Number.isInteger(n))) return false;
  let ascending = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] === nums[i - 1] + 1) ascending++;
  return ascending >= (nums.length - 1) * 0.8;
}

const cellText = (v) => (v === null || v === undefined ? '' : String(v).trim());
function dateOf(v) {
  const t = String(v || '').trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(t)) return new Date(Math.round((Number(t) - 25569) * 86400000)).toISOString().slice(0, 10); // Excel serial date
  const d = new Date(t);
  return Number.isFinite(d.getTime()) && d.getFullYear() > 1900 ? d.toISOString().slice(0, 10) : null;
}

export function extractFromRows(rows) {
  rows = (rows || []).map((r) => (Array.isArray(r) ? r : [r]));
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!rows.length || !width) return [];

  // Header row: the early row with the most recognisable column names or section headings.
  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    let s = 0;
    for (const c of rows[i]) {
      const t = cellText(c);
      if (!t) continue;
      if (roleOf(t)) s += 2;
      else if (parseLine(t)?.header) s += 1;
    }
    if (s > bestScore) {
      bestScore = s;
      headerIdx = i;
    }
  }

  // Hints written above the header ("ANIME LIST")
  const globalCtx = {};
  for (let i = 0; i < headerIdx; i++) {
    const text = rows[i].map(cellText).join(' ');
    globalCtx.kind ||= kindIn(text);
    globalCtx.status ||= statusIn(text);
  }

  const header = headerIdx >= 0 ? rows[headerIdx].map(cellText) : [];
  const body = rows.slice(headerIdx + 1);
  const roles = Array.from({ length: width }, (_, c) => roleOf(header[c]));
  const columnValues = (c) => body.map((r) => r[c] ?? null);
  for (let c = 0; c < width; c++) if (!roles[c] && isIndexColumn(columnValues(c)) && !/[a-z]{3}/i.test(header[c] || '')) roles[c] = 'skip';

  const items = [];
  const titleCol = roles.indexOf('title');
  const isLetterboxd = header.some((h) => lc(h) === 'letterboxd uri');
  const isImdb = header.some((h) => lc(h) === 'const') && header.some((h) => lc(h) === 'title type');
  const hasYourRating = header.some((h) => lc(h) === 'your rating');

  // TV Time export: one row per episode watched. Fold them into one line per show.
  const lh = header.map(lc);
  if (lh.includes('tv_show_name') && (lh.includes('episode_number') || lh.includes('episode_season_number'))) {
    const nameC = lh.indexOf('tv_show_name');
    const sC = lh.indexOf('episode_season_number');
    const eC = lh.indexOf('episode_number');
    const dC = lh.findIndex((h) => /created_at|updated_at|watched/.test(h));
    const shows = new Map();
    for (const r of body) {
      const name = cellText(r[nameC]);
      if (!name) continue;
      const se = Number(r[sC]) || 0;
      const ep = Number(r[eC]) || 0;
      const cur = shows.get(name) || { season: 0, episode: 0, count: 0, last: null };
      cur.count++;
      if (se > cur.season || (se === cur.season && ep > cur.episode)) Object.assign(cur, { season: se, episode: ep });
      const d = dC >= 0 ? dateOf(cellText(r[dC])) : null;
      if (d && (!cur.last || d > cur.last)) cur.last = d;
      shows.set(name, cur);
    }
    return finalize(
      [...shows.entries()].map(([name, x]) => ({
        id: nextId(), raw: `${name} (S${x.season} E${x.episode})`, q: name, year: null, kind: 'tv', status: 'watching',
        episodes: x.season ? null : x.count, seasons: null, season: x.season || null, episode: x.season ? x.episode : null, pct: null, rating: null, watchedOn: x.last,
      }))
    );
  }
  if (lh.includes('tv_show_name')) {
    const nameC = lh.indexOf('tv_show_name');
    return finalize(body.map((r) => cellText(r[nameC])).filter(Boolean).map((name) => ({ id: nextId(), raw: name, q: name, year: null, kind: 'tv', status: null, episodes: null, seasons: null, season: null, episode: null, pct: null, rating: null })));
  }
  const ratingCol = roles.indexOf('rating');
  const ratingMax = ratingCol >= 0 ? Math.max(0, ...columnValues(ratingCol).map(Number).filter(Number.isFinite)) : 0;

  if (titleCol >= 0) {
    // One title per row
    for (const r of body) {
      const t = cellText(r[titleCol]);
      if (!t) continue;
      const p = parseLine(t, globalCtx);
      if (!p || p.header) continue;
      roles.forEach((role, c) => {
        const v = cellText(r[c]);
        if (!v || c === titleCol) return;
        if (role === 'year') p.year ??= +String(v).slice(0, 4) || null;
        if (role === 'status') p.status ||= statusIn(v);
        if (role === 'episodes' && /^\d+$/.test(v)) p.episodes ??= +v;
        if (role === 'seasons' && /^\d+$/.test(v)) p.seasons ??= +v;
        if (role === 'rating' && Number(v) > 0) p.rating ??= Math.min(10, ratingMax <= 5 ? Number(v) * 2 : Number(v));
        if (role === 'type') p.kind ||= kindIn(v.replace(/([a-z])([A-Z])/g, '$1 $2'));
        if (role === 'imdb' && /^tt\d+$/.test(v)) p.imdbId = v;
        if (role === 'tmdb' && /^\d+$/.test(v)) p.tmdbId = v;
        if (role === 'watched') p.watchedOn = dateOf(v) || p.watchedOn;
        if (role === 'rewatch' && /^(yes|true|1)$/i.test(v)) p.rewatches = (p.rewatches || 0) + 1;
        if (role === 'review') p.review = v.slice(0, 5000);
      });
      if (p.tmdbId && !p.tmdbType) p.tmdbType = p.kind === 'movie' ? 'movie' : p.kind === 'tv' || p.kind === 'anime' ? 'tv' : null;
      if (isImdb) p.status ||= hasYourRating ? 'completed' : 'plan';
      if (isLetterboxd) {
        p.kind ||= 'movie';
        p.status ||= 'completed';
      }
      items.push(p);
    }
    return finalize(items);
  }

  // No title column: each column is a section ("COMPLETED", "DROPPED", "MOVIE"...)
  for (let c = 0; c < width; c++) {
    if (roles[c] === 'skip') continue;
    const h = header[c] || '';
    const hp = h ? parseLine(h) : null;
    const ctx = {
      status: hp?.header ? hp.status : statusIn(h),
      kind: (hp?.header ? hp.kind : kindIn(h)) || globalCtx.kind,
      episodes: hp?.episodes ?? null,
      seasons: hp?.seasons ?? null,
      pct: hp?.pct ?? null,
    };
    if (!ctx.status && globalCtx.status) ctx.status = globalCtx.status;
    if (hp?.header && hp.kind === 'movie') ctx.kind = 'movie';
    const startRows = hp && !hp.header && h ? [h] : [];
    for (const v of startRows.concat(columnValues(c).map(cellText))) {
      if (!v) continue;
      const p = parseLine(v, ctx);
      if (!p || p.header) continue;
      items.push(p);
    }
  }
  return finalize(items);
}

/* ---------------- MyAnimeList export ---------------- */

export function extractFromMal(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = [...doc.getElementsByTagName('anime')];
  if (!nodes.length) throw new Error('No anime found in that file.');
  const get = (n, tag) => n.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const MAL = { watching: 'watching', 1: 'watching', completed: 'completed', 2: 'completed', 'on-hold': 'on_hold', 3: 'on_hold', dropped: 'dropped', 4: 'dropped', 'plan to watch': 'plan', 6: 'plan' };
  return finalize(
    nodes.map((n) => ({
      id: nextId(),
      raw: get(n, 'series_title'),
      q: get(n, 'series_title'),
      year: null,
      kind: 'anime',
      status: MAL[lc(get(n, 'my_status'))] || 'plan',
      episodes: parseInt(get(n, 'my_watched_episodes'), 10) || null,
      seasons: null,
      season: null,
      episode: null,
      pct: null,
      rating: parseInt(get(n, 'my_score'), 10) || null,
    }))
  );
}

/* ---------------- Trakt and Simkl (JSON) ---------------- */

const TRAKT_STATUS = { completed: 'completed', watching: 'watching', plantowatch: 'plan', hold: 'on_hold', dropped: 'dropped', notinteresting: 'dropped' };
function fromIds(obj, kind) {
  const ids = obj?.ids || {};
  return {
    id: nextId(),
    raw: `${obj?.title || 'Untitled'}${obj?.year ? ` (${obj.year})` : ''}`,
    q: obj?.title || '',
    year: obj?.year || null,
    kind,
    tmdbId: ids.tmdb ? String(ids.tmdb) : null,
    tmdbType: kind === 'movie' ? 'movie' : 'tv',
    imdbId: ids.imdb || null,
    status: null, episodes: null, seasons: null, season: null, episode: null, pct: null, rating: null,
  };
}
/** Trakt export files (watched, watchlist, ratings) or a Simkl backup. Returns null if it's neither. */
export function extractFromJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const out = [];
  const arr = Array.isArray(data) ? data : null;
  if (arr && arr.some((x) => x.movie || x.show)) {
    for (const x of arr) {
      const kind = x.movie ? 'movie' : 'tv';
      const it = fromIds(x.movie || x.show, kind);
      if (x.rating) it.rating = Math.min(10, Number(x.rating));
      if (x.listed_at && !x.plays && !x.last_watched_at && !x.rating) it.status = 'plan';
      if (x.last_watched_at) it.watchedOn = String(x.last_watched_at).slice(0, 10);
      if (x.plays > 1) it.rewatches = x.plays - 1;
      if (x.seasons?.length) {
        const s = [...x.seasons].filter((y) => y.number > 0).sort((a, b) => b.number - a.number)[0];
        if (s) {
          it.season = s.number;
          it.episode = Math.max(...s.episodes.map((e) => e.number));
          it.status = 'watching';
        }
      } else if (x.plays || x.last_watched_at) it.status = 'completed';
      if (!it.status && x.rating) it.status = 'completed';
      out.push(it);
    }
    return finalize(out);
  }
  if (data && (data.shows || data.movies || data.anime)) {
    for (const [list, kind] of [[data.movies, 'movie'], [data.shows, 'tv'], [data.anime, 'anime']]) {
      for (const x of list || []) {
        const obj = x.movie || x.show || x.anime || x;
        const it = fromIds(obj, kind);
        it.status = TRAKT_STATUS[x.status] || (x.status ? 'completed' : null);
        if (x.user_rating) it.rating = Number(x.user_rating);
        if (x.watched_episodes_count != null && kind !== 'movie') it.episodes = Number(x.watched_episodes_count) || null;
        if (x.last_watched_at) it.watchedOn = String(x.last_watched_at).slice(0, 10);
        out.push(it);
      }
    }
    return finalize(out);
  }
  return null;
}

/* ---------------- Files ---------------- */

export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (/\.pdf$/.test(name)) throw new Error("PDFs can't be read yet. Open the PDF, select all the text, copy it, and paste it here instead.");
  if (/\.doc$/.test(name)) throw new Error('Old .doc files can\'t be read. In Word, choose File > Save As > Word Document (.docx), then add that file.');
  if (/\.(png|jpe?g|heic|webp|gif)$/.test(name)) throw new Error("Photos can't be read yet. Type or paste the titles instead.");

  if (/\.(xml|gz)$/.test(name)) {
    let text;
    if (name.endsWith('.gz')) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .gz files. Unzip it first, then add the .xml file.');
      text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else text = await file.text();
    if (/<myanimelist|<anime>/i.test(text)) return extractFromMal(text);
    return extractFromText(text.replace(/<[^>]+>/g, '\n'));
  }

  if (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/.test(name)) {
    const XLSX = await import('xlsx');
    const lib = XLSX.read ? XLSX : XLSX.default;
    const wb = /\.(csv|tsv)$/.test(name) ? lib.read(await file.text(), { type: 'string', raw: true }) : lib.read(await file.arrayBuffer(), { type: 'array' });
    const all = [];
    for (const sheetName of wb.SheetNames) {
      const rows = lib.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
      all.push(...extractFromRows(rows));
    }
    return finalize(all);
  }

  if (/\.docx$/.test(name)) {
    const mod = await import('mammoth');
    const mammoth = mod.extractRawText ? mod : mod.default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return extractFromText(value);
  }

  // Anything else that is text (txt, md, rtf, json, Google Docs exported as .txt)
  const text = await file.text();
  if (/\.json$/.test(name) || /^\s*[[{]/.test(text)) {
    const fromJson = extractFromJson(text);
    if (fromJson) return fromJson;
  }
  if (/\.rtf$/.test(name)) return extractFromText(text.replace(/\\par[d]?/g, '\n').replace(/\{\\[^}]*\}|\\[a-z]+\d* ?|[{}]/g, ''));
  return extractFromText(text);
}
