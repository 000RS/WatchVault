'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries } from '@/lib/store';
import { completionRankings, computeStats } from '@/lib/stats';
import { STATUS_LABEL } from '@/lib/categories';

const region = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
  } catch {
    return code;
  }
};
const fmt = (n) => Math.round(n).toLocaleString();

export default function StatsPage() {
  const { entries } = useEntries();
  const [benchmarks, setBenchmarks] = useState(null);
  const s = useMemo(() => (entries ? computeStats(entries) : null), [entries]);

  useEffect(() => {
    fetch('/api/benchmarks')
      .then((r) => r.json())
      .then((d) => setBenchmarks(d.benchmarks || []))
      .catch(() => setBenchmarks([]));
  }, []);

  const ranks = useMemo(() => (entries && benchmarks ? completionRankings(entries, benchmarks) : null), [entries, benchmarks]);

  if (!s) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;
  if (!s.total)
    return (
      <div className="empty">
        <h1 className="h-page">No stats yet</h1>
        <p className="lede">Add what you&apos;ve watched and your numbers fill in here.</p>
        <Link href="/import" className="btn primary">
          Import a list
        </Link>
      </div>
    );

  const yearsShown = s.years.filter((y) => y.year >= new Date().getFullYear() - 29);
  const yearMax = Math.max(1, ...yearsShown.map((y) => y.count));
  const peakYear = yearsShown.reduce((a, b) => (b.count > (a?.count || 0) ? b : a), null);
  const catMax = Math.max(1, ...s.byCategory.map((c) => c.count));

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="h-page">Stats</h1>
          <p className="lede">
            {s.watchedCount.toLocaleString()} titles watched:{' '}
            {[...s.byCategory]
              .sort((a, b) => b.count - a.count)
              .map((c) => `${c.count} ${c.label.toLowerCase()}`)
              .join(', ')}
            .
          </p>
        </div>
      </header>

      <div className="kpis">
        <Kpi v={fmt(s.hours)} l="hours" n={s.hours >= 24 ? `about ${(s.hours / 24).toFixed(1)} days` : 'of watching'} />
        <Kpi v={fmt(s.episodes)} l="episodes" n="across every series" />
        <Kpi v={fmt(s.moviesFinished)} l="movies" n="watched to the end" />
        <Kpi v={s.countries.length} l={s.countries.length === 1 ? 'country' : 'countries'} n="stories come from" />
        <Kpi v={s.avgRating != null ? s.avgRating.toFixed(1) : '–'} l="average rating" n={s.ratedCount ? `from ${s.ratedCount} ratings` : 'rate titles to see this'} />
      </div>

      <section className="panel persona">
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

      <div className="dash">
        <section className="panel">
          <h2 className="h-sub">What you watch</h2>
          <ul className="bars">
            {[...s.byCategory]
              .sort((a, b) => b.count - a.count)
              .map((c) => (
                <li key={c.id}>
                  <div className="spread small">
                    <span>{c.label}</span>
                    <span className="muted num">
                      {c.count}, {Math.round((c.count / s.watchedCount) * 100)}%
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(c.count / catMax) * 100}%` }} />
                  </div>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="h-sub">By release year</h2>
          {yearsShown.length ? (
            <>
              <div className="cols" role="img" aria-label="Titles watched by release year, last 30 years">
                {yearsShown.map((y) => (
                  <div key={y.year} title={`${y.year}: ${y.count}`}>
                    <i className={y === peakYear ? 'peak' : ''} style={{ height: `${(y.count / yearMax) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="spread small muted num">
                <span>{yearsShown[0].year}</span>
                <span>Peak: {peakYear?.year} ({peakYear?.count})</span>
                <span>{yearsShown[yearsShown.length - 1].year}</span>
              </div>
            </>
          ) : (
            <p className="muted small">Years appear once titles have release dates.</p>
          )}
          <ul className="bars">
            {s.decades.map((d) => (
              <li key={d.label}>
                <div className="spread small">
                  <span>{d.label}</span>
                  <span className="muted num">{Math.round((d.count / s.watchedCount) * 100)}%</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${(d.count / Math.max(...s.decades.map((x) => x.count))) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="h-sub">Status</h2>
          <ul className="bars">
            {s.byStatus
              .filter((x) => x.count)
              .map((x) => (
                <li key={x.id}>
                  <div className="spread small">
                    <span>
                      <span className={`dot st-${x.id}`} />
                      {STATUS_LABEL[x.id]}
                    </span>
                    <span className="muted num">{x.count}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(x.count / s.total) * 100}%`, background: `var(--${x.id})` }} />
                  </div>
                </li>
              ))}
          </ul>
        </section>

        {s.genres.length > 0 && (
          <section className="panel">
            <h2 className="h-sub">Genres</h2>
            <ul className="bars">
              {s.genres.slice(0, 8).map((g) => (
                <li key={g.name}>
                  <div className="spread small">
                    <span>{g.name}</span>
                    <span className="muted num">{g.count}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(g.count / s.genres[0].count) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.countries.length > 0 && (
          <section className="panel">
            <h2 className="h-sub">Where it&apos;s from</h2>
            <ul className="bars">
              {s.countries.slice(0, 8).map((c) => (
                <li key={c.code}>
                  <div className="spread small">
                    <span>{region(c.code)}</span>
                    <span className="muted num">{c.count}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(c.count / s.countries[0].count) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel">
          <h2 className="h-sub">How much of the canon you&apos;ve seen</h2>
          <p className="muted small">Each list is the best-known titles of its kind, refreshed daily.</p>
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
                    <div className="bar">
                      <i style={{ width: `${Math.max(r.pct, 0.5)}%`, background: 'var(--accent)' }} />
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

        {s.topRated.length > 0 && (
          <section className="panel">
            <h2 className="h-sub">Your highest rated</h2>
            <ol className="ranked">
              {s.topRated.map((e, i) => (
                <li key={e.id} className="rank-row" style={{ gridTemplateColumns: '34px minmax(0,1fr) auto' }}>
                  <span className="rank-num">{i + 1}</span>
                  <span className="rank-title">{e.title}</span>
                  <span className="muted num">{Number(e.rating)}/10</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}

function Kpi({ v, l, n }) {
  return (
    <div className="kpi">
      <span className="kpi-v">{v}</span>
      <span className="kpi-l">{l}</span>
      <span className="muted small">{n}</span>
    </div>
  );
}
