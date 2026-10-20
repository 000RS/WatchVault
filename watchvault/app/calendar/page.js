'use client';

import { useEffect, useMemo, useState } from 'react';
import { animeAiring, normalizeTmdb, tmdb } from '@/lib/catalog';
import { useEntries, titleKeys } from '@/lib/store';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';

const CACHE = 'wv:calendar';
const TTL = 6 * 3600 * 1000;

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]).catch(() => null);
      }
    })
  );
  return out;
}

const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

export default function CalendarPage() {
  const { entries } = useEntries();
  const [mine, setMine] = useState(null);
  const [anime, setAnime] = useState(null);
  const [open, setOpen] = useState(null);

  // Your series: ask TMDB when each one's next episode airs (cached for a few hours).
  useEffect(() => {
    if (!entries) return;
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE) || 'null');
    } catch {
      /* ignore */
    }
    if (cached && Date.now() - cached.at < TTL && cached.n === entries.length) return setMine(cached.items);
    const thisYear = new Date().getFullYear();
    const shows = entries
      .filter((e) => e.source === 'tmdb' && e.media_type === 'tv' && (['watching', 'plan', 'on_hold'].includes(e.status) || (e.status === 'completed' && (e.year || 0) >= thisYear - 6)))
      .slice(0, 90);
    const films = entries.filter((e) => e.source === 'tmdb' && e.media_type === 'movie' && e.status === 'plan' && (!e.year || e.year >= thisYear)).slice(0, 40);
    (async () => {
      const tv = await pool(shows, 6, (e) => tmdb(`tv/${e.source_id}`).then((r) => ({ e, t: normalizeTmdb(r, 'tv'), last: r.last_episode_to_air })));
      const mv = await pool(films, 6, (e) => tmdb(`movie/${e.source_id}`).then((r) => ({ e, t: normalizeTmdb(r, 'movie') })));
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const items = [];
      for (const x of tv.filter(Boolean)) {
        if (x.t.nextEpisode?.date) items.push({ date: x.t.nextEpisode.date, kind: 'episode', label: `S${x.t.nextEpisode.season} · E${x.t.nextEpisode.episode}`, entry: x.e, title: x.t });
        if (x.last?.air_date && x.last.air_date >= weekAgo && x.last.air_date <= today)
          items.push({ date: x.last.air_date, kind: 'aired', label: `S${x.last.season_number} · E${x.last.episode_number} is out`, entry: x.e, title: x.t });
      }
      for (const x of mv.filter(Boolean)) if (x.t.date && x.t.date >= weekAgo) items.push({ date: x.t.date, kind: 'movie', label: x.t.date > today ? 'Release' : 'Just released', entry: x.e, title: x.t });
      items.sort((a, b) => a.date.localeCompare(b.date));
      setMine(items);
      try {
        localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), n: entries.length, items }));
      } catch {
        /* ignore */
      }
    })();
  }, [entries]);

  useEffect(() => {
    animeAiring(7)
      .then(setAnime)
      .catch(() => setAnime([]));
  }, []);

  const keys = useMemo(() => {
    const s = new Set();
    for (const e of entries || []) for (const k of titleKeys(e.title, e.original_title)) s.add(k);
    return s;
  }, [entries]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const it of mine || []) m.set(it.date, [...(m.get(it.date) || []), it]);
    return [...m.entries()];
  }, [mine]);

  const animeDays = useMemo(() => {
    const m = new Map();
    for (const a of anime || []) {
      const d = new Date(a.at).toLocaleDateString('en-CA');
      m.set(d, [...(m.get(d) || []), { ...a, mine: titleKeys(...(a.title.names || [a.title.title])).some((k) => keys.has(k)) }]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [anime, keys]);

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Calendar</h1>
          <p className="muted">New episodes of your shows and release dates for films you plan to watch.</p>
        </div>
      </header>

      <section className="section">
        <h2 className="h-section">Your shows and films</h2>
        {!mine && <div className="skeleton" style={{ height: 160, aspectRatio: 'auto' }} />}
        {mine && !mine.length && <p className="muted">Nothing scheduled. Shows you&apos;re watching or plan to watch appear here when a new episode is announced.</p>}
        <div className="stack">
          {groups.map(([date, items]) => (
            <div key={date} className="cal-day">
              <h3 className="cal-date">{dayLabel(date)}</h3>
              <div className="cal-items">
                {items.map((it, i) => (
                  <button key={i} className={`cal-item as-button ${it.kind}`} onClick={() => setOpen(it.entry)}>
                    <Poster src={it.entry.poster_url} title={it.entry.title} size="sm" />
                    <span className="cal-text">
                      <b>{it.entry.title}</b>
                      <span className="muted small">{it.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="h-section">Anime airing this week</h2>
        {!anime && <div className="skeleton" style={{ height: 160, aspectRatio: 'auto' }} />}
        <div className="stack">
          {animeDays.map(([date, items]) => (
            <div key={date} className="cal-day">
              <h3 className="cal-date">{dayLabel(date)}</h3>
              <div className="cal-items">
                {items
                  .sort((a, b) => Number(b.mine) - Number(a.mine) || a.at - b.at)
                  .slice(0, 18)
                  .map((a) => (
                    <button key={`${a.title.sourceId}-${a.episode}`} className={`cal-item as-button ${a.mine ? 'mine' : ''}`} onClick={() => setOpen({ item: a.title })}>
                      <Poster src={a.title.poster} title={a.title.title} size="sm" />
                      <span className="cal-text">
                        <b>{a.title.title}</b>
                        <span className="muted small">
                          Episode {a.episode} · {new Date(a.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {a.mine ? ' · in your list' : ''}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      {open && (open.item ? <DetailSheet item={open.item} open onClose={() => setOpen(null)} /> : <DetailSheet entry={open} open onClose={() => setOpen(null)} />)}
    </>
  );
}
