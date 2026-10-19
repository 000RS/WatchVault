'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useList } from '@/components/useList';
import { computeStats } from '@/lib/stats';
import { STATUS_LABEL } from '@/lib/categories';
import { titleHref } from '@/components/PosterCard';

let regionNames = null;
function countryName(code) {
  try {
    regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code);
  } catch {
    return code;
  }
}

const fmt = (n) => Math.round(n).toLocaleString('en');

export default function StatsPage() {
  const { entries, error } = useList();
  const s = useMemo(() => (entries ? computeStats(entries) : null), [entries]);

  if (error) return <div className="notice error">Couldn&apos;t load your list: {error}</div>;
  if (!s) return <p className="muted">Loading…</p>;
  if (s.total === 0) {
    return (
      <div className="center">
        <div className="stack" style={{ maxWidth: 420 }}>
          <h1>No stats yet</h1>
          <p className="muted">Add a few titles you&apos;ve watched and your dashboard fills in.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href="/search" className="btn primary">Search titles</Link>
            <Link href="/import" className="btn">Import anime list</Link>
          </div>
        </div>
      </div>
    );
  }

  const days = s.hours / 24;
  const breakdown = s.byCategory.map((c) => `${c.count} ${c.label.toLowerCase()}`).join(', ');

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <span className="tag">Your watching, in numbers</span>
        <h1>
          You&apos;ve watched <span style={{ color: 'var(--accent)' }}>{fmt(s.watchedCount)}</span> titles
        </h1>
        {breakdown && <p className="muted">{breakdown}.</p>}
      </div>

      <div className="kpis">
        <Kpi value={fmt(s.hours)} unit="hours" note={days >= 1 ? `about ${days.toFixed(1)} days` : 'and counting'} />
        <Kpi value={fmt(s.episodes)} unit="episodes" note="across anime and series" />
        <Kpi value={fmt(s.moviesFinished)} unit="movies" note="finished" />
        <Kpi value={fmt(s.countries.length)} unit="countries" note="of origin" />
        <Kpi value={s.avgRating != null ? s.avgRating.toFixed(1) : '—'} unit="avg rating" note={s.ratedCount ? `from ${s.ratedCount} ratings` : 'rate titles to see this'} />
      </div>

      <section className="panel persona">
        <span className="tag">Your viewer personality · just for fun</span>
        <h2 className="persona-name">{s.personality.name}</h2>
        <p style={{ maxWidth: '62ch' }}>{s.personality.blurb}</p>
        {s.personality.traits.length > 0 && (
          <div className="traits">
            {s.personality.traits.map((t) => (
              <div key={t.label} className="trait">
                <b>{t.label}</b>
                <span className="small muted">{t.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="dash">
        <section className="panel">
          <h2>What you watch</h2>
          <Donut data={s.byCategory} total={s.watchedCount} />
        </section>

        <section className="panel">
          <h2>Status</h2>
          <Bars
            data={s.byStatus.filter((x) => x.count).map((x) => ({ key: x.id, label: STATUS_LABEL[x.id], count: x.count, color: `var(--${x.id})` }))}
            total={s.total}
          />
        </section>

        {s.countries.length > 0 && (
          <section className="panel">
            <h2>Where it&apos;s from</h2>
            <Bars data={s.countries.slice(0, 7).map((c) => ({ key: c.code, label: countryName(c.code), count: c.count }))} total={s.watchedCount} />
          </section>
        )}

        {s.decades.length > 0 && (
          <section className="panel">
            <h2>Release decade</h2>
            <Bars data={s.decades.map((d) => ({ key: d.label, label: d.label, count: d.count }))} total={s.watchedCount} />
          </section>
        )}

        {s.topRated.length > 0 && (
          <section className="panel">
            <h2>Your highest rated</h2>
            <ol className="toplist">
              {s.topRated.map((e) => (
                <li key={e.id}>
                  <Link href={titleHref(e.source, e.media_type, e.source_id)}>{e.title}</Link>
                  <span className="mono">★ {Number(e.rating)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}

function Kpi({ value, unit, note }) {
  return (
    <div className="kpi">
      <div className="kpi-value mono">{value}</div>
      <div className="kpi-unit">{unit}</div>
      <div className="small muted">{note}</div>
    </div>
  );
}

function Donut({ data, total }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const top = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 200 200" className="donut" role="img" aria-label="Share of watched titles by shelf">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
        {data.map((d) => {
          const len = (d.count / total) * c;
          const seg = (
            <circle
              key={d.id}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke={`var(--c-${d.id})`}
              strokeWidth="26"
              strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            />
          );
          offset += len;
          return seg;
        })}
        {top && (
          <>
            <text x="100" y="96" textAnchor="middle" className="donut-big">{Math.round((top.count / total) * 100)}%</text>
            <text x="100" y="118" textAnchor="middle" className="donut-small">{top.label}</text>
          </>
        )}
      </svg>
      <ul className="legend">
        {data.map((d) => (
          <li key={d.id}>
            <i style={{ background: `var(--c-${d.id})` }} />
            <span>{d.label}</span>
            <span className="mono muted">{d.count} · {Math.round((d.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ data, total }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="hbars">
      {data.map((d) => (
        <li key={d.key}>
          <div className="spread small">
            <span>{d.label}</span>
            <span className="mono muted">
              {d.count} · {Math.round((d.count / Math.max(total, 1)) * 100)}%
            </span>
          </div>
          <div className="hbar">
            <i style={{ width: `${(d.count / max) * 100}%`, background: d.color || 'var(--accent)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
