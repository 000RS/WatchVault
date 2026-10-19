'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries, updateMany, removeEntries, viewMemory } from '@/lib/store';
import { CATEGORIES, STATUSES } from '@/lib/categories';
import { progressFor, toCsv } from '@/lib/list';
import { EntryTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';
import LinkAnimeBanner from '@/components/LinkAnimeBanner';

const SORTS = [
  { id: 'updated', label: 'Recently changed' },
  { id: 'added', label: 'Recently added' },
  { id: 'title', label: 'Title A to Z' },
  { id: 'rating', label: 'Your rating' },
  { id: 'year', label: 'Newest release' },
  { id: 'known', label: 'Best known' },
];

const MEMORY_KEY = 'list';

export default function ListPage() {
  const { entries, loading, error, refreshing } = useEntries();
  const remembered = viewMemory.get(MEMORY_KEY) || {};
  const [category, setCategory] = useState(remembered.category || 'all');
  const [status, setStatus] = useState(remembered.status || 'all');
  const [sort, setSort] = useState(remembered.sort || 'updated');
  const [q, setQ] = useState(remembered.q || '');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Remember filters and scroll so coming back from a title lands you where you were.
  useEffect(() => {
    viewMemory.set(MEMORY_KEY, { ...(viewMemory.get(MEMORY_KEY) || {}), category, status, sort, q });
  }, [category, status, sort, q]);
  useEffect(() => {
    const save = () => viewMemory.set(MEMORY_KEY, { ...(viewMemory.get(MEMORY_KEY) || {}), scroll: window.scrollY });
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);
  const ready = Boolean(entries);
  useLayoutEffect(() => {
    if (ready && remembered.scroll) window.scrollTo(0, remembered.scroll);
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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (entries || []).filter(
      (e) =>
        (category === 'all' || e.category === category) &&
        (status === 'all' || e.status === status) &&
        (!needle || e.title.toLowerCase().includes(needle) || (e.original_title || '').toLowerCase().includes(needle))
    );
    const by = {
      updated: (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
      added: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      title: (a, b) => a.title.localeCompare(b.title),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      known: (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
    };
    return list.sort(by[sort]);
  }, [entries, category, status, sort, q]);

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
            Download CSV
          </button>
        </div>
      </header>

      <LinkAnimeBanner />

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
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">Nothing matches these filters.</p>
      ) : (
        <div className="grid-posters">
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
