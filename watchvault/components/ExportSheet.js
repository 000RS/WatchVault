'use client';

import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { CATEGORIES, STATUSES, languageName } from '@/lib/categories';
import { EMPTY_EXPORT, FORMATS, TYPES, describe, exportList, filterForExport } from '@/lib/exportList';
import { COUNTRIES } from './SearchResults';
import { toast } from '@/lib/toast';

const COUNTRY_NAME = Object.fromEntries(COUNTRIES);
const PRESETS = [
  { id: 'all', label: 'Everything', f: {} },
  { id: 'anime', label: 'Anime', f: { types: ['anime'] } },
  { id: 'movies', label: 'Movies', f: { types: ['movie'] } },
  { id: 'series', label: 'Series', f: { types: ['series'] } },
  { id: 'en-movies', label: 'English movies', f: { types: ['movie'], language: 'en' } },
  { id: 'en-series', label: 'English series', f: { types: ['series'], language: 'en' } },
  { id: 'hi-movies', label: 'Hindi movies', f: { types: ['movie'], language: 'hi' } },
  { id: 'hi-series', label: 'Hindi series', f: { types: ['series'], language: 'hi' } },
  { id: 'kdrama', label: 'K-Dramas', f: { shelves: ['kdrama'] } },
  { id: 'short', label: 'Short dramas', f: { types: ['shortdrama'] } },
  { id: 'watchlist', label: 'Watchlist', f: { statuses: ['plan'] } },
  { id: 'done', label: 'Completed', f: { statuses: ['completed'] } },
  { id: 'fav', label: '♥ Favourites', f: { fav: true } },
  { id: 'cinema', label: '🍿 Seen in a cinema', f: { cinema: true } },
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/**
 * Export all or part of the vault. `current` = { list, label } offers "what's on screen now"
 * (My Vault with its filters applied).
 */
export default function ExportSheet({ entries, current, open, onClose }) {
  const [f, setF] = useState(EMPTY_EXPORT);
  const [useCurrent, setUseCurrent] = useState(false);
  const [format, setFormat] = useState('xlsx');
  const [full, setFull] = useState(true);
  const [notes, setNotes] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);

  const facets = useMemo(() => {
    const l = new Map(), c = new Map(), s = new Map();
    for (const e of entries) {
      if (e.original_language) l.set(e.original_language, (l.get(e.original_language) || 0) + 1);
      if (e.origin_country) c.set(e.origin_country, (c.get(e.origin_country) || 0) + 1);
      s.set(e.category, (s.get(e.category) || 0) + 1);
    }
    const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { languages: sorted(l), countries: sorted(c), shelves: CATEGORIES.filter((x) => s.get(x.id)).map((x) => [x, s.get(x.id)]) };
  }, [entries]);

  const picked = useMemo(() => (useCurrent && current ? current.list : filterForExport(entries, f)), [entries, f, useCurrent, current]);
  const auto = useCurrent && current ? current.label || 'My Vault, filtered' : describe(f);
  const title = name.trim() || auto;
  const preset = !useCurrent && PRESETS.find((p) => same({ ...EMPTY_EXPORT, ...p.f }, f));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function go() {
    if (!picked.length) return;
    setBusy(true);
    try {
      const file = await exportList(picked, { format, title, full, notes });
      toast(`Saved ${file}`);
    } catch (e) {
      toast(`Couldn't make the file: ${e.message}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Export your list" wide className="export-sheet">
      <div className="stack">
        <div className="field-block">
          <span className="field-label">What to export</span>
          <div className="chips wrap">
            {current && (
              <button className={`chip ${useCurrent ? 'on' : ''}`} onClick={() => setUseCurrent(true)}>
                What&apos;s on screen now <span className="count">{current.list.length}</span>
              </button>
            )}
            {PRESETS.map((p) => {
              const n = filterForExport(entries, { ...EMPTY_EXPORT, ...p.f }).length;
              if (!n && p.id !== 'all') return null;
              return (
                <button key={p.id} className={`chip ${preset?.id === p.id ? 'on' : ''}`} onClick={() => (setUseCurrent(false), setF({ ...EMPTY_EXPORT, ...p.f }), setName(''))}>
                  {p.label} <span className="count">{n}</span>
                </button>
              );
            })}
          </div>
          <button className="as-text-link small" style={{ justifySelf: 'start' }} onClick={() => (setMore(!more), setUseCurrent(false))}>
            {more ? 'Hide fine-tuning' : 'Fine-tune: mix types, shelves, status, language, years…'}
          </button>
        </div>

        {more && !useCurrent && (
          <div className="panel stack export-fine">
            <div className="field-block">
              <span className="field-label">Type</span>
              <div className="chips wrap">
                {TYPES.map((t) => (
                  <button key={t.id} className={`chip ${f.types.includes(t.id) ? 'on' : ''}`} onClick={() => setF({ ...f, types: toggleIn(f.types, t.id) })}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-block">
              <span className="field-label">Shelves</span>
              <div className="chips wrap">
                {facets.shelves.map(([c, n]) => (
                  <button key={c.id} className={`chip ${f.shelves.includes(c.id) ? 'on' : ''}`} onClick={() => setF({ ...f, shelves: toggleIn(f.shelves, c.id) })}>
                    {c.label} <span className="count">{n}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field-block">
              <span className="field-label">Status</span>
              <div className="chips wrap">
                {STATUSES.map((s) => (
                  <button key={s.id} className={`chip ${f.statuses.includes(s.id) ? 'on' : ''}`} onClick={() => setF({ ...f, statuses: toggleIn(f.statuses, s.id) })}>
                    <span className={`dot st-${s.id}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar">
              <select id="ex-lang" className="select" value={f.language} onChange={set('language')} aria-label="Language">
                <option value="">Any language</option>
                {facets.languages.map(([l, n]) => (
                  <option key={l} value={l}>
                    {languageName(l)} ({n})
                  </option>
                ))}
              </select>
              <select id="ex-country" className="select" value={f.country} onChange={set('country')} aria-label="Country">
                <option value="">Any country</option>
                {facets.countries.map(([c, n]) => (
                  <option key={c} value={c}>
                    {COUNTRY_NAME[c] || c} ({n})
                  </option>
                ))}
              </select>
              <select id="ex-rating" className="select" value={f.minRating} onChange={set('minRating')} aria-label="Your rating">
                <option value="">Any rating</option>
                {[6, 7, 8, 9, 10].map((r) => (
                  <option key={r} value={r}>
                    Rated {r}
                    {r < 10 ? '+' : ''}
                  </option>
                ))}
              </select>
              <input id="ex-from" className="input year-input" inputMode="numeric" placeholder="From year" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label="From year" />
              <input id="ex-to" className="input year-input" inputMode="numeric" placeholder="To year" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label="To year" />
            </div>
            <div className="row" style={{ gap: 18 }}>
              <label className="row small">
                <input type="checkbox" checked={f.fav} onChange={(e) => setF({ ...f, fav: e.target.checked })} /> Favourites only
              </label>
              <label className="row small">
                <input type="checkbox" checked={f.cinema} onChange={(e) => setF({ ...f, cinema: e.target.checked })} /> Seen in a cinema
              </label>
              <button className="btn sm ghost" onClick={() => setF(EMPTY_EXPORT)}>
                Reset
              </button>
            </div>
          </div>
        )}

        <div className="field-block">
          <span className="field-label">Format</span>
          <div className="export-formats" role="radiogroup" aria-label="Format">
            {FORMATS.map((x) => (
              <button key={x.id} role="radio" aria-checked={format === x.id} className={`export-format ${format === x.id ? 'on' : ''}`} onClick={() => setFormat(x.id)}>
                <b>{x.label}</b>
                <span className="muted small">{x.hint}</span>
              </button>
            ))}
          </div>
          {(format === 'xlsx' || format === 'csv') && (
            <div className="row small" style={{ gap: 18 }}>
              <label className="row small">
                <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> All columns (genres, dates, dub, review…)
              </label>
              <label className="row small">
                <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Include private notes
              </label>
            </div>
          )}
          {(format === 'docx' || format === 'pdf') && <p className="hint">A page-width table: title, type, status, progress, rating, year and language.{format === 'pdf' ? ' Titles in non-Latin scripts print in their English or romanised form.' : ''}</p>}
        </div>

        <label className="field">
          <span className="field-label">Name</span>
          <input id="ex-name" className="input" value={name} placeholder={auto} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>

        <div className="export-go">
          <span className="muted">
            <b className="fg">{picked.length.toLocaleString()}</b> {picked.length === 1 ? 'title' : 'titles'} · {title}
          </span>
          <button className="btn primary" disabled={busy || !picked.length} onClick={go}>
            {busy ? 'Making the file…' : `Download ${FORMATS.find((x) => x.id === format).label}`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
