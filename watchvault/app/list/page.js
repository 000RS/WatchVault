'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries, updateMany, removeEntries, restoreScroll, viewMemory } from '@/lib/store';
import { CATEGORIES, STATUSES, languageName } from '@/lib/categories';
import { COUNTRIES } from '@/components/SearchResults';
import { progressFor, toCsv } from '@/lib/list';
import { EntryTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';
import LinkAnimeBanner from '@/components/LinkAnimeBanner';
import TidyUp from '@/components/TidyUp';

const SORTS = [
  { id: 'updated', label: 'Recently changed' },
  { id: 'added', label: 'Recently added' },
  { id: 'title', label: 'Title A to Z' },
  { id: 'rating', label: 'Your rating' },
  { id: 'year', label: 'Newest release' },
  { id: 'known', label: 'Best known' },
  { id: 'genre', label: 'Grouped by genre' },
  { id: 'language', label: 'Grouped by language' },
  { id: 'decade', label: 'Grouped by decade' },
  { id: 'tmdb', label: 'TMDB rating' },
  { id: 'runtime', label: 'Shortest first' },
  { id: 'rewatched', label: 'Most rewatched' },
];
const COUNTRY_NAME = Object.fromEntries(COUNTRIES);
const decadeOf = (y) => (y ? `${Math.floor(y / 10) * 10}s` : 'Unknown');

const MEMORY_KEY = 'list';

export default function ListPage() {
  const { entries, loading, error, refreshing } = useEntries();
  const remembered = viewMemory.get(MEMORY_KEY) || {};
  const [category, setCategory] = useState(remembered.category || 'all');
  const [status, setStatus] = useState(remembered.status || 'all');
  const [sort, setSort] = useState(remembered.sort || 'updated');
  const [q, setQ] = useState(remembered.q || '');
  const [fx, setFx] = useState(remembered.fx || { genre: '', language: '', country: '', decade: '', minRating: '', tag: '' });
  const [moreOpen, setMoreOpen] = useState(Object.values(remembered.fx || {}).some(Boolean));
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Remember filters and scroll so coming back from a title lands you where you were.
  useEffect(() => {
    viewMemory.set(MEMORY_KEY, { ...(viewMemory.get(MEMORY_KEY) || {}), category, status, sort, q, fx });
  }, [category, status, sort, q, fx]);
  useEffect(() => {
    const save = () => document.querySelector('[data-mylist]') && viewMemory.set(MEMORY_KEY, { ...(viewMemory.get(MEMORY_KEY) || {}), scroll: window.scrollY });
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);
  const ready = Boolean(entries);
  useLayoutEffect(() => {
    if (ready) return restoreScroll(remembered.scroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const counts = useMemo(() => {
    const byCat = {};
    const byStatus = {};
    for (const e of entries || []) {
      byCat[e.category] = (byCat[e.category] || 0) + 1;
      if (category === 'all' || e.category === category) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }
    return { byCat, byStatus };
  }, [entries, category]);

  // Values present in your list, for the extra filters.
  const facets = useMemo(() => {
    const g = new Map(), l = new Map(), c = new Map(), d = new Map(), t = new Map();
    const inc = (m, k) => k && m.set(k, (m.get(k) || 0) + 1);
    for (const e of entries || []) {
      for (const x of e.genres || []) inc(g, x);
      inc(l, e.original_language);
      inc(c, e.origin_country);
      inc(d, e.year ? decadeOf(e.year) : null);
      for (const x of e.tags || []) inc(t, x);
    }
    const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { genres: sorted(g), languages: sorted(l), countries: sorted(c), decades: [...d.entries()].sort((a, b) => b[0].localeCompare(a[0])), tags: sorted(t) };
  }, [entries]);
  const setFilter = (k) => (e) => setFx((x) => ({ ...x, [k]: e.target.value }));
  const activeFx = Object.values(fx).filter(Boolean).length;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (entries || []).filter(
      (e) =>
        (category === 'all' || e.category === category) &&
        (status === 'all' || e.status === status) &&
        (!needle || e.title.toLowerCase().includes(needle) || (e.original_title || '').toLowerCase().includes(needle) || (e.tags || []).some((t) => t.includes(needle))) &&
        (!fx.genre || (e.genres || []).includes(fx.genre)) &&
        (!fx.language || e.original_language === fx.language) &&
        (!fx.country || e.origin_country === fx.country) &&
        (!fx.decade || decadeOf(e.year) === fx.decade) &&
        (!fx.minRating || (e.rating ?? 0) >= Number(fx.minRating)) &&
        (!fx.tag || (e.tags || []).includes(fx.tag))
    );
    const by = {
      updated: (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
      added: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      title: (a, b) => a.title.localeCompare(b.title),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      known: (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
      tmdb: (a, b) => (b.tmdb_rating ?? -1) - (a.tmdb_rating ?? -1),
      runtime: (a, b) => (a.runtime ?? 999) * (a.total_episodes || 1) - (b.runtime ?? 999) * (b.total_episodes || 1),
      rewatched: (a, b) => (b.rewatch_count ?? 0) - (a.rewatch_count ?? 0) || (b.rating ?? -1) - (a.rating ?? -1),
    };
    // Grouped sorts order by rating inside each group.
    const inner = (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.popularity ?? 0) - (a.popularity ?? 0);
    return list.sort(by[sort] || inner);
  }, [entries, category, status, sort, q, fx]);

  // Grouped views: a title with several genres shows under each, like a streaming app.
  const groups = useMemo(() => {
    if (!['genre', 'language', 'decade'].includes(sort)) return null;
    const m = new Map();
    const put = (k, e) => m.set(k, [...(m.get(k) || []), e]);
    for (const e of shown) {
      if (sort === 'genre') (e.genres?.length ? e.genres.slice(0, 3) : ['Other']).forEach((g) => put(g, e));
      else if (sort === 'language') put(e.original_language ? languageName(e.original_language) : 'Unknown', e);
      else put(decadeOf(e.year), e);
    }
    const arr = [...m.entries()];
    return sort === 'decade' ? arr.sort((a, b) => b[0].localeCompare(a[0])) : arr.sort((a, b) => b[1].length - a[1].length);
  }, [shown, sort]);

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function bulk(patchOrFn, label) {
    const ids = [...selected];
    try {
      if (typeof patchOrFn === 'function') {
        // Status changes recompute progress per title (e.g. Completed fills every episode)
        const groups = new Map();
        for (const e of entries.filter((x) => selected.has(x.id))) {
          const p = patchOrFn(e);
          const k = JSON.stringify(p);
          groups.set(k, [...(groups.get(k) || []), e.id]);
        }
        for (const [k, gids] of groups) await updateMany(gids, JSON.parse(k));
      } else await updateMany(ids, patchOrFn);
      toast(`${ids.length} ${ids.length === 1 ? 'title' : 'titles'} ${label}`);
      setSelected(new Set());
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(entries || [])], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `watchvault-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error && !entries) return <p className="notice error">{error}</p>;
  if (loading)
    return (
      <div className="grid-posters">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );

  if (!entries.length)
    return (
      <div className="empty">
        <h1 className="h-page">Nothing here yet</h1>
        <p className="lede">Import a list you already keep, or tick titles off in Explore.</p>
        <div className="row">
          <Link href="/import" className="btn primary">
            Import a list
          </Link>
          <Link href="/explore" className="btn">
            Explore titles
          </Link>
        </div>
      </div>
    );

  const used = CATEGORIES.filter((c) => counts.byCat[c.id]);

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">My List</h1>
          <p className="muted">
            {entries.length.toLocaleString()} titles{refreshing ? ', syncing…' : ''}
          </p>
        </div>
        <div className="row">
          <button className={`btn sm ${selecting ? 'primary' : ''}`} onClick={() => (setSelecting(!selecting), setSelected(new Set()))}>
            <Icon.Select width={16} height={16} />
            {selecting ? 'Done' : 'Select'}
          </button>
          <button className="btn sm" onClick={downloadCsv}>
            <Icon.Download width={16} height={16} /> CSV
          </button>
        </div>
      </header>

      <LinkAnimeBanner />
      <TidyUp />

      <div className="stack">
        <div className="chips" aria-label="Shelf">
          <button className={`chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')}>
            Everything <span className="count">{entries.length}</span>
          </button>
          {used.map((c) => (
            <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
              {c.label} <span className="count">{counts.byCat[c.id]}</span>
            </button>
          ))}
        </div>
        <div className="chips" aria-label="Status">
          <button className={`chip ${status === 'all' ? 'on' : ''}`} onClick={() => setStatus('all')}>
            Any status
          </button>
          {STATUSES.map((s) => (
            <button key={s.id} className={`chip ${status === s.id ? 'on' : ''}`} onClick={() => setStatus(s.id)}>
              <span className={`dot st-${s.id}`} />
              {s.label} <span className="count">{counts.byStatus[s.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <input id="list-filter" className="input" placeholder="Find in your list" value={q} onChange={(e) => setQ(e.target.value)} />
          <select id="list-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className={`btn sm ${moreOpen ? 'primary' : ''}`} onClick={() => setMoreOpen(!moreOpen)}>
            Filters{activeFx ? ` (${activeFx})` : ''}
          </button>
        </div>
        {moreOpen && (
          <div className="toolbar">
            <select id="lf-genre" className="select" value={fx.genre} onChange={setFilter('genre')} aria-label="Genre">
              <option value="">Any genre</option>
              {facets.genres.map(([g, n]) => (
                <option key={g} value={g}>
                  {g} ({n})
                </option>
              ))}
            </select>
            <select id="lf-language" className="select" value={fx.language} onChange={setFilter('language')} aria-label="Language">
              <option value="">Any language</option>
              {facets.languages.map(([l, n]) => (
                <option key={l} value={l}>
                  {languageName(l)} ({n})
                </option>
              ))}
            </select>
            <select id="lf-country" className="select" value={fx.country} onChange={setFilter('country')} aria-label="Country">
              <option value="">Any country</option>
              {facets.countries.map(([c, n]) => (
                <option key={c} value={c}>
                  {COUNTRY_NAME[c] || c} ({n})
                </option>
              ))}
            </select>
            <select id="lf-decade" className="select" value={fx.decade} onChange={setFilter('decade')} aria-label="Decade">
              <option value="">Any decade</option>
              {facets.decades.map(([d, n]) => (
                <option key={d} value={d}>
                  {d} ({n})
                </option>
              ))}
            </select>
            <select id="lf-rating" className="select" value={fx.minRating} onChange={setFilter('minRating')} aria-label="Your rating">
              <option value="">Any rating</option>
              {[6, 7, 8, 9, 10].map((r) => (
                <option key={r} value={r}>
                  You rated {r}
                  {r < 10 ? '+' : ''}
                </option>
              ))}
            </select>
            {facets.tags.length > 0 && (
              <select id="lf-tag" className="select" value={fx.tag} onChange={setFilter('tag')} aria-label="Tag">
                <option value="">Any tag</option>
                {facets.tags.map(([t, n]) => (
                  <option key={t} value={t}>
                    {t} ({n})
                  </option>
                ))}
              </select>
            )}
            {activeFx > 0 && (
              <button className="btn sm ghost" onClick={() => setFx({ genre: '', language: '', country: '', decade: '', minRating: '', tag: '' })}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="muted">Nothing matches these filters.</p>
      ) : groups ? (
        <div className="stack" data-mylist>
          {groups.map(([name, list]) => (
            <Group key={name} name={name} list={list} selecting={selecting} selected={selected} onToggle={toggle} />
          ))}
        </div>
      ) : (
        <div className="grid-posters" data-mylist>
          {shown.map((e) => (
            <EntryTile key={e.id} entry={e} selecting={selecting} selected={selected.has(e.id)} onToggle={toggle} />
          ))}
        </div>
      )}

      {selecting && (
        <div className="bulkbar" role="toolbar" aria-label="Change selected titles">
          <span className="num">{selected.size} selected</span>
          <button className="btn sm" onClick={() => setSelected(new Set(shown.map((e) => e.id)))}>
            All {shown.length}
          </button>
          {selected.size > 0 && (
            <>
              <select
                aria-label="Set status"
                value=""
                onChange={(ev) => {
                  const st = ev.target.value;
                  if (st) bulk((e) => (st === 'completed' ? progressFor(e, { status: st }) : { status: st }), `marked ${STATUSES.find((s) => s.id === st).label.toLowerCase()}`);
                }}
              >
                <option value="">Set status</option>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Move to shelf"
                value=""
                onChange={(ev) => ev.target.value && bulk({ category: ev.target.value }, 'moved')}
              >
                <option value="">Move to shelf</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                className="btn sm"
                onClick={() => {
                  const tag = window.prompt('Tag to add to the selected titles');
                  const t = tag?.trim().toLowerCase();
                  if (t) bulk((e) => ({ tags: [...new Set([...(e.tags || []), t])] }), `tagged “${t}”`);
                }}
              >
                Add tag
              </button>
              <button
                className="btn sm"
                onClick={async () => {
                  if (!confirmRemove) return setConfirmRemove(true);
                  setConfirmRemove(false);
                  const ids = [...selected];
                  try {
                    await removeEntries(ids);
                    toast(`Removed ${ids.length} ${ids.length === 1 ? 'title' : 'titles'}`);
                    setSelected(new Set());
                  } catch (e) {
                    toast(e.message, { kind: 'error' });
                  }
                }}
              >
                {confirmRemove ? `Remove ${selected.size}?` : 'Remove'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Group({ name, list, selecting, selected, onToggle }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 12);
  return (
    <section className="section">
      <h2 className="h-section">
        {name} <span className="muted small">{list.length}</span>
      </h2>
      <div className="grid-posters">
        {shown.map((e) => (
          <EntryTile key={e.id} entry={e} selecting={selecting} selected={selected.has(e.id)} onToggle={onToggle} />
        ))}
      </div>
      {list.length > shown.length && (
        <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setAll(true)}>
          Show all {list.length}
        </button>
      )}
    </section>
  );
}
