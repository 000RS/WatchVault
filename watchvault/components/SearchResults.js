'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LANGUAGES, searchEverything } from '@/lib/catalog';
import { TitleTile } from './Tiles';
import { askGuide, useAiEnabled } from './Ask';
import { viewMemory } from '@/lib/store';

export const COUNTRIES = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['IN', 'India'], ['PK', 'Pakistan'], ['KR', 'South Korea'], ['JP', 'Japan'], ['CN', 'China'],
  ['TW', 'Taiwan'], ['HK', 'Hong Kong'], ['TH', 'Thailand'], ['TR', 'Türkiye'], ['ES', 'Spain'], ['MX', 'Mexico'], ['FR', 'France'], ['DE', 'Germany'],
  ['IT', 'Italy'], ['BR', 'Brazil'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['CA', 'Canada'], ['IR', 'Iran'], ['EG', 'Egypt'], ['NG', 'Nigeria'],
  ['ID', 'Indonesia'], ['PH', 'Philippines'], ['SE', 'Sweden'], ['DK', 'Denmark'], ['NO', 'Norway'], ['RU', 'Russia'], ['BD', 'Bangladesh'],
];

const TYPES = [
  { id: 'all', label: 'Everything' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'Series & dramas' },
  { id: 'anime', label: 'Anime' },
];

/** Results for the Explore search bar, with type, language, country and year filters. */
export default function SearchResults({ q, onPick }) {
  const mem = viewMemory.get('search:filters') || {};
  const [type, setType] = useState(mem.type || 'all');
  const [year, setYear] = useState(mem.year || '');
  const [language, setLanguage] = useState(mem.language || '');
  const [country, setCountry] = useState(mem.country || '');
  const [res, setRes] = useState(null);
  const [aiGuess, setAiGuess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ai = useAiEnabled();
  const req = useRef(0);

  useEffect(() => {
    viewMemory.set('search:filters', { type, year, language, country });
  }, [type, year, language, country]);

  useEffect(() => {
    const term = q.trim();
    const id = ++req.current;
    setAiGuess(null);
    if (term.length < 2) {
      setRes(null);
      setBusy(false);
      return;
    }
    const cached = viewMemory.get(`search:${term}|${type}|${year}|${language}|${country}`);
    if (cached) {
      setRes(cached);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchEverything(term, { type, year: year || undefined, language, country });
        if (id !== req.current) return;
        viewMemory.set(`search:${term}|${type}|${year}|${language}|${country}`, r);
        setRes(r);
        setError(null);
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
    }, 280);
    return () => clearTimeout(t);
  }, [q, type, year, language, country, ai]);

  const years = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i);
  const filtered = Boolean(year || language || country);

  return (
    <>
      <div className="stack-sm">
        <div className="chips">
          {TYPES.map((t) => (
            <button key={t.id} className={`chip ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <select id="s-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
            <option value="">Any language</option>
            {LANGUAGES.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
          <select id="s-country" className="select" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">Any country</option>
            {COUNTRIES.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
          <select id="s-year" className="select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Release year">
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {filtered && (
            <button className="btn sm ghost" onClick={() => (setYear(''), setLanguage(''), setCountry(''))}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <p className="notice error">{error}</p>}
      {res?.didYouMean && (
        <p className="lede">
          Showing results for <b>{res.didYouMean}</b>.{' '}
          <button className="link as-text-link" onClick={() => onPick?.(res.didYouMean)}>
            Search that instead
          </button>
        </p>
      )}
      {aiGuess && (
        <div className="chips wrap">
          <span className="muted">Did you mean</span>
          {aiGuess.map((t) => (
            <button key={t} className="chip" onClick={() => onPick?.(t)}>
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

      <section className="section">
        {res?.people?.length > 0 && <h2 className="h-section">Titles</h2>}
        {res && !busy && !res.items.length && (
          <p className="muted">{filtered ? 'Nothing matches with these filters. Try clearing one.' : 'No titles match. Try another spelling, the original-language title, or an actor’s name.'}</p>
        )}
        <div className="grid-posters">
          {res?.items.map((i) => (
            <TitleTile key={`${i.source}-${i.mediaType}-${i.sourceId}`} item={i} />
          ))}
          {busy && !res && Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" />)}
        </div>
      </section>
    </>
  );
}
