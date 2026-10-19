'use client';

import { useEffect, useRef, useState } from 'react';
import { searchCatalog } from '@/lib/catalog';
import { TitleTile } from '@/components/Tiles';
import { viewMemory } from '@/lib/store';

const TYPES = [
  { id: 'all', label: 'Everything' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'Series & dramas' },
  { id: 'anime', label: 'Anime' },
];

export default function SearchPage() {
  const mem = viewMemory.get('search') || {};
  const [q, setQ] = useState(mem.q || '');
  const [type, setType] = useState(mem.type || 'all');
  const [year, setYear] = useState(mem.year || '');
  const [results, setResults] = useState(mem.results || null);
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const req = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const id = ++req.current;
    if (term.length < 2) {
      setResults(null);
      setSuggestion(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const items = await searchCatalog(term, { type, year: year || undefined });
        if (id !== req.current) return;
        setResults(items);
        setError(null);
        // Typo? Ask the matcher for its best guess.
        if (items.length < 3 || !items.some((i) => norm(i.title).includes(norm(term)))) {
          fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 's', q: term, kind: type === 'all' ? 'any' : type, year: year || null }] }) })
            .then((r) => r.json())
            .then((d) => {
              const r = d.results?.[0];
              const best = r?.best;
              if (id === req.current && best && r.confidence >= 0.5 && !items.some((i) => i.sourceId === best.sourceId)) setSuggestion(best);
              else if (id === req.current) setSuggestion(null);
            })
            .catch(() => {});
        } else setSuggestion(null);
      } catch (e) {
        if (id === req.current) setError(e.message);
      } finally {
        if (id === req.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, type, year]);

  useEffect(() => {
    viewMemory.set('search', { q, type, year, results });
  }, [q, type, year, results]);

  const years = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <header className="stack">
        <h1 className="h-page">Search</h1>
        <input
          id="search"
          className="input search-input"
          type="search"
          placeholder="Movies, series, anime, dramas"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <div className="toolbar">
          <div className="chips">
            {TYPES.map((t) => (
              <button key={t.id} className={`chip ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <select id="search-year" className="select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Release year">
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <p className="notice error">{error}</p>}

      {suggestion && (
        <div className="stack-sm">
          <p className="muted">Did you mean</p>
          <div className="grid-posters">
            <TitleTile item={suggestion} />
          </div>
        </div>
      )}

      {results && (
        <div className="stack">
          {!busy && <p className="muted small">{results.length ? `${results.length} results` : 'No matches. Check the spelling, or try the original title.'}</p>}
          <div className="grid-posters">
            {results.map((i) => (
              <TitleTile key={`${i.source}-${i.mediaType}-${i.sourceId}`} item={i} />
            ))}
          </div>
        </div>
      )}

      {!results && !busy && <p className="muted">Every movie and series on TMDB, plus anime from AniList. Titles you have already added show a badge.</p>}
    </>
  );
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
