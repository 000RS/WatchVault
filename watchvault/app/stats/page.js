'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEntries } from '@/lib/store';
import { completionRankings, computeStats, finishRates, isWatched } from '@/lib/stats';
import { CATEGORIES, CATEGORY_LABEL, STATUSES, countLabel, languageName } from '@/lib/categories';
import { hasV4 } from '@/lib/list';
import { backfillCredits } from '@/lib/actions';
import { diaryForYear, yearSummary } from '@/lib/yearly';
import { Columns, Heatmap, Kpi, RankBars, Scatter, SplitBar } from '@/components/Charts';
import { DetailSheet } from '@/components/Tiles';

const region = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
  } catch {
    return code;
  }
};
const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
const fmt = (n) => Math.round(n).toLocaleString();
const hrs = (m) => `${fmt(m / 60)} h`;
const TABS = [
  ['overview', 'Overview'],
  ['people', 'People'],
  ['time', 'When you watch'],
  ['taste', 'Taste'],
  ['canon', 'Canon'],
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const minutesOf = (e) => {
  if (e.media_type === 'movie') return (e.runtime || 110) * (e.status === 'completed' ? 1 : (e.movie_progress_pct || 0) / 100) * (1 + (e.rewatch_count || 0));
  return (e.runtime || (e.category === 'anime' ? 24 : 40)) * (e.episodes_watched || 0);
};

export default function StatsPage() {
  const router = useRouter();
  const { entries: all } = useEntries();
  const [tab, setTab] = useState('overview');
  const [f, setF] = useState({ shelf: 'all', media: 'all', period: 'all', language: '' });
  const [diaryRows, setDiaryRows] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [open, setOpen] = useState(null);
  const thisYear = new Date().getFullYear();
  const year = /^\d{4}$/.test(f.period) ? Number(f.period) : thisYear;

  useEffect(() => {
    setDiaryRows(null);
    diaryForYear(year).then(setDiaryRows);
  }, [year]);
  useEffect(() => {
    fetch('/api/benchmarks')
      .then((r) => r.json())
      .then((d) => setBenchmarks(d.benchmarks || []))
      .catch(() => setBenchmarks([]));
  }, []);

  const yearS = useMemo(() => (all && diaryRows ? yearSummary(all, diaryRows, year) : null), [all, diaryRows, year]);

  // The filter bar applies to every chart below it.
  const entries = useMemo(() => {
    if (!all) return null;
    const inPeriod = f.period === 'all' ? null : new Set((yearS?.titles || []).map((t) => t.entry.id));
    return all.filter(
      (e) =>
        (f.shelf === 'all' || e.category === f.shelf) &&
        (f.media === 'all' || (f.media === 'movie' ? e.media_type === 'movie' : e.media_type !== 'movie')) &&
        (!f.language || e.original_language === f.language) &&
        (!inPeriod || inPeriod.has(e.id))
    );
  }, [all, f, yearS]);
  const watched = useMemo(() => (entries || []).filter(isWatched), [entries]);
  const s = useMemo(() => (entries ? computeStats(entries) : null), [entries]);
  const rates = useMemo(() => (entries ? finishRates(entries) : []), [entries]);
  const usedCats = useMemo(() => CATEGORIES.filter((c) => (all || []).some((e) => e.category === c.id)), [all]);
  const usedLangs = useMemo(() => {
    const m = new Map();
    for (const e of all || []) if (e.original_language) m.set(e.original_language, (m.get(e.original_language) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const years = useMemo(() => {
    const ys = new Set([thisYear]);
    for (const e of all || []) if (e.watched_to) ys.add(Number(e.watched_to.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [all, thisYear]);

  if (!s) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;
  if (!all?.length)
    return (
      <div className="empty">
        <h1 className="h-page">No stats yet</h1>
        <p className="lede">Add what you&apos;ve watched and your numbers fill in here.</p>
        <Link href="/import" className="btn primary">
          Import a list
        </Link>
      </div>
    );

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const filtered = f.shelf !== 'all' || f.media !== 'all' || f.period !== 'all' || f.language;

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Stats</h1>
          <p className="lede">
            {s.watchedCount.toLocaleString()} titles watched
            {s.byCategory.length ? `: ${[...s.byCategory].sort((a, b) => b.count - a.count).slice(0, 4).map(countLabel).join(', ')}` : ''}.
          </p>
        </div>
        <Link href={`/wrapped/${thisYear}`} className="btn sm primary">
          Your {thisYear} Wrapped
        </Link>
      </header>

      <div className="toolbar filter-bar" aria-label="Filter every chart">
        <select id="st-period" className="select" value={f.period} onChange={set('period')} aria-label="Period">
          <option value="all">All time</option>
          {years.map((y) => (
            <option key={y} value={y}>
              Watched in {y}
            </option>
          ))}
        </select>
        <select id="st-shelf" className="select" value={f.shelf} onChange={set('shelf')} aria-label="Shelf">
          <option value="all">Every shelf</option>
          {usedCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select id="st-media" className="select" value={f.media} onChange={set('media')} aria-label="Format">
          <option value="all">Films and series</option>
          <option value="movie">Films only</option>
          <option value="tv">Series only</option>
        </select>
        <select id="st-lang" className="select" value={f.language} onChange={set('language')} aria-label="Language">
          <option value="">Any language</option>
          {usedLangs.map(([l, n]) => (
            <option key={l} value={l}>
              {languageName(l)} ({n})
            </option>
          ))}
        </select>
        {filtered && (
          <button className="btn sm ghost" onClick={() => setF({ shelf: 'all', media: 'all', period: 'all', language: '' })}>
            Clear
          </button>
        )}
      </div>
      {f.period !== 'all' && <p className="hint">Watched in {f.period} uses your diary and watch dates. Titles without a date only show under All time.</p>}

      <div className="tabs" role="tablist" style={{ justifySelf: 'start' }}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview s={s} watched={watched} entries={entries} rates={rates} yearS={yearS} />}
      {tab === 'people' && <People watched={watched} onPerson={(p) => router.push(`/person/${p.key}`)} />}
      {tab === 'time' && <Time s={s} watched={watched} yearS={yearS} year={year} years={years} onYear={(y) => setF((x) => ({ ...x, period: String(y) }))} />}
      {tab === 'taste' && <Taste s={s} watched={watched} entries={entries} onTitle={setOpen} />}
      {tab === 'canon' && <Canon entries={entries} benchmarks={benchmarks} scope={f.shelf} />}
      {open && <DetailSheet entry={open} open onClose={() => setOpen(null)} />}
    </>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ s, watched, entries, rates, yearS }) {
  const minutes = watched.reduce((a, e) => a + minutesOf(e), 0);
  const series = watched.filter((e) => e.media_type !== 'movie');
  const finishedRate = (() => {
    const ended = entries.filter((e) => ['completed', 'dropped', 'stopped', 'tried'].includes(e.status));
    return ended.length ? Math.round((ended.filter((e) => e.status === 'completed').length / ended.length) * 100) : null;
  })();
  const langs = new Set(watched.map((e) => e.original_language).filter(Boolean));
  const rewatches = watched.reduce((a, e) => a + (e.rewatch_count || 0), 0);
  const statusRows = STATUSES.map((x) => ({ key: x.id, label: x.label, value: s.status[x.id] || 0 })).filter((r) => r.value);
  const shelfRows = [...s.byCategory].sort((a, b) => b.count - a.count).map((c) => ({ key: c.id, label: c.label, value: c.count, tip: `${c.count} titles · ${Math.round((c.count / s.watchedCount) * 100)}%` }));

  return (
    <>
      <div className="kpi-grid">
        <Kpi value={fmt(minutes / 60)} label="Hours watched" sub={minutes >= 1440 ? `${(minutes / 1440).toFixed(1)} days of your life` : null} />
        <Kpi value={fmt(s.episodes)} label="Episodes" />
        <Kpi value={fmt(s.moviesFinished)} label="Films finished" />
        <Kpi value={fmt(series.length)} label="Series started" />
        <Kpi value={finishedRate != null ? `${finishedRate}%` : '–'} label="Finish rate" sub="of what you started and ended" />
        <Kpi value={s.countries.length} label="Countries" />
        <Kpi value={langs.size} label="Languages" />
        <Kpi value={s.avgRating != null ? s.avgRating.toFixed(1) : '–'} label="Average rating" sub={s.ratedCount ? `${s.ratedCount} rated` : 'Rate titles to see this'} />
        {rewatches > 0 && <Kpi value={rewatches} label="Rewatches" />}
      </div>

      <section className="panel persona">
        <p className="kicker">Your viewer personality</p>
        <h3>{s.personality.name}</h3>
        <p className="lede">{s.personality.blurb}</p>
        {s.taste && <p>{s.taste}</p>}
        {s.personality.traits.length > 0 && (
          <div className="traits">
            {s.personality.traits.map((t) => (
              <span key={t.label} className="trait" title={t.text}>
                <b>{t.label}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="dash-grid">
        <section className="dash-card">
          <h3>What you watch</h3>
          <RankBars rows={shelfRows} />
        </section>
        <section className="dash-card">
          <h3>Status of everything in your list</h3>
          <RankBars rows={statusRows} format={(v) => `${v}`} limit={8} />
        </section>
        {s.genres.length > 0 && (
          <section className="dash-card">
            <h3>Your taste DNA</h3>
            <p className="muted small card-sub">Share of your top genres</p>
            <SplitBar parts={s.genres.slice(0, 6).map((g) => ({ label: g.name, value: g.count }))} format={(v) => `${v} titles`} />
          </section>
        )}
      </div>

      <Badges s={s} watched={watched} entries={entries} yearS={yearS} langs={langs.size} finishedRate={finishedRate} rewatches={rewatches} minutes={minutes} />

      <section className="dash-card wide">
        <h3>How you finish things</h3>
        <p className="muted small card-sub">Finish rate: completed out of everything you finished or left. Watching and on hold don&apos;t count yet.</p>
        <div className="table-wrap">
          <table className="rates">
            <thead>
              <tr>
                <th>Shelf</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Finish rate</th>
                <th>Stopped</th>
                <th>Tried</th>
                <th>Dropped</th>
                <th>On hold</th>
                <th>Seen clips</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td className="num">{r.started}</td>
                  <td className="num">{r.completed}</td>
                  <td className="num">
                    {r.rate == null ? (
                      '–'
                    ) : (
                      <span className="rate-cell">
                        <span className="bar">
                          <i style={{ width: `${r.rate}%` }} />
                        </span>
                        {r.rate}%
                      </span>
                    )}
                  </td>
                  <td className="num">{r.stopped || '–'}</td>
                  <td className="num">{r.tried || '–'}</td>
                  <td className="num">{r.dropped || '–'}</td>
                  <td className="num">{r.on_hold || '–'}</td>
                  <td className="num">{r.clips || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Badges({ s, watched, entries, yearS, langs, finishedRate, rewatches, minutes }) {
  const ended = entries.filter((e) => ['completed', 'dropped', 'stopped', 'tried'].includes(e.status)).length;
  const reviews = entries.filter((e) => e.review).length;
  const anime = watched.filter((e) => e.category === 'anime').length;
  const list = [
    ['First fifty', 'Watch 50 titles', watched.length, 50],
    ['Century', 'Watch 100 titles', watched.length, 100],
    ['Five hundred club', 'Watch 500 titles', watched.length, 500],
    ['Globetrotter', 'Titles from 10 countries', s.countries.length, 10],
    ['Polyglot', 'Titles in 5 languages', langs, 5],
    ['Day one', '24 hours watched', Math.round(minutes / 60), 24],
    ['Week of your life', '168 hours watched', Math.round(minutes / 60), 168],
    ['Anime 100', '100 anime', anime, 100],
    ['Completionist', 'Finish 80% of 20+ titles you end', ended >= 20 ? finishedRate || 0 : 0, 80],
    ['Critic', 'Rate 50 titles', s.ratedCount, 50],
    ['Reviewer', 'Write 10 reviews', reviews, 10],
    ['Comfort rewatcher', 'Rewatch 5 times', rewatches, 5],
    ['On a roll', 'A 7-day streak this year', yearS?.streak.best || 0, 7],
    ['Marathon', '8 hours in one day this year', yearS?.bingeDay ? Math.round(yearS.bingeDay.minutes / 60) : 0, 8],
  ].map(([name, how, have, need]) => ({ name, how, have, need, done: have >= need, pct: Math.min(100, Math.round((have / need) * 100)) }));
  const earned = list.filter((b) => b.done).length;
  return (
    <section className="dash-card wide">
      <h3>
        Badges <span className="muted small">{earned} of {list.length}</span>
      </h3>
      <div className="badges">
        {list.map((b) => (
          <div key={b.name} className={`badge ${b.done ? 'on' : ''}`} title={b.how}>
            <b>{b.name}</b>
            <span className="muted small">{b.done ? b.how : `${b.have.toLocaleString()} / ${b.need.toLocaleString()}`}</span>
            {!b.done && (
              <span className="meter" aria-hidden="true">
                <i style={{ width: `${b.pct}%` }} />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- People ---------------- */

function tallyPeople(list, key, filter = () => true) {
  const m = new Map();
  for (const e of list)
    for (const p of e.credits?.[key] || []) {
      if (!filter(p)) continue;
      const cur = m.get(p[0]) || { key: p[0], label: p[1], img: p[3] ? `https://image.tmdb.org/t/p/w185${p[3]}` : null, titles: [], minutes: 0 };
      cur.titles.push(e);
      cur.minutes += minutesOf(e);
      m.set(p[0], cur);
    }
  return [...m.values()]
    .map((p) => ({ ...p, value: p.titles.length, sub: p.titles.slice(0, 3).map((t) => t.title).join(', '), tip: `${p.titles.length} titles · ${hrs(p.minutes)}` }))
    .sort((a, b) => b.value - a.value || b.minutes - a.minutes);
}

function People({ watched, onPerson }) {
  const [v4, setV4] = useState(null);
  const [prog, setProg] = useState(null);
  const ctrl = useRef(null);
  const missing = watched.filter((e) => !e.credits);

  useEffect(() => {
    hasV4().then(setV4);
  }, []);
  useEffect(() => {
    if (!v4 || !missing.length || prog || missing.length > 400) return;
    start();
    return () => ctrl.current && (ctrl.current.aborted = true);
  }, [v4]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    ctrl.current = { aborted: false };
    setProg({ done: 0, total: missing.length });
    backfillCredits(missing, { signal: ctrl.current, onProgress: setProg }).then((r) => setProg({ ...r, finished: true }));
  }

  const actors = tallyPeople(watched, 'c', (p) => p[2] === 2);
  const actresses = tallyPeople(watched, 'c', (p) => p[2] === 1);
  const directors = tallyPeople(watched, 'd');
  const writers = tallyPeople(watched, 'w');
  const composers = tallyPeople(watched, 'm');
  const studios = tallyPeople(watched, 's').map((p) => ({ ...p, img: undefined }));
  const networks = tallyPeople(watched, 'n').map((p) => ({ ...p, img: undefined }));
  const pick = (p) => typeof p.key === 'number' && onPerson(p);
  const withCredits = watched.length - missing.length;

  return (
    <>
      {v4 === false && <p className="notice">People stats need the version 4 database upgrade. Run supabase/upgrade_v4.sql in Supabase (see README).</p>}
      {v4 && missing.length > 0 && (
        <div className="panel row" style={{ padding: 16, justifyContent: 'space-between' }}>
          <span className="muted">
            {prog && !prog.finished
              ? `Gathering cast and crew… ${prog.done} of ${prog.total}`
              : `${withCredits} of ${watched.length} titles have cast and crew.${prog?.failed ? ` ${prog.failed} couldn't be looked up.` : ''}`}
          </span>
          {(!prog || prog.finished) && (
            <button className="btn sm" onClick={start}>
              Fill in the rest
            </button>
          )}
          {prog && !prog.finished && (
            <div className="meter" style={{ flex: '1 1 160px', maxWidth: 260 }}>
              <i style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      <div className="dash-grid">
        <PeopleCard title="Actors you've watched most" rows={actors} onPick={pick} />
        <PeopleCard title="Actresses you've watched most" rows={actresses} onPick={pick} />
        <PeopleCard title="Directors and creators" rows={directors} onPick={pick} />
        <PeopleCard title="Writers" rows={writers} onPick={pick} />
        <PeopleCard title="Composers" rows={composers} onPick={pick} />
        <PeopleCard title="Studios" rows={studios} />
        {networks.length > 0 && <PeopleCard title="Channels and networks" rows={networks} />}
      </div>
      {!withCredits && v4 && !prog && <p className="muted">Cast and crew appear here once your titles have been looked up.</p>}
      <p className="hint">Counted from the main cast and crew of every title you&apos;ve started. Anime voice casts come from TMDB once anime is linked to TMDB.</p>
    </>
  );
}
function PeopleCard({ title, rows, onPick }) {
  if (!rows.length) return null;
  return (
    <section className="dash-card">
      <h3>{title}</h3>
      <RankBars rows={rows} format={(v) => `${v} ${v === 1 ? 'title' : 'titles'}`} onPick={onPick} limit={10} />
    </section>
  );
}

/* ---------------- When you watch ---------------- */

function Time({ s, watched, yearS, year, years, onYear }) {
  const thisYear = new Date().getFullYear();
  const releaseYears = s.years.filter((y) => y.year >= thisYear - 29);
  const yearMap = new Map(releaseYears.map((y) => [y.year, y.count]));
  const ys = Array.from({ length: 30 }, (_, i) => thisYear - 29 + i);
  const runtimeRows = (() => {
    const b = [
      ['Under 90 min', 0, 90],
      ['90–120 min', 90, 121],
      ['2–2½ hours', 121, 151],
      ['Over 2½ hours', 151, 999],
    ];
    const films = watched.filter((e) => e.media_type === 'movie' && e.runtime);
    return b.map(([label, lo, hi]) => ({ key: label, label, value: films.filter((e) => e.runtime >= lo && e.runtime < hi).length }));
  })();
  return (
    <>
      {yearS && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h-section">{year}</h2>
            <select className="select inline" value={year} onChange={(e) => onYear(Number(e.target.value))} aria-label="Year">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="kpi-grid">
            <Kpi value={`${fmt(yearS.hours)} h`} label="Watched (about)" />
            <Kpi value={yearS.activeDays} label="Days with something" />
            <Kpi value={`${yearS.streak.best} ${yearS.streak.best === 1 ? 'day' : 'days'}`} label="Longest streak" />
            <Kpi value={yearS.bingeDay ? hrs(yearS.bingeDay.minutes) : '–'} label="Biggest binge day" sub={yearS.bingeDay ? new Date(`${yearS.bingeDay.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : null} />
          </div>
          <div className="dash-grid">
            <section className="dash-card">
              <h3>Hours by month</h3>
              <Columns data={yearS.months.map((m, i) => ({ label: `${MONTHS[i]} ${year}`, short: MONTHS[i][0], value: Math.round(m.minutes / 60), tip: `${hrs(m.minutes)} · ${m.titles} titles` }))} format={(v) => `${v} h`} />
            </section>
            <section className="dash-card">
              <h3>Your watching days</h3>
              <Columns data={WEEKDAYS.map((d, i) => ({ label: d, value: Math.round(yearS.weekday[i] / 60), tip: hrs(yearS.weekday[i]) }))} format={(v) => `${v} h`} />
            </section>
          </div>
          <section className="dash-card wide">
            <h3>Every day of {year}</h3>
            <Heatmap year={year} values={yearS.days} format={(m) => hrs(m)} />
          </section>
        </>
      )}
      <div className="dash-grid">
        <section className="dash-card">
          <h3>By release year</h3>
          <p className="muted small card-sub">The last 30 years</p>
          <Columns data={ys.map((y) => ({ label: String(y), short: y % 5 === 0 ? `’${String(y).slice(2)}` : '', value: yearMap.get(y) || 0, tip: `${yearMap.get(y) || 0} titles` }))} format={(v) => `${v} titles`} />
        </section>
        <section className="dash-card">
          <h3>By decade</h3>
          <RankBars rows={[...s.decades].reverse().map((d) => ({ key: d.label, label: d.label, value: d.count, tip: `${d.count} titles · ${Math.round((d.count / s.watchedCount) * 100)}%` }))} limit={12} />
        </section>
        {runtimeRows.some((r) => r.value) && (
          <section className="dash-card">
            <h3>Film lengths you watch</h3>
            <RankBars rows={runtimeRows} format={(v) => `${v} films`} />
          </section>
        )}
      </div>
    </>
  );
}

/* ---------------- Taste ---------------- */

function Taste({ s, watched, entries, onTitle }) {
  const genreRows = s.genres.slice(0, 12).map((g) => ({ key: g.name, label: g.name, value: g.count }));
  const langMap = new Map();
  for (const e of watched) if (e.original_language) langMap.set(e.original_language, (langMap.get(e.original_language) || 0) + 1);
  const langRows = [...langMap.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ key: l, label: languageName(l), value: n }));
  const countryRows = s.countries.map((c) => ({ key: c.code, label: `${flag(c.code)} ${region(c.code)}`, value: c.count }));
  const rated = entries.filter((e) => e.rating != null);
  const dist = Array.from({ length: 10 }, (_, i) => ({ label: `${i + 1}/10`, short: String(i + 1), value: rated.filter((e) => Math.round(e.rating) === i + 1).length }));
  const vs = rated.filter((e) => e.tmdb_rating).map((e) => ({ x: Number(e.tmdb_rating), y: Number(e.rating), label: e.title, e }));
  const diff = vs.length ? vs.reduce((a, p) => a + (p.y - p.x), 0) / vs.length : null;
  const hotTakes = [...vs].sort((a, b) => Math.abs(b.y - b.x) - Math.abs(a.y - a.x)).slice(0, 6);
  const rewatched = watched.filter((e) => e.rewatch_count > 0).sort((a, b) => b.rewatch_count - a.rewatch_count).slice(0, 8);
  const tags = new Map();
  for (const e of entries) for (const t of e.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  const genreRating = (() => {
    const m = new Map();
    for (const e of rated) for (const g of e.genres || []) {
      const c = m.get(g) || { sum: 0, n: 0 };
      c.sum += Number(e.rating);
      c.n++;
      m.set(g, c);
    }
    return [...m.entries()].filter(([, c]) => c.n >= 3).map(([g, c]) => ({ key: g, label: g, value: Math.round((c.sum / c.n) * 10) / 10, tip: `Average ${(c.sum / c.n).toFixed(1)} from ${c.n} ratings` })).sort((a, b) => b.value - a.value);
  })();

  return (
    <div className="dash-grid">
      {genreRows.length > 0 && (
        <section className="dash-card">
          <h3>Genres</h3>
          <RankBars rows={genreRows} format={(v) => `${v} titles`} limit={12} />
        </section>
      )}
      {genreRating.length > 0 && (
        <section className="dash-card">
          <h3>Genres you rate highest</h3>
          <RankBars rows={genreRating} format={(v) => `${v}/10`} max={10} limit={10} />
        </section>
      )}
      <section className="dash-card">
        <h3>Languages</h3>
        <RankBars rows={langRows} format={(v) => `${v} titles`} limit={10} />
      </section>
      <section className="dash-card">
        <h3>Countries</h3>
        <RankBars rows={countryRows} format={(v) => `${v} titles`} limit={12} />
      </section>
      {rated.length > 0 && (
        <section className="dash-card">
          <h3>How you rate</h3>
          <Columns data={dist} format={(v) => `${v} titles`} />
        </section>
      )}
      {vs.length >= 3 && (
        <section className="dash-card">
          <h3>You vs the world</h3>
          <p className="muted small card-sub">
            {diff > 0.3 ? `You rate ${diff.toFixed(1)} points kinder than TMDB on average.` : diff < -0.3 ? `You rate ${(-diff).toFixed(1)} points harsher than TMDB on average.` : 'You rate almost exactly like everyone else.'} Dots above the dashed line are ones you liked more.
          </p>
          <Scatter points={vs} />
          <div className="stack-sm">
            <span className="field-label">Your hottest takes</span>
            {hotTakes.map((p) => (
              <button key={p.e.id} className="as-button hot-take" onClick={() => onTitle(p.e)}>
                <b>{p.label}</b>
                <span className="muted small">
                  You {p.y} · world {p.x.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {rewatched.length > 0 && (
        <section className="dash-card">
          <h3>Most rewatched</h3>
          <RankBars rows={rewatched.map((e) => ({ key: e.id, label: e.title, value: e.rewatch_count + 1, e }))} format={(v) => `seen ${v}×`} onPick={(r) => onTitle(r.e)} />
        </section>
      )}
      {tags.size > 0 && (
        <section className="dash-card">
          <h3>Your tags</h3>
          <RankBars rows={[...tags.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ key: t, label: t, value: n }))} format={(v) => `${v} titles`} />
        </section>
      )}
      {s.topRated.length > 0 && (
        <section className="dash-card">
          <h3>Your highest rated</h3>
          <RankBars rows={s.topRated.map((e) => ({ key: e.id, label: e.title, value: Number(e.rating), sub: CATEGORY_LABEL[e.category], e }))} format={(v) => `${v}/10`} max={10} onPick={(r) => onTitle(r.e)} />
        </section>
      )}
    </div>
  );
}

/* ---------------- Canon ---------------- */

function Canon({ entries, benchmarks, scope }) {
  const ranks = useMemo(() => (entries && benchmarks ? completionRankings(entries, scope === 'all' ? benchmarks : benchmarks.filter((b) => b.category === scope)) : null), [entries, benchmarks, scope]);
  return (
    <section className="dash-card wide">
      <h3>How much of the canon you&apos;ve seen</h3>
      <p className="muted small card-sub">Each list is the best-known titles of its kind, refreshed daily.</p>
      {!ranks ? (
        <div className="skeleton" style={{ height: 160, aspectRatio: 'auto' }} />
      ) : ranks.length === 0 ? (
        <p className="muted small">Rankings are unavailable right now.</p>
      ) : (
        <div className="bench">
          {[...ranks]
            .sort((a, b) => b.pct - a.pct)
            .map((r) => (
              <div key={r.id} className="bench-row">
                <div className="spread small">
                  <span>{r.label}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="muted num">
                      {r.watched}/{r.total}
                    </span>
                    <span className={`tier ${r.tier}`}>{r.tier}</span>
                  </span>
                </div>
                <div className="bar" title={`${r.pct}%`}>
                  <i style={{ width: `${Math.max(r.pct, 0.5)}%` }} />
                </div>
              </div>
            ))}
        </div>
      )}
      {entries.some((e) => e.source === 'anilist') && (
        <p className="hint">
          Anime saved from AniList doesn&apos;t count here yet. <Link href="/settings" className="link">Link them to TMDB</Link> in Settings.
        </p>
      )}
    </section>
  );
}

