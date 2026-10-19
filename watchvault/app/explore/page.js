'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BROWSE_SORTS, BROWSE_TYPES, bestInLanguage, browseTitles, newShelves, similarTitles, tmdb, normalizeTmdb } from '@/lib/catalog';
import { DECADES, MOVIE_GENRES, TV_GENRES, languageName } from '@/lib/categories';
import { useEntries, hiddenCategories, viewMemory } from '@/lib/store';
import Shelf from '@/components/Shelf';
import { TitleTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';

const TABS = [
  { id: 'foryou', label: 'For you' },
  { id: 'browse', label: 'Tick off' },
  { id: 'new', label: 'New' },
];

export default function ExplorePage() {
  const [tab, setTab] = useState(viewMemory.get('explore')?.tab || 'foryou');
  const [round, setRound] = useState(0);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, []);
  useEffect(() => {
    viewMemory.set('explore', { ...(viewMemory.get('explore') || {}), tab });
  }, [tab]);

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Explore</h1>
          <p className="muted">
            {tab === 'foryou'
              ? 'Picked from what you rate highest. Tick anything you have already seen.'
              : tab === 'browse'
                ? 'The best-known titles by year, decade and genre. Tick everything you have seen.'
                : 'Fresh releases, updated every day.'}
          </p>
        </div>
        <div className="row">
        <button className="btn sm" onClick={() => setRound((r) => r + 1)} title="Show fresh titles">
          <Icon.Refresh width={16} height={16} /> Refresh
        </button>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab-btn ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        </div>
      </header>
      {tab === 'foryou' && <ForYou key={`f${round}`} round={round} />}
      {tab === 'browse' && <Browse key={`b${round}`} />}
      {tab === 'new' && <New key={`n${round}`} />}
    </>
  );
}

function ForYou({ round = 0 }) {
  const { entries, profile } = useEntries();
  const hidden = hiddenCategories(profile);

  // Rows are chosen once per visit, so ticking titles never reshuffles the page.
  // Next time you open Explore, they reflect what you just added.
  const plan = useRef(null);
  if (!plan.current && entries) plan.current = buildPlan(entries, hidden, round);
  const rows = plan.current || { seeds: [], languages: [] };

  return (
    <>
      {rows.seeds.map(({ e, load }) => (
        <Shelf key={e.id} title={`Because you watched ${e.title}`} load={load} hideAdded />
      ))}
      {rows.languages.map(({ code, media, load }) => (
        <Shelf key={code + media} title={`Best-loved ${languageName(code)} ${media === 'movie' ? 'films' : 'series'}`} subtitle="You watch a lot in this language" load={load} hideAdded />
      ))}
      <Shelf title="Popular this week" load={rows.trending || (() => Promise.resolve([]))} hideAdded />
    </>
  );
}

function buildPlan(entries, hidden, round = 0) {
  const ok = (i) => !hidden.has(i.category);
  const pool = entries.filter((e) => e.source === 'tmdb' && e.status !== 'plan' && e.status !== 'dropped' && ok(e));
  const recent = [...pool].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const loved = [...pool].filter((e) => e.rating != null).sort((a, b) => b.rating - a.rating);
  // Refresh picks different titles to base rows on, and the next page of suggestions.
  const shuffled = round ? [...pool].sort(() => Math.random() - 0.5) : [];
  const seeds = [];
  for (const e of round ? shuffled : [...recent.slice(0, 3), ...loved.slice(0, 3), ...recent.slice(3)]) {
    if (seeds.length >= 6) break;
    if (!seeds.includes(e)) seeds.push(e);
  }

  // Languages other than English that you watch often
  const counts = {};
  for (const e of pool) {
    if (!e.original_language || e.original_language === 'en') continue;
    const media = e.media_type === 'movie' ? 'movie' : 'tv';
    const k = `${e.original_language}|${media}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  const languages = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => {
      const [code, media] = k.split('|');
      return { code, media, load: () => bestInLanguage(media, code, (round % 4) + 1).then((l) => l.filter(ok)) };
    })
    .filter((l) => !(l.code === 'ja' && l.media === 'tv')); // anime has its own rows

  return {
    seeds: seeds.map((e) => ({
      e,
      load: () => similarTitles(e.media_type, e.source_id, { language: e.original_language, genres: e.genres || [], page: (round % 2) + 1 }).then((l) => l.filter(ok)),
    })),
    languages,
    trending: () =>
      tmdb(round % 2 ? 'trending/all/day' : 'trending/all/week', { page: String((round % 3) + 1) }).then((d) =>
        (d.results || []).filter((r) => r.media_type !== 'person').map((r) => normalizeTmdb(r)).filter((i) => i.poster && ok(i))
      ),
  };
}

function Browse() {
  const { lookup, profile } = useEntries();
  const hidden = hiddenCategories(profile);
  const mem = viewMemory.get('browse') || {};
  const types = BROWSE_TYPES.filter((t) => !hidden.has(t.category || t.id));
  const [typeId, setTypeId] = useState(mem.typeId || types[0]?.id || 'movies');
  const [when, setWhen] = useState(mem.when || '');
  const [genre, setGenre] = useState(mem.genre || '');
  const [sort, setSort] = useState(mem.sort || 'known');
  const [hideSeen, setHideSeen] = useState(mem.hideSeen ?? true);
  const [pages, setPages] = useState({ items: [], page: 0, total: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const type = BROWSE_TYPES.find((t) => t.id === typeId) || BROWSE_TYPES[0];
  const genres = type.media === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const year = /^\d{4}$/.test(when) ? when : null;
  const decade = /^\d{4}s$/.test(when) ? when.slice(0, 4) : null;

  useEffect(() => {
    viewMemory.set('browse', { typeId, when, genre, sort, hideSeen });
  }, [typeId, when, genre, sort, hideSeen]);

  // Titles already in your list are hidden as each page loads. Ones you tick now stay
  // on screen with a check, so the grid doesn't jump around while you work through it.
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const seenAtLoad = useRef(new Set());

  const load = useCallback(
    async (page) => {
      setBusy(true);
      setError(null);
      try {
        const r = await browseTitles({ typeId, year, decade, genre, sort, page });
        if (page === 1) seenAtLoad.current = new Set();
        for (const i of r.items) if (lookupRef.current(i)) seenAtLoad.current.add(`${i.mediaType}:${i.sourceId}`);
        setPages((p) => ({ items: page === 1 ? r.items : p.items.concat(r.items), page, total: r.totalPages }));
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [typeId, year, decade, genre, sort]
  );

  useEffect(() => {
    setPages({ items: [], page: 0, total: 1 });
    load(1);
  }, [load]);

  // Keep the grid full when most of a page is already in your list.
  const shown = pages.items.filter((i, idx, arr) => arr.findIndex((x) => x.sourceId === i.sourceId) === idx && (!hideSeen || !seenAtLoad.current.has(`${i.mediaType}:${i.sourceId}`)));
  useEffect(() => {
    if (!busy && hideSeen && pages.page > 0 && pages.page < pages.total && pages.page < 10 && shown.length < 12) load(pages.page + 1);
  }, [busy, hideSeen, pages.page, pages.total, shown.length, load]);

  const years = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <div className="stack">
        <div className="chips">
          {types.map((t) => (
            <button key={t.id} className={`chip ${typeId === t.id ? 'on' : ''}`} onClick={() => (setTypeId(t.id), setGenre(''))}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <select id="browse-when" className="select" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Year or decade">
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
          <select id="browse-genre" className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
            <option value="">Every genre</option>
            {Object.entries(genres)
              .filter(([id]) => !(type.params.with_genres === '16' && id === '16'))
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
          <select id="browse-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {BROWSE_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="row small">
            <span className="toggle">
              <input id="hide-seen" type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} />
              <span />
            </span>
            Hide what&apos;s in my list
          </label>
        </div>
      </div>

      {error && <p className="notice error">{error}</p>}

      <div className="grid-posters">
        {shown.map((i) => (
          <TitleTile key={`${i.mediaType}-${i.sourceId}`} item={i} />
        ))}
        {busy && Array.from({ length: 12 }, (_, i) => <div key={`s${i}`} className="skeleton" />)}
      </div>

      {!busy && pages.page < pages.total && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => load(pages.page + 1)}>
            Show more
          </button>
        </div>
      )}
      {!busy && !shown.length && !error && <p className="muted">You have seen everything here. Try another year or genre.</p>}
    </>
  );
}

function New() {
  const { profile } = useEntries();
  const hidden = hiddenCategories(profile);
  const [shelves] = useState(newShelves);
  return shelves.filter((s) => !hidden.has(s.category)).map((s) => <Shelf key={s.id} title={s.title} load={s.load} />);
}
