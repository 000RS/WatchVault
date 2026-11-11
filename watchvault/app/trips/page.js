'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries } from '@/lib/store';
import { addTitle } from '@/lib/actions';
import { updateEntry } from '@/lib/store';
import MapView from '@/components/MapView';
import { toast } from '@/lib/toast';

const CACHE = 'wv:trips';

/** Turn a filming location into a Travel shelf item. */
const tripItem = (p) => ({
  source: 'wikidata',
  sourceId: p.id,
  mediaType: 'travel',
  category: 'travel',
  title: p.name,
  poster: p.image || null,
  year: null,
  genres: ['filming location'],
  countries: [],
  meta: { lat: p.lat, lon: p.lon, by: p.country || null, country: p.country || null, from: p.titles.map((t) => t.title).slice(0, 4) },
  detailed: true,
});

export default function TripsPage() {
  const { entries, lookup } = useEntries();
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState(null);
  const [country, setCountry] = useState('');
  const [view, setView] = useState('screen'); // screen | mine

  const watched = useMemo(
    () =>
      (entries || [])
        .filter((e) => e.source === 'tmdb' && (e.media_type === 'movie' || e.media_type === 'tv') && ['completed', 'watching', 'stopped', 'on_hold', 'plan'].includes(e.status))
        .sort((a, b) => (b.status === 'plan' ? 0 : 1) - (a.status === 'plan' ? 0 : 1) || (b.rating ?? 0) - (a.rating ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, 120),
    [entries]
  );

  useEffect(() => {
    if (!entries) return;
    const keys = watched.map((e) => `${e.media_type}:${e.source_id}`);
    const sig = keys.join(',');
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && c.sig === sig && Date.now() - c.at < 7 * 86400000) return setPlaces(c.places);
    } catch {
      /* ignore */
    }
    if (!keys.length) return setPlaces([]);
    fetch(`/api/trips?keys=${encodeURIComponent(sig)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setPlaces(d.places || []);
        try {
          localStorage.setItem(CACHE, JSON.stringify({ sig, at: Date.now(), places: d.places || [] }));
        } catch {
          /* ignore */
        }
      })
      .catch(() => setError('Filming locations are unavailable right now.'));
  }, [entries ? 1 : 0, watched.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const travel = useMemo(() => (entries || []).filter((e) => (e.media_type === 'travel' || e.media_type === 'place') && e.meta?.lat != null), [entries]);
  const countries = useMemo(() => [...new Set((places || []).map((p) => p.country).filter(Boolean))].sort(), [places]);
  const shown = (places || []).filter((p) => !country || p.country === country);
  const statusOf = (p) => lookup({ source: 'wikidata', mediaType: 'travel', sourceId: p.id, title: p.name })?.status;

  async function save(p, status) {
    const existing = lookup({ source: 'wikidata', mediaType: 'travel', sourceId: p.id, title: p.name });
    try {
      if (existing) await updateEntry(existing.id, { status }, { delay: 0 });
      else await addTitle(tripItem(p), status);
      toast(status === 'completed' ? `Been to ${p.name}` : `${p.name} saved to Travel`);
    } catch {
      /* toast shown already */
    }
  }

  const points =
    view === 'screen'
      ? shown.map((p) => ({ key: p.id, lat: p.lat, lon: p.lon, label: p.name, sub: p.titles.map((t) => t.title).join(', '), done: statusOf(p) === 'completed' }))
      : travel.map((e) => ({ key: e.id, lat: e.meta.lat, lon: e.meta.lon, label: e.title, sub: e.meta.by || '', done: e.status === 'completed' }));

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Screen trips</h1>
          <p className="muted">The real places from what you&apos;ve watched and want to watch. Save the ones you dream of, tick the ones you&apos;ve been to.</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={view === 'screen'} className={`tab-btn ${view === 'screen' ? 'on' : ''}`} onClick={() => setView('screen')}>
            From your screen
          </button>
          <button role="tab" aria-selected={view === 'mine'} className={`tab-btn ${view === 'mine' ? 'on' : ''}`} onClick={() => setView('mine')}>
            Your map
          </button>
        </div>
      </header>

      {view === 'screen' && countries.length > 1 && (
        <div className="toolbar">
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">Every country ({(places || []).length} places)</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <MapView points={points} />

      {error && <p className="notice">{error}</p>}
      {view === 'screen' && (
        <>
          {!places && !error && <div className="skeleton" style={{ height: 200, aspectRatio: 'auto' }} />}
          {places && !places.length && (
            <p className="muted">
              No filming locations found yet. They come from Wikidata, which covers most well-known films and series. Add more to <Link href="/list">your list</Link> and check back.
            </p>
          )}
          <div className="trip-cards">
            {shown.slice(0, 120).map((p) => {
              const st = statusOf(p);
              return (
                <article key={p.id} className="trip-card">
                  <div className="trip-img">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <span>🧭</span>}</div>
                  <div className="stack-sm" style={{ minWidth: 0 }}>
                    <b>{p.name}</b>
                    <span className="muted small">{[p.country, p.titles.map((t) => t.title).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className={`btn sm ${st === 'plan' ? 'primary' : ''}`} onClick={() => save(p, 'plan')}>
                        {st === 'plan' ? 'Saved' : 'Dream trip'}
                      </button>
                      <button className={`btn sm ${st === 'completed' ? 'primary' : ''}`} onClick={() => save(p, 'completed')}>
                        {st === 'completed' ? 'Been there ✓' : 'Been there'}
                      </button>
                      <a className="btn sm ghost" href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">
                        Map
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {view === 'mine' && !travel.length && <p className="muted">Places, food spots and trips you save show here on one map.</p>}
      <p className="hint">Filming locations from Wikidata. Map © OpenStreetMap contributors.</p>
    </>
  );
}
