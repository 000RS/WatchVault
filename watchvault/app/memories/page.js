'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEntries } from '@/lib/store';
import { diary } from '@/lib/social4';
import { CATEGORY_LABEL, isScreen, statusLabel } from '@/lib/categories';
import { SHELF_KINDS } from '@/lib/shelves';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';

const MONTH = (d) => d.slice(0, 7);
const WORDS = {
  books: ['book', 'books', 'finished'], manga: ['manga', 'manga', 'read'], games: ['game', 'games', 'played'], music: ['album or song', 'albums and songs', 'loved'], podcasts: ['podcast', 'podcasts', 'listened to'],
  food: ['food spot', 'food spots', 'tried'], places: ['place', 'places', 'visited'], events: ['event', 'events', 'went to'], travel: ['trip', 'trips', 'took'], other: ['thing', 'things', 'did'],
};

/** Your life in what you loved: month by month, every shelf, plus "on this day". */
export default function MemoriesPage() {
  const { entries } = useEntries();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    diary(null)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const byId = useMemo(() => new Map((entries || []).map((e) => [e.id, e])), [entries]);
  // Events: diary rows, plus finish dates on titles, plus when you first added something new.
  const events = useMemo(() => {
    if (!entries || !rows) return null;
    const out = rows.map((r) => ({ day: String(r.watched_on).slice(0, 10), entry: byId.get(r.entry_id) || { title: r.title, poster_url: r.poster_url, category: r.category, media_type: r.media_type }, kind: r.kind, note: r.note, with: r.with_whom }));
    const logged = new Set(rows.map((r) => `${r.entry_id}|${String(r.watched_on).slice(0, 10)}`));
    for (const e of entries) {
      if (e.watched_to && !logged.has(`${e.id}|${e.watched_to}`)) out.push({ day: e.watched_to, entry: e, kind: 'watch' });
      if (e.status !== 'plan' && !e.watched_to && e.created_at && Date.now() - new Date(e.created_at) < 400 * 86400000) out.push({ day: e.created_at.slice(0, 10), entry: e, kind: 'added' });
    }
    return out.sort((a, b) => b.day.localeCompare(a.day));
  }, [entries, rows, byId]);

  const months = useMemo(() => {
    const m = new Map();
    for (const ev of events || []) {
      const k = MONTH(ev.day);
      const cur = m.get(k) || { key: k, events: [], screen: new Set(), shelves: new Map(), episodes: 0, notes: [] };
      cur.events.push(ev);
      if (ev.kind === 'episode') cur.episodes++;
      else if (isScreen(ev.entry)) cur.screen.add(ev.entry.id || ev.entry.title);
      else {
        const cat = ev.entry.category || 'other';
        if (!cur.shelves.has(cat)) cur.shelves.set(cat, new Set());
        cur.shelves.get(cat).add(ev.entry.id || ev.entry.title);
      }
      if (ev.note) cur.notes.push(ev);
      m.set(k, cur);
    }
    return [...m.values()].slice(0, 24);
  }, [events]);

  const today = new Date().toISOString().slice(5, 10);
  const thisYear = new Date().getFullYear();
  const onThisDay = (events || []).filter((ev) => ev.day.slice(5, 10) === today && Number(ev.day.slice(0, 4)) < thisYear);

  if (!events) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Memories</h1>
          <p className="muted">Your life in the things you loved, month by month. Add notes and who you were with in the Diary.</p>
        </div>
      </header>

      {onThisDay.length > 0 && (
        <section className="panel otd">
          <p className="kicker">On this day</p>
          {onThisDay.slice(0, 4).map((ev, i) => (
            <p key={i} className="lede">
              {thisYear - Number(ev.day.slice(0, 4))} {thisYear - Number(ev.day.slice(0, 4)) === 1 ? 'year' : 'years'} ago you {ev.kind === 'episode' ? 'were watching' : statusLabel(ev.entry, 'completed').toLowerCase()} <b>{ev.entry.title}</b>
              {ev.with ? ` with ${ev.with}` : ''}.
            </p>
          ))}
        </section>
      )}

      {!months.length && <p className="muted">Nothing yet. Things you finish, visit or log with a date appear here as memories.</p>}

      <div className="memories">
        {months.map((m) => {
          const d = new Date(`${m.key}-15T12:00:00`);
          const parts = [
            m.screen.size ? `${m.screen.size} ${m.screen.size === 1 ? 'film or show' : 'films and shows'}` : null,
            m.episodes ? `${m.episodes} episodes` : null,
            ...[...m.shelves.entries()].map(([cat, set]) => {
              const w = WORDS[cat] || [CATEGORY_LABEL[cat], CATEGORY_LABEL[cat], ''];
              return `${set.size} ${set.size === 1 ? w[0] : w[1]} ${w[2]}`.trim();
            }),
          ].filter(Boolean);
          const covers = [...new Map(m.events.filter((e) => e.entry.poster_url).map((e) => [e.entry.title, e.entry])).values()].slice(0, 6);
          return (
            <article key={m.key} className="memory">
              <div className="memory-head">
                <h2 className="h-section">{d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                <p className="muted">{parts.join(' · ') || 'A quiet month'}</p>
              </div>
              {covers.length > 0 && (
                <div className="memory-covers">
                  {covers.map((e) => (
                    <button key={e.title} className="as-button" onClick={() => e.id && setOpen(e)} aria-label={e.title}>
                      <Poster src={e.poster_url} title={e.title} size="sm" />
                    </button>
                  ))}
                </div>
              )}
              {m.notes.slice(0, 3).map((n, i) => (
                <p key={i} className="memory-note">
                  “{n.note}” <span className="muted small">· {n.entry.title}{n.with ? `, with ${n.with}` : ''}</span>
                </p>
              ))}
              <div className="memory-shelves">
                {[...m.shelves.keys()].map((cat) => (
                  <span key={cat} className="pill">
                    {SHELF_KINDS.find((k) => k.category === cat)?.icon} {CATEGORY_LABEL[cat]}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {open && <DetailSheet entry={open} open onClose={() => setOpen(null)} />}
    </>
  );
}
