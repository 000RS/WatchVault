'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useList } from '@/components/useList';
import { EntryCard } from '@/components/PosterCard';
import { CATEGORIES, STATUSES } from '@/lib/categories';
import { nextEpisodePatch, toCsv, updateEntry } from '@/lib/list';

const SORTS = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'rating', label: 'Your rating' },
  { id: 'year', label: 'Newest release' },
];

export default function MyListPage() {
  const { entries, setEntries, error } = useList();
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('updated');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

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
    const sorters = {
      updated: (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
      title: (a, b) => a.title.localeCompare(b.title),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    };
    return list.sort(sorters[sort]);
  }, [entries, category, status, sort, q]);

  async function plusOne(entry) {
    setBusyId(entry.id);
    setActionError(null);
    try {
      const updated = await updateEntry(entry.id, nextEpisodePatch(entry));
      setEntries((list) => list.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
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

  if (error) return <div className="notice error">Couldn&apos;t load your list: {error}</div>;
  if (!entries) return <SkeletonGrid />;

  if (entries.length === 0) {
    return (
      <div className="center">
        <div className="stack" style={{ maxWidth: 440 }}>
          <h1>Your list is empty</h1>
          <p className="muted">
            Search for anything you&apos;ve watched, from anime to Turkish dramas, or bring in your anime list in one go.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href="/search" className="btn primary">Search titles</Link>
            <Link href="/import" className="btn">Import anime list</Link>
          </div>
        </div>
      </div>
    );
  }

  const usedCategories = CATEGORIES.filter((c) => counts.byCat[c.id]);

  return (
    <>
      <div className="spread">
        <div className="stack" style={{ gap: 4 }}>
          <h1>My List</h1>
          <p className="muted small">
            <span className="mono">{entries.length}</span> titles ·{' '}
            <span className="mono">{entries.filter((e) => e.status === 'completed').length}</span> completed ·{' '}
            <span className="mono">{entries.filter((e) => e.status === 'watching').length}</span> watching ·{' '}
            <span className="mono">{entries.filter((e) => e.status === 'plan').length}</span> to watch
          </p>
        </div>
        <button className="btn sm" onClick={downloadCsv}>Download CSV</button>
      </div>

      <div className="stack">
        <div className="chips" role="tablist" aria-label="Category">
          <button className={`chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')}>
            All <span className="count">{entries.length}</span>
          </button>
          {usedCategories.map((c) => (
            <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
              {c.label} <span className="count">{counts.byCat[c.id]}</span>
            </button>
          ))}
        </div>

        <div className="chips" aria-label="Status">
          <button className={`chip ${status === 'all' ? 'on' : ''}`} onClick={() => setStatus('all')}>Any status</button>
          {STATUSES.map((s) => (
            <button key={s.id} className={`chip ${status === s.id ? 'on' : ''}`} onClick={() => setStatus(s.id)}>
              {s.label} <span className="count">{counts.byStatus[s.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="row">
          <input
            id="list-filter"
            className="input"
            style={{ flex: '1 1 220px' }}
            placeholder="Filter your list…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select id="list-sort" className="select" style={{ flex: '0 1 200px' }} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {actionError && <div className="notice error">{actionError}</div>}

      {shown.length === 0 ? (
        <p className="muted">Nothing matches these filters.</p>
      ) : (
        <div className="grid">
          {shown.map((e) => (
            <EntryCard key={e.id} entry={e} onPlusOne={plusOne} busy={busyId === e.id} />
          ))}
        </div>
      )}
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid" aria-label="Loading">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
