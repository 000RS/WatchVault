'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LANGUAGES, SEARCH_GENRES, discoverTitles, searchEverything } from '@/lib/catalog';
import { TitleTile } from './Tiles';
import { askGuide, useAiEnabled } from './Ask';
import { viewMemory } from '@/lib/store';
import { SHELF_KINDS, searchAll, searchShelf, shelfKind, trendingShelf } from '@/lib/shelves';
import CustomAdd from './CustomAdd';
import { dubOf, isAnime, whenDubsReady } from '@/lib/dubs';

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
  { id: 'shortdrama', label: 'Short dramas' },
  ...SHELF_KINDS.map((k) => ({ id: k.id, label: k.label })),
];
const isShelf = (type) => Boolean(shelfKind(type));
const isPlain = (type) => isShelf(type) || type === 'shortdrama';

export const EMPTY_FILTERS = { type: 'all', language: '', country: '', year: '', genre: '', dub: '' };
export const filtersActive = (f) => Boolean(f.language || f.country || f.year || f.genre || f.dub || f.type !== 'all');
export const searchHint = (f) => (f.type === 'shortdrama' ? 'A short drama, or the app it’s on' : shelfKind(f.type)?.placeholder);
const DUB_FILTERS = [
  ['', 'Dub or sub'],
  ['dub', 'English dub'],
  ['sub', 'Sub only'],
];
/** Keep anime that match the dub filter (the dub list only covers anime). */
async function applyDub(items, dub) {
  if (!dub) return items;
  await whenDubsReady(items);
  return items.filter((i) => isAnime(i) && (dub === 'dub' ? ['dub', 'partial'].includes(dubOf(i)) : dubOf(i) === 'sub'));
}

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
      {!isPlain(f.type) && <div className="toolbar">
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
        {['all', 'anime'].includes(f.type) && (
          <select id="s-dub" className="select" value={f.dub || ''} onChange={set('dub')} aria-label="English dub">
            {DUB_FILTERS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        )}
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
      </div>}
      {isPlain(f.type) && (
        <div className="row small">
          <span className="muted">{f.type === 'shortdrama' ? 'Search, or add one yourself with the app it’s on.' : ['place', 'food', 'travel'].includes(f.type) ? 'Type a name or area. Results near you come first.' : 'Popular right now, or type to search.'}</span>
          <button type="button" className="btn sm ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            Back to everything
          </button>
        </div>
      )}
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
  const key = `search:${term}|${f.type}|${f.year}|${f.language}|${f.country}|${f.genre}|${f.dub || ''}`;

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
        if (f.type === 'shortdrama') {
          const found = term ? (await searchEverything(term, { type: 'tv' })).items.filter((i) => i.mediaType === 'tv') : [];
          r = {
            items: found.map((i) => ({ ...i, category: 'shortdrama' })),
            people: [],
            note: 'Apps like ReelShort, DramaBox and ShortMax keep most of their dramas off film databases. If yours isn’t here, add it yourself and pick the app.',
          };
        } else if (isShelf(f.type)) {
          const d = term ? await searchShelf(f.type, term) : await trendingShelf(f.type);
          r = { items: d.items, people: [], note: d.note };
        } else if (term && f.type === 'all' && !f.language && !f.country && !f.year && !f.genre && !f.dub) {
          const all = await searchAll(term);
          r = { ...all.screen, shelves: all.shelves };
        } else if (term) {
          r = await searchEverything(term, { type: f.type, year: f.year || undefined, language: f.language, country: f.country });
          if (f.genre) r = { ...r, items: r.items.filter((i) => !i.genres?.length || i.genres.some((g) => g === f.genre || g.includes(f.genre.split(' ')[0]))) };
        } else {
          const d = await discoverTitles({ ...f, page: 1 });
          r = { items: d.items, people: [], more: d.more };
        }
        if (f.dub && !isShelf(f.type)) r = { ...r, people: [], items: await applyDub(r.items, f.dub), note: 'English dub info covers anime only, from the community-kept MAL-Dubs list.' };
        if (id !== req.current) return;
        viewMemory.set(key, r);
        setRes(r);
        setError(null);
        if (ai && !isShelf(f.type) && term.length > 2 && r.items.length < 2 && !r.didYouMean) {
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
      d.items = await applyDub(d.items, f.dub);
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
        {res?.note && <p className="hint">{res.note}</p>}
        {!term && res?.more && !busy && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={more}>
              Show more
            </button>
          </div>
        )}
      </section>

      {res?.shelves &&
        SHELF_KINDS.filter((k) => res.shelves[k.id]?.length).map((k) => (
          <section key={k.id} className="section">
            <h2 className="h-section">
              {k.icon} {k.label}
            </h2>
            <div className="shelf-track">
              {res.shelves[k.id].map((i) => (
                <TitleTile key={`${i.source}-${i.sourceId}`} item={i} />
              ))}
            </div>
          </section>
        ))}

      {res && !busy && (term || isShelf(f.type) || f.type === 'shortdrama') && (
        <CustomAdd defaultTitle={term} defaultKind={isShelf(f.type) || f.type === 'shortdrama' ? f.type : 'custom'} label={f.type === 'shortdrama' ? 'Add a short drama with its app' : undefined} />
      )}
    </>
  );
}
