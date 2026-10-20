'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries } from '@/lib/store';
import { addDiary, removeDiary } from '@/lib/social4';
import { diaryForYear, forgetDiary, yearSummary } from '@/lib/yearly';
import { Heatmap, Kpi } from '@/components/Charts';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';
import { toast } from '@/lib/toast';

const fmtMin = (m) => (m >= 60 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m)} min`);

export default function DiaryPage() {
  const { entries } = useEntries();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState(null);
  const [day, setDay] = useState(null);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState(0);

  useEffect(() => {
    setRows(null);
    diaryForYear(year).then(setRows);
  }, [year, v]);

  const s = useMemo(() => (rows && entries ? yearSummary(entries, rows, year) : null), [rows, entries, year]);
  const years = useMemo(() => {
    const ys = new Set([thisYear]);
    for (const e of entries || []) if (e.watched_to) ys.add(Number(e.watched_to.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [entries, thisYear]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const r of s?.events || []) {
      const d = String(r.watched_on).slice(0, 10);
      if (day && d !== day) continue;
      m.set(d, [...(m.get(d) || []), r]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [s, day]);

  async function remove(r) {
    if (String(r.id).startsWith('e')) return toast('This comes from the watch date on the title. Change it there.');
    try {
      await removeDiary(r.id);
      forgetDiary();
      setV((x) => x + 1);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Diary</h1>
          <p className="muted">Every day you watched something. Episodes, finishes and rewatches log themselves as you tick them.</p>
        </div>
        <div className="row">
          <select id="diary-year" className="select inline" value={year} onChange={(e) => (setYear(Number(e.target.value)), setDay(null))} aria-label="Year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn sm primary" onClick={() => setAdding(!adding)}>
            Log a watch
          </button>
        </div>
      </header>

      {adding && (
        <LogForm
          entries={entries || []}
          onDone={() => {
            setAdding(false);
            forgetDiary();
            setV((x) => x + 1);
          }}
        />
      )}

      {!s && <div className="skeleton" style={{ height: 200, aspectRatio: 'auto' }} />}
      {s && (
        <>
          <div className="kpi-grid">
            <Kpi value={s.activeDays} label="Days with something" />
            <Kpi value={`${s.hours.toLocaleString()} h`} label="Watched (about)" />
            <Kpi value={s.episodes.toLocaleString()} label="Episodes" />
            <Kpi value={s.finished} label="Titles finished" />
            <Kpi value={`${s.streak.best} ${s.streak.best === 1 ? 'day' : 'days'}`} label="Longest streak" sub={s.streak.current > 1 ? `Current: ${s.streak.current} days` : null} />
          </div>
          <section className="dash-card wide">
            <h3>{year} at a glance</h3>
            <Heatmap year={year} values={s.days} format={fmtMin} onPick={(d) => setDay(day === d ? null : d)} />
            {day && (
              <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => setDay(null)}>
                Showing {day} · show the whole year
              </button>
            )}
          </section>

          {!byDay.length && (
            <div className="empty">
              <p className="lede">{day ? 'Nothing logged that day.' : 'Nothing logged this year yet.'}</p>
              <p className="muted">
                Tick episodes in <Link href="/">Up next</Link>, use “Watched today” when you add a title, or set a watch date on anything in your list.
              </p>
            </div>
          )}
          <div className="stack">
            {byDay.map(([d, list]) => (
              <div key={d} className="cal-day">
                <h3 className="cal-date">{new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
                <div className="cal-items">
                  {groupEpisodes(list).map((r) => (
                    <div key={r.id} className="cal-item">
                      <button className="as-button" onClick={() => r.entry && setOpen(r.entry)} aria-label={`${r.title}, details`}>
                        <Poster src={r.poster_url || r.entry?.poster_url} title={r.title} size="sm" />
                      </button>
                      <span className="cal-text">
                        <b>{r.entry?.title || r.title}</b>
                        <span className="muted small">{describe(r)}</span>
                        <button className="as-text-link small" style={{ justifySelf: 'start' }} onClick={() => remove(r)}>
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {open && <DetailSheet entry={open} open onClose={() => setOpen(null)} />}
    </>
  );
}

// Several episodes of one show on one day read as one line: "Episodes 3–6".
function groupEpisodes(list) {
  const out = [];
  const eps = new Map();
  for (const r of list) {
    if (r.kind !== 'episode') {
      out.push(r);
      continue;
    }
    const g = eps.get(r.entry_id);
    if (g) g.items.push(r);
    else {
      const ng = { ...r, items: [r] };
      eps.set(r.entry_id, ng);
      out.push(ng);
    }
  }
  return out;
}
function describe(r) {
  if (r.kind === 'rewatch') return 'Rewatched';
  if (r.kind === 'episode') {
    const n = r.items?.length || 1;
    const nums = (r.items || [r]).map((x) => x.episode).filter((x) => x > 0);
    const range = nums.length ? (nums.length > 1 ? `Episodes ${Math.min(...nums)}–${Math.max(...nums)}` : `Episode ${nums[0]}`) : `${n} episode${n > 1 ? 's' : ''}`;
    return r.season ? `Season ${r.season}, ${range.toLowerCase()}` : range;
  }
  return r.media_type === 'movie' ? 'Watched' : 'Finished';
}

function LogForm({ entries, onDone }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState('watch');
  const [busy, setBusy] = useState(false);
  const matches = q.trim().length > 1 ? entries.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  async function save() {
    setBusy(true);
    try {
      await addDiary({ entry_id: pick.id, watched_on: date, kind, title: pick.title, poster_url: pick.poster_url, source: pick.source, source_id: pick.source_id, media_type: pick.media_type, category: pick.category, runtime: pick.runtime });
      toast(`Logged ${pick.title}`);
      onDone();
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel stack" style={{ padding: 18 }}>
      {!pick ? (
        <>
          <input id="log-q" className="input" autoFocus placeholder="Which title from your list?" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips wrap">
            {matches.map((e) => (
              <button key={e.id} className="chip" onClick={() => setPick(e)}>
                {e.title} {e.year ? `(${e.year})` : ''}
              </button>
            ))}
            {q.trim().length > 1 && !matches.length && <span className="muted small">Not in your list. Add it from Explore first.</span>}
          </div>
        </>
      ) : (
        <div className="toolbar">
          <b>{pick.title}</b>
          <select className="select inline" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What happened">
            <option value="watch">{pick.media_type === 'movie' ? 'Watched' : 'Finished'}</option>
            <option value="rewatch">Rewatched</option>
            {pick.media_type !== 'movie' && <option value="episode">Watched an episode</option>}
          </select>
          <input type="date" className="input" style={{ width: 'auto' }} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <button className="btn sm primary" disabled={busy} onClick={save}>
            Log it
          </button>
          <button className="btn sm ghost" onClick={() => setPick(null)}>
            Change title
          </button>
        </div>
      )}
    </div>
  );
}
