'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { searchEverything } from '@/lib/catalog';
import { TitleTile } from '@/components/Tiles';
import { viewMemory } from '@/lib/store';
import { askGuide, useAiEnabled } from '@/components/Ask';

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
  const [res, setRes] = useState(mem.res || null);
  const [aiGuess, setAiGuess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ai = useAiEnabled();
  const req = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const id = ++req.current;
    setAiGuess(null);
    if (term.length < 2) {
      setRes(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchEverything(term, { type, year: year || undefined });
        if (id !== req.current) return;
        setRes(r);
        setError(null);
        // Still nothing that looks right? Ask the guide what was meant (free, optional).
        if (ai && r.items.length < 2 && !r.didYouMean) {
          askGuide({ mode: 'resolve', q: term })
            .then((d) => id === req.current && d.titles?.length && setAiGuess(d.titles))
            .catch(() => {});
        }
      } catch (e) {
        if (id === req.current) setError(e.message);
      } finally {
        if (id === req.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, type, year, ai]);

  useEffect(() => {
    viewMemory.set('search', { q, type, year, res });
  }, [q, type, year, res]);

  const years = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <header className="stack">
        <h1 className="h-page">Search</h1>
        <input id="search" className="input search-input" type="search" placeholder="Titles, actors, directors…" autoFocus value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
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

      {res?.didYouMean && (
        <p className="lede">
          Showing results for <b>{res.didYouMean}</b>.{' '}
          <button className="link as-text-link" onClick={() => setQ(res.didYouMean)}>
            Search that instead
          </button>
        </p>
      )}
      {aiGuess && (
        <div className="chips wrap">
          <span className="muted">Did you mean</span>
          {aiGuess.map((t) => (
            <button key={t} className="chip" onClick={() => setQ(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {res?.people?.length > 0 && (
        <section className="section">
          <h2 className="h-section">People</h2>
          <div className="people-grid">
            {res.people.map((p) => (
              <Link key={p.id} href={`/person/${p.id}`} className="person-card">
                <span className="cast-photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span>{p.name[0]}</span>}</span>
                <span className="person-card-text">
                  <b>{p.name}</b>
                  <span className="muted small">{[p.dept === 'Acting' ? 'Actor' : p.dept, p.knownFor.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {res && (
        <section className="section">
          {res.people?.length > 0 && <h2 className="h-section">Titles</h2>}
          {!busy && !res.items.length && <p className="muted">No titles match. Try another spelling, the original-language title, or an actor&apos;s name.</p>}
          <div className="grid-posters">
            {res.items.map((i) => (
              <TitleTile key={`${i.source}-${i.mediaType}-${i.sourceId}`} item={i} />
            ))}
          </div>
        </section>
      )}

      {!res && !busy && <p className="muted">Every movie and series, in every language, plus anime and the people who make them. Spelling doesn&apos;t have to be perfect.</p>}
    </>
  );
}
