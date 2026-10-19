'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchAll } from '@/lib/catalog';
import { useList } from '@/components/useList';
import { TitleCard } from '@/components/PosterCard';
import { CATEGORIES } from '@/lib/categories';

const TYPES = [
  { id: 'all', label: 'Everything' },
  { id: 'anime', label: 'Anime' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'Series & dramas' },
];

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { lookup } = useList();
  const reqId = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      reqId.current++;
      setResult(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchAll(term);
      if (id === reqId.current) {
        setResult(r);
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const shown = useMemo(() => {
    if (!result) return [];
    return result.items.filter((i) => type === 'all' || i.mediaType === type);
  }, [result, type]);

  // Count results per shelf so you can see e.g. how many K-Dramas matched
  const catCounts = useMemo(() => {
    const m = {};
    for (const i of shown) m[i.category] = (m[i.category] || 0) + 1;
    return CATEGORIES.filter((c) => m[c.id]).map((c) => `${c.label} ${m[c.id]}`);
  }, [shown]);

  return (
    <>
      <div className="stack">
        <h1>Search</h1>
        <input
          id="search"
          className="input"
          style={{ fontSize: '1.05rem', padding: '12px 14px' }}
          placeholder="Anime, movies, K-dramas, Turkish dramas…"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          {TYPES.map((t) => (
            <button key={t.id} className={`chip ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {result?.errors?.map((e) => (
        <div key={e} className="notice error">{e}</div>
      ))}

      {loading && <p className="muted">Searching…</p>}

      {!loading && result && (
        <>
          <p className="muted small">
            {shown.length} results{catCounts.length ? ` · ${catCounts.join(' · ')}` : ''}
          </p>
          <div className="grid">
            {shown.map((item) => (
              <TitleCard key={`${item.source}-${item.mediaType}-${item.sourceId}`} item={item} entry={lookup(item)} />
            ))}
          </div>
        </>
      )}

      {!result && !loading && (
        <p className="muted">
          Type at least two letters. Movies, series and dramas come from TMDB; anime comes from AniList. Both update every day.
        </p>
      )}
    </>
  );
}
