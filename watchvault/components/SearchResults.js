'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LANGUAGES, SEARCH_GENRES, discoverTitles, searchEverything } from '@/lib/catalog';
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

export const EMPTY_FILTERS = { type: 'all', language: '', country: '', year: '', genre: '' };
export const filtersActive = (f) => Boolean(f.language || f.country || f.year || f.genre || f.type !== 'all');

/** The filter row that sits under the search bar, always visible. */
export function SearchFilters({ f, onChange }) {
  const years = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i);
  const set = (k) => (e) => onChange({ ...f, [k]: e.target.value });
  return (
    <div className="search-filters">
      <div className="chips">
        {TYPES.map((t) => (
          <button key={t.id} type="button" className={`chip ${f.type === t.id ? 'on' : ''}`} onClick={() => onChange({ ...f, type: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <select id="s-language" className="select" value={f.language} onChange={set('language')} aria-label="Language">
          <option value="">Any language</option>
          {LANGUAGES.map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </select>
        <select id="s-country" className="select" value={f.country} onChange={set('country')} aria-label="Country">
          <option value="">Any country</option>
          {COUNTRIES.map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </select>
        <select id="s-year" className="select" value={f.year} onChange={set('year')} aria-label="Release year">
          <option value="">Any year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select id="s-genre" className="select" value={f.genre} onChange={set('genre')} aria-label="Genre">
          <option value="">Any genre</option>
          {SEARCH_GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        {filtersActive(f) && (
          <button type="button" className="btn sm ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Results for a search and/or filters. With words: a search narrowed by the filters.
 * Without words: every title that matches the filters, most popular first.
 */
export default function SearchResults({ q, f, onPick }) {
  const [res, setRes] = useState(null);
  const [aiGuess, setAiGuess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const ai = useAiEnabled();
  const req = useRef(0);
  const term = q.trim();
  const key = `search:${term}|${f.type}|${f.year}|${f.language}|${f.country}|${f.genre}`;

  useEffect(() => {
    const id = ++req.current;
    setAiGuess(null);
    setPage(1);
    const cached = viewMemory.get(key);
    if (cached) {
      setRes(cached);
      setBusy(false);
      return;
    }
    setBusy(true);
    setRes(null);
    (async () => {
      try {
        let r;
        if (term) {
          r = await searchEverything(term, { type: f.type, year: f.year || undefined, language: f.language, country: f.country });
          if (f.genre) r = { ...r, items: r.items.filter((i) => !i.genres?.length || i.genres.some((g) => g === f.genre || g.includes(f.genre.split(' ')[0]))) };
        } else {
          const d = await discoverTitles({ ...f, page: 1 });
          r = { items: d.items, people: [], more: d.more };
        }
        if (id !== req.current) return;
        viewMemory.set(key, r);
        setRes(r);
        setError(null);
        if (ai && term.length > 2 && r.items.length < 2 && !r.didYouMean) {
          askGuide({ mode: 'resolve', q: term })
            .then((d) => id === req.current && d.titles?.length && setAiGuess(d.titles))
            .catch(() => {});
        }
      } catch (e) {
        if (id === req.current) setError(e.message);
      } finally {
        if (id === req.current) setBusy(false);
      }
    })();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function more() {
    setBusy(true);
    try {
      const d = await discoverTitles({ ...f, page: page + 1 });
      const next = { ...res, items: [...res.items, ...d.items.filter((i) => !res.items.some((x) => x.sourceId === i.sourceId && x.mediaType === i.mediaType))], more: d.more };
      viewMemory.set(key, next);
      setRes(next);
      setPage(page + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = filtersActive(f);

  return (
    <>
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
          {busy && Array.from({ length: res ? 6 : 12 }, (_, i) => <div key={i} className="skeleton" />)}
        </div>
        {!term && res?.more && !busy && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={more}>
              Show more
            </button>
          </div>
        )}
      </section>
    </>
  );
}
