'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BROWSE_SORTS,
  BROWSE_TYPES,
  LANGUAGES,
  bestInLanguage,
  browseTitles,
  findCompany,
  readFilterWords,
  currentAnimeSeason,
  newShelves,
  normalizeTmdb,
  seasonLabel,
  seasonalAnime,
  shiftSeason,
  searchPeople,
  similarTitles,
  streamingServices,
  tmdb,
} from '@/lib/catalog';
import { DECADES, MOVIE_GENRES, TV_GENRES, genreIdsFor, languageName } from '@/lib/categories';
import { useEntries, hiddenCategories, restoreScroll, viewMemory } from '@/lib/store';
import { tasteGenreIds, tasteProfile } from '@/lib/taste';
import Shelf from '@/components/Shelf';
import { TitleTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';
import AskPanel, { useAiEnabled } from '@/components/Ask';
import SearchResults, { COUNTRIES, EMPTY_FILTERS, SearchFilters, filtersActive } from '@/components/SearchResults';

const TABS = [
  { id: 'foryou', label: 'For you', blurb: 'Rows picked from what you love. Tick anything you have already seen.' },
  { id: 'browse', label: 'Tick off', blurb: 'The best-known titles, filtered your way. Tick everything you have seen.' },
  { id: 'season', label: 'Anime season', blurb: 'Every anime airing this season, most popular first. Step back through past seasons.' },
  { id: 'studios', label: 'Studios & people', blurb: 'Browse by studio, franchise, actor, director or writer.' },
  { id: 'new', label: 'New', blurb: 'Fresh releases, updated every day.' },
  { id: 'ask', label: 'Ask', blurb: 'Tell the guide what you are in the mood for, or how you want to watch a franchise.', ai: true },
];

const MEM = 'explore';

export default function ExplorePage() {
  const mem = viewMemory.get(MEM) || {};
  const [tab, setTab] = useState(mem.tab || 'foryou');
  const [round, setRound] = useState(mem.round || 0);
  const [draft, setDraft] = useState(mem.q || '');
  const [q, setQ] = useState(mem.q || '');
  const [sf, setSf] = useState(mem.sf || EMPTY_FILTERS);
  const searchRef = useRef(null);
  const ai = useAiEnabled();

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    if (sp.get('q')) submit(sp.get('q'));
    if (sp.get('q') || sp.get('search')) searchRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    viewMemory.set(MEM, { ...(viewMemory.get(MEM) || {}), q, sf });
  }, [q, sf]);
  // Typing searches by itself after a pause (2+ letters); Search or Enter runs it straight away, even for one letter.
  useEffect(() => {
    const t = draft.trim();
    if (t === q.trim()) return;
    if (!t) return setQ('');
    if (t.length < 2) return;
    const timer = setTimeout(() => setQ(t), 450);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(text) {
    const t = String(text ?? draft).trim();
    // "punjabi movies", "korean dramas 2023", "telugu action films" become filters.
    const words = readFilterWords(t);
    if (words) {
      setSf({ ...EMPTY_FILTERS, ...words });
      setQ('');
      setDraft('');
      return;
    }
    setDraft(t);
    setQ(t);
  }
  const searching = q.trim().length > 0 || filtersActive(sf);
  useEffect(() => {
    viewMemory.set(MEM, { ...(viewMemory.get(MEM) || {}), tab, round });
  }, [tab, round]);

  // Scroll position per tab, so coming back from a full page lands where you were.
  useEffect(() => {
    // Only record while this page is on screen; leaving the page clamps the scroll and must not overwrite it.
    const save = () => document.querySelector(`[data-explore="${tab}"]`) && viewMemory.set(`${MEM}:scroll:${tab}`, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [tab]);

  const tabs = TABS.filter((t) => !t.ai || ai);
  const current = tabs.find((t) => t.id === tab) || tabs[0];

  const searchBar = (
    <div className="search-block">
      <form className="search-bar" role="search" onSubmit={(e) => (e.preventDefault(), submit(), searchRef.current?.blur())}>
        <Icon.Search />
        <input
          ref={searchRef}
          id="explore-search"
          className="search-bar-input"
          type="search"
          placeholder="Search titles or actors"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        {draft && (
          <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => (setDraft(''), setQ(''), searchRef.current?.focus())}>
            <Icon.Close width={16} height={16} />
          </button>
        )}
        <button className="btn primary search-go">Search</button>
      </form>
      <SearchFilters f={sf} onChange={setSf} />
      {searching && (
        <button type="button" className="as-text-link small" style={{ justifySelf: 'start' }} onClick={() => (setDraft(''), setQ(''), setSf(EMPTY_FILTERS))}>
          Back to Explore
        </button>
      )}
    </div>
  );

  if (searching)
    return (
      <>
        <header className="page-head">
          <div className="head-text">
            <h1 className="h-page">Explore</h1>
          </div>
        </header>
        {searchBar}
        <div className="page-enter" data-explore="search" style={{ gap: 'inherit' }}>
          <SearchResults q={q} f={sf} onPick={(t) => (setDraft(t), setQ(t))} />
        </div>
      </>
    );

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Explore</h1>
        </div>
      </header>
      {searchBar}
      <div className="explore-nav">
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={current.id === t.id} className={`tab-btn ${current.id === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {!['ask', 'studios', 'season'].includes(current.id) && (
          <button className="btn sm" onClick={() => (setRound((r) => r + 1), window.scrollTo({ top: 0 }))} title="Show fresh titles">
            <Icon.Refresh width={16} height={16} /> Refresh
          </button>
        )}
      </div>
      <p className="muted">{current.blurb}</p>
      <div className="page-enter" data-explore={current.id} style={{ gap: 'inherit' }}>
        {current.id === 'foryou' && <ForYou key={`f${round}`} round={round} />}
        {current.id === 'browse' && <Browse key={`b${round}`} round={round} />}
        {current.id === 'season' && <Season />}
        {current.id === 'studios' && <Studios />}
        {current.id === 'new' && <New key={`n${round}`} />}
        {current.id === 'ask' && <AskPanel />}
      </div>
      <RestoreScroll tab={current.id} />
    </>
  );
}

function RestoreScroll({ tab }) {
  useLayoutEffect(() => restoreScroll(viewMemory.get(`${MEM}:scroll:${tab}`)), [tab]);
  return null;
}

/* ---------------- For you: Netflix-style rows ---------------- */

const plans = new Map(); // round → rows, kept while the app is open so going back shows the same rows

function ForYou({ round = 0 }) {
  const { entries, profile } = useEntries();
  const hidden = hiddenCategories(profile);
  const plan = useRef(plans.get(round) || null);
  if (!plan.current && entries) {
    plan.current = buildPlan(entries, hidden, round);
    plans.set(round, plan.current);
  }
  if (!entries) return <div className="skeleton" style={{ height: 240, aspectRatio: 'auto' }} />;
  const rows = plan.current;
  if (!rows.rows.length)
    return (
      <div className="empty">
        <p className="lede">Add a few titles you have watched and rows picked for you appear here.</p>
        <Link href="/import" className="btn primary">
          Import a list
        </Link>
      </div>
    );
  return rows.rows.map((r) => <Shelf key={r.key} title={r.title} subtitle={r.subtitle} load={r.load} hideAdded />);
}

function buildPlan(entries, hidden, round) {
  const ok = (i) => !hidden.has(i.category);
  const p = tasteProfile(entries, hidden);
  const rows = [];
  const page = String((round % 5) + 1);

  // 1. Top picks: your favourite genres in the medium you watch most
  const topIds = tasteGenreIds(p, p.media, 3);
  if (topIds.length) {
    rows.push({
      key: 'top',
      title: 'Top picks for you',
      subtitle: `Built from your love of ${p.genres.slice(0, 2).map((g) => g.name.toLowerCase()).join(' and ')}`,
      load: () =>
        tmdb(`discover/${p.media}`, { with_genres: topIds.join('|'), sort_by: 'vote_count.desc', page, without_genres: p.media === 'tv' ? '10767,10763,10764' : '' }).then((d) =>
          (d.results || []).map((r) => normalizeTmdb(r, p.media)).filter((i) => i.poster && ok(i))
        ),
    });
  }

  // 2. Because you watched …: a few recent or favourite titles, different each refresh
  const seedsPool = round ? [...p.loved].sort(() => Math.random() - 0.5) : p.loved;
  const seeds = seedsPool.slice(0, 4);
  const rowsBy = seeds.map((e) => ({
    key: `seed${e.id}`,
    title: `Because you watched ${e.title}`,
    load: () => similarTitles(e.media_type, e.source_id, { language: e.original_language, genres: e.genres || [], page: (round % 2) + 1 }).then((l) => l.filter(ok)),
  }));

  // 3. Because you love <genre>
  const genreRows = p.genres.slice(round % 2, (round % 2) + 3).map((g) => {
    const ids = genreIdsFor([g.name], g.media);
    return {
      key: `g${g.name}`,
      title: `Because you love ${g.name.toLowerCase()}`,
      subtitle: g.media === 'movie' ? 'Films' : 'Series',
      load: () =>
        ids.length
          ? tmdb(`discover/${g.media}`, { with_genres: ids.join(','), sort_by: 'vote_count.desc', page }).then((d) =>
              (d.results || []).map((r) => normalizeTmdb(r, g.media)).filter((i) => i.poster && ok(i))
            )
          : Promise.resolve([]),
    };
  });

  // 4. Languages you watch a lot in
  const langRows = p.languages
    .filter((l) => !(l.code === 'ja' && l.media === 'tv'))
    .slice(0, 2)
    .map((l) => ({
      key: `l${l.code}${l.media}`,
      title: `Best-loved ${languageName(l.code)} ${l.media === 'movie' ? 'films' : 'series'}`,
      subtitle: 'You watch a lot in this language',
      load: () => bestInLanguage(l.media, l.code, (round % 4) + 1).then((x) => x.filter(ok)),
    }));

  // 5. Hidden gems in your top genre
  const gem = p.genres[0];
  const gemIds = gem ? genreIdsFor([gem.name], gem.media) : [];
  const gemRow = gemIds.length
    ? [
        {
          key: 'gems',
          title: `Hidden gems: ${gem.name.toLowerCase()}`,
          subtitle: 'Loved by the few who found them',
          load: () =>
            tmdb(`discover/${gem.media}`, { with_genres: gemIds.join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '60', 'vote_count.lte': '900', page }).then((d) =>
              (d.results || []).map((r) => normalizeTmdb(r, gem.media)).filter((i) => i.poster && ok(i))
            ),
        },
      ]
    : [];

  // Interleave so the page mixes "because you watched" with genre rows, like a streaming home page.
  const mixed = [];
  for (let i = 0; i < Math.max(rowsBy.length, genreRows.length); i++) {
    if (rowsBy[i]) mixed.push(rowsBy[i]);
    if (genreRows[i]) mixed.push(genreRows[i]);
    if (i === 0) mixed.push(...langRows);
  }
  rows.push(...mixed, ...gemRow);
  rows.push({
    key: 'trend',
    title: 'Popular this week',
    load: () =>
      tmdb(round % 2 ? 'trending/all/day' : 'trending/all/week', { page: String((round % 3) + 1) }).then((d) =>
        (d.results || []).filter((r) => r.media_type !== 'person').map((r) => normalizeTmdb(r)).filter((i) => i.poster && ok(i))
      ),
  });
  return { rows: p.size ? rows : [] };
}

/* ---------------- Tick off: filtered grid that remembers where you were ---------------- */

const FILTER_KEYS = ['typeId', 'when', 'genre', 'sort', 'language', 'minRating', 'provider', 'country', 'runtime', 'mine'];
const gridCache = new Map(); // filters → { items, page, total }

function Browse({ round = 0 }) {
  const { entries, lookup, profile } = useEntries();
  const hidden = hiddenCategories(profile);
  const saved = viewMemory.get('browse') || {};
  const types = BROWSE_TYPES.filter((t) => !hidden.has(t.category));
  const [f, setF] = useState(() => ({
    typeId: saved.typeId || types[0]?.id || 'movies',
    when: saved.when || '',
    genre: saved.genre || '',
    sort: saved.sort || 'known',
    language: saved.language || '',
    minRating: saved.minRating || '',
    provider: saved.provider || '',
    country: saved.country || '',
    runtime: saved.runtime || '',
    mine: saved.mine || '',
  }));
  const [hideSeen, setHideSeen] = useState(saved.hideSeen ?? true);
  const [moreFilters, setMoreFilters] = useState(Boolean(saved.language || saved.minRating || saved.provider || saved.country || saved.runtime));
  const myServices = profile?.services || [];
  const [services, setServices] = useState([]);
  const type = BROWSE_TYPES.find((t) => t.id === f.typeId) || BROWSE_TYPES[0];
  // Refresh starts further into the results each time, so the grid is genuinely new.
  const startPage = 1 + ((round * 3) % 15);
  const key = JSON.stringify([...FILTER_KEYS.map((k) => f[k]), startPage]);
  const [grid, setGrid] = useState(() => gridCache.get(key) || { items: [], page: 0, total: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const seenAtLoad = useRef(new Set());
  const taste = useRef(null);
  if (!taste.current && entries) taste.current = tasteProfile(entries, hidden);

  useEffect(() => {
    viewMemory.set('browse', { ...f, hideSeen });
  }, [f, hideSeen]);

  useEffect(() => {
    streamingServices(type.media).then(setServices).catch(() => setServices([]));
  }, [type.media]);

  const year = /^\d{4}$/.test(f.when) ? f.when : null;
  const decade = /^\d{4}s$/.test(f.when) ? f.when.slice(0, 4) : null;

  const load = useCallback(
    async (page) => {
      setBusy(true);
      setError(null);
      try {
        const tasteGenres = f.sort === 'taste' && taste.current ? tasteGenreIds(taste.current, type.media, 3) : [];
        const r = await browseTitles({ ...f, provider: f.mine && myServices.length ? myServices : f.provider, year, decade, page, tasteGenres });
        for (const i of r.items) if (lookupRef.current(i)) seenAtLoad.current.add(`${i.mediaType}:${i.sourceId}`);
        setGrid((g) => {
          const next = { items: page === startPage ? r.items : g.items.concat(r.items), page, total: r.totalPages };
          gridCache.set(key, next);
          return next;
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => {
    const cached = gridCache.get(key);
    if (cached) {
      for (const i of cached.items) if (lookupRef.current(i)) seenAtLoad.current.add(`${i.mediaType}:${i.sourceId}`);
      setGrid(cached);
      return;
    }
    seenAtLoad.current = new Set();
    setGrid({ items: [], page: 0, total: 1 });
    load(startPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = grid.items.filter(
    (i, idx, arr) => arr.findIndex((x) => x.sourceId === i.sourceId && x.mediaType === i.mediaType) === idx && (!hideSeen || !seenAtLoad.current.has(`${i.mediaType}:${i.sourceId}`))
  );
  useEffect(() => {
    if (!busy && hideSeen && grid.page >= startPage && grid.page < grid.total && grid.page < startPage + 8 && shown.length < 12) load(grid.page + 1);
  }, [busy, hideSeen, grid.page, grid.total, shown.length, load, startPage]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'typeId' ? { genre: '', provider: '' } : {}) }));
  const genres = type.media === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const years = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i);
  const activeExtras = [f.language, f.minRating, f.provider, f.country, f.runtime].filter(Boolean).length;

  return (
    <>
      <div className="stack">
        <div className="chips">
          {types.map((t) => (
            <button key={t.id} className={`chip ${f.typeId === t.id ? 'on' : ''}`} onClick={() => set('typeId')({ target: { value: t.id } })}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <select id="browse-sort" className="select" value={f.sort} onChange={set('sort')} aria-label="Sort">
            {BROWSE_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select id="browse-when" className="select" value={f.when} onChange={set('when')} aria-label="Year or decade">
            <option value="">Any year</option>
            <optgroup label="Decades">
              {DECADES.map((d) => (
                <option key={d} value={`${d}s`}>
                  {d}s
                </option>
              ))}
            </optgroup>
            <optgroup label="Years">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </optgroup>
          </select>
          <select id="browse-genre" className="select" value={f.genre} onChange={set('genre')} aria-label="Genre">
            <option value="">Every genre</option>
            {Object.entries(genres)
              .filter(([id]) => id !== '16' && !['10767', '10763', '10764'].includes(id))
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
          <button className={`btn sm ${moreFilters ? 'primary' : ''}`} onClick={() => setMoreFilters(!moreFilters)}>
            More filters{activeExtras ? ` (${activeExtras})` : ''}
          </button>
          <label className="row small">
            <span className="toggle">
              <input id="hide-seen" type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} />
              <span />
            </span>
            Hide what&apos;s in my list
          </label>
          {myServices.length > 0 && (
            <label className="row small">
              <span className="toggle">
                <input id="my-services" type="checkbox" checked={Boolean(f.mine)} onChange={(e) => setF((x) => ({ ...x, mine: e.target.checked ? '1' : '' }))} />
                <span />
              </span>
              On my services
            </label>
          )}
        </div>
        {moreFilters && (
          <div className="toolbar">
            <select id="browse-provider" className="select" value={f.provider} onChange={set('provider')} aria-label="Where to watch">
              <option value="">Any streaming service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  On {s.name}
                </option>
              ))}
            </select>
            <select id="browse-language" className="select" value={f.language} onChange={set('language')} aria-label="Original language">
              <option value="">Any language</option>
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <select id="browse-rating" className="select" value={f.minRating} onChange={set('minRating')} aria-label="Minimum rating">
              <option value="">Any rating</option>
              {[6, 7, 7.5, 8, 8.5].map((r) => (
                <option key={r} value={r}>
                  Rated {r}+
                </option>
              ))}
            </select>
            <select id="browse-country" className="select" value={f.country} onChange={set('country')} aria-label="Country">
              <option value="">Any country</option>
              {COUNTRIES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
            <select id="browse-runtime" className="select" value={f.runtime} onChange={set('runtime')} aria-label={type.media === 'movie' ? 'Length' : 'Episode length'}>
              <option value="">{type.media === 'movie' ? 'Any length' : 'Any episode length'}</option>
              {(type.media === 'movie'
                ? [['short', 'Under 90 min'], ['mid', '90–120 min'], ['long', '2–2½ hours'], ['epic', 'Over 2½ hours']]
                : [['short', 'Episodes under 30 min'], ['mid', '30–60 min episodes'], ['long', 'Hour-long episodes'], ['epic', 'Feature-length episodes']]
              ).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {activeExtras > 0 && (
              <button className="btn sm ghost" onClick={() => setF((x) => ({ ...x, language: '', minRating: '', provider: '', country: '', runtime: '' }))}>
                Clear
              </button>
            )}
          </div>
        )}
        {f.sort === 'taste' && !taste.current?.genres.length && <p className="hint">Add and rate a few titles so we can learn your taste. Until then this shows the best known.</p>}
      </div>

      {error && <p className="notice error">{error}</p>}

      <div className="grid-posters">
        {shown.map((i) => (
          <TitleTile key={`${i.mediaType}-${i.sourceId}`} item={i} />
        ))}
        {busy && Array.from({ length: 12 }, (_, i) => <div key={`s${i}`} className="skeleton" />)}
      </div>

      {!busy && grid.page < grid.total && shown.length > 0 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => load(grid.page + 1)}>
            Show more
          </button>
        </div>
      )}
      {!busy && !shown.length && !error && <p className="muted">Nothing new here. Try Refresh, another year, or fewer filters.</p>}
    </>
  );
}

/* ---------------- Anime season chart ---------------- */

const seasonCache = new Map();

function Season() {
  const { lookup } = useEntries();
  const [s, setS] = useState(() => viewMemory.get('season:pick') || currentAnimeSeason());
  const [format, setFormat] = useState(viewMemory.get('season:format') || 'all');
  const k = `${s.season}${s.year}`;
  const [data, setData] = useState(() => seasonCache.get(k) || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    viewMemory.set('season:pick', s);
    viewMemory.set('season:format', format);
  }, [s, format]);

  useEffect(() => {
    if (seasonCache.get(k)) return setData(seasonCache.get(k));
    setData(null);
    setError(null);
    let live = true;
    (async () => {
      try {
        const a = await seasonalAnime(s, 1);
        const b = a.more ? await seasonalAnime(s, 2) : { items: [] };
        const d = [...a.items, ...b.items];
        seasonCache.set(k, d);
        if (live) setData(d);
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => {
      live = false;
    };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = currentAnimeSeason();
  const isNow = now.season === s.season && now.year === s.year;
  const items = (data || []).filter((i) => (format === 'all' ? true : format === 'movie' ? i.isMovie : !i.isMovie));
  const mine = items.filter((i) => lookup(i)).length;

  return (
    <>
      <div className="toolbar">
        <button className="btn sm" onClick={() => setS(shiftSeason(s, -1))} aria-label="Previous season">
          <Icon.Back width={16} height={16} />
        </button>
        <b className="season-name">{seasonLabel(s)}</b>
        <button className="btn sm" onClick={() => setS(shiftSeason(s, 1))} aria-label="Next season">
          <Icon.Back width={16} height={16} style={{ transform: 'scaleX(-1)' }} />
        </button>
        {!isNow && (
          <button className="btn sm ghost" onClick={() => setS(now)}>
            This season
          </button>
        )}
        <div className="chips">
          {[['all', 'All'], ['tv', 'Series'], ['movie', 'Films']].map(([v, l]) => (
            <button key={v} className={`chip ${format === v ? 'on' : ''}`} onClick={() => setFormat(v)}>
              {l}
            </button>
          ))}
        </div>
        {data && <span className="muted small">{mine ? `${mine} of ${items.length} in your list` : `${items.length} titles`}</span>}
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="grid-posters">
        {items.map((i) => (
          <TitleTile key={i.sourceId} item={i} />
        ))}
        {!data && !error && Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" />)}
      </div>
    </>
  );
}

/* ---------------- Studios, franchises and people ---------------- */

const STUDIOS = [
  { group: 'Franchises & studios', names: ['Marvel Studios', 'DC Studios', 'Lucasfilm', 'Pixar', 'Walt Disney Pictures', 'Warner Bros. Pictures', 'Universal Pictures', 'Paramount Pictures', '20th Century Studios', 'Columbia Pictures', 'Legendary Pictures', 'Lionsgate'] },
  { group: 'Animation', names: ['Studio Ghibli', 'DreamWorks Animation', 'Illumination', 'Walt Disney Animation Studios', 'Sony Pictures Animation', 'Cartoon Network Studios', 'Nickelodeon Animation Studio', 'Aardman'] },
  { group: 'Anime studios', names: ['MAPPA', 'ufotable', 'Kyoto Animation', 'Wit Studio', 'Bones', 'Madhouse', 'Toei Animation', 'Production I.G', 'CloverWorks', 'A-1 Pictures'] },
  { group: 'Indian & Pakistani', names: ['Yash Raj Films', 'Dharma Productions', 'Red Chillies Entertainment', 'T-Series', 'Hombale Films', 'Excel Entertainment', 'Aamir Khan Productions', 'Balaji Telefilms', 'Mythri Movie Makers', 'Hum Network'] },
  { group: 'Korea, Japan, Turkey & more', names: ['Studio Dragon', 'CJ ENM', 'JTBC Studios', 'Toho', 'Ay Yapım', 'Tims & B Productions', 'Gold Coast Studio'] },
  { group: 'Prestige & streaming', names: ['A24', 'Blumhouse Productions', 'HBO', 'Netflix', 'Amazon MGM Studios', 'Apple Studios', 'Searchlight Pictures', 'Neon', 'Focus Features', 'BBC Studios'] },
];

function Studios() {
  const router = useRouter();
  const [q, setQ] = useState(viewMemory.get('people:q') || '');
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    viewMemory.set('people:q', q);
    if (q.trim().length < 2) {
      setPeople([]);
      return;
    }
    const t = setTimeout(() => searchPeople(q.trim()).then(setPeople).catch(() => setPeople([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function openStudio(name) {
    setBusy(name);
    setError(null);
    try {
      const c = await findCompany(name);
      if (!c) throw new Error(`Couldn't find ${name}.`);
      router.push(`/studio/${c.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <>
      <section className="section">
        <h2 className="h-section">Actors, directors and writers</h2>
        <input id="people-search" className="input search-input" placeholder="Search any name, from any country" value={q} onChange={(e) => setQ(e.target.value)} />
        {people.length > 0 && (
          <div className="people-grid">
            {people.slice(0, 18).map((p) => (
              <Link key={p.id} href={`/person/${p.id}`} className="person-card">
                <span className="cast-photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span>{p.name[0]}</span>}</span>
                <span className="person-card-text">
                  <b>{p.name}</b>
                  <span className="muted small">{[p.dept === 'Acting' ? 'Actor' : p.dept, p.knownFor.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {error && <p className="notice error">{error}</p>}

      {STUDIOS.map((g) => (
        <section key={g.group} className="section">
          <h2 className="h-section">{g.group}</h2>
          <div className="studio-grid">
            {g.names.map((n) => (
              <button key={n} className="studio-card" onClick={() => openStudio(n)} disabled={busy === n}>
                <span>{busy === n ? 'Opening…' : n}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="hint">Looking for a franchise in order, like Star Wars or Harry Potter? Open any film in it and tap &quot;See the watch order&quot;.</p>
    </>
  );
}

/* ---------------- New ---------------- */

function New() {
  const { profile } = useEntries();
  const hidden = hiddenCategories(profile);
  const [shelves] = useState(newShelves);
  return shelves.filter((s) => !hidden.has(s.category)).map((s) => <Shelf key={s.id} title={s.title} load={s.load} />);
}
