'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Poster from './Poster';
import { DetailSheet } from './Tiles';
import { Icon } from './Icons';
import { progressFor } from '@/lib/list';
import { updateEntry } from '@/lib/store';
import { toast } from '@/lib/toast';
import { diaryForYear, goalProgress, yearSummary } from '@/lib/yearly';

/** Where you are in each series, with a one-tap "watched the next episode". */
export function nextEpisodeOf(e) {
  const counts = e.season_episode_counts || [];
  if (e.media_type === 'movie') return null;
  if (counts.length) {
    let s = e.current_season || 1;
    let ep = (e.current_episode || 0) + 1;
    if (ep > (counts[s - 1] || 0)) {
      if (s >= counts.length) return null;
      s += 1;
      ep = 1;
    }
    return { season: s, episode: ep, label: `S${s} · E${ep}`, left: counts.reduce((a, b) => a + b, 0) - (e.episodes_watched || 0) };
  }
  const n = (e.episodes_watched || 0) + 1;
  if (e.total_episodes && n > e.total_episodes) return null;
  return { episodes: n, label: `Episode ${n}`, left: e.total_episodes ? e.total_episodes - n + 1 : null };
}

export function UpNext({ entries }) {
  const list = useMemo(
    () =>
      entries
        .filter((e) => e.status === 'watching' && e.media_type !== 'movie')
        .map((e) => ({ e, next: nextEpisodeOf(e) }))
        .filter((x) => x.next)
        .sort((a, b) => new Date(b.e.updated_at) - new Date(a.e.updated_at)),
    [entries]
  );
  const [open, setOpen] = useState(null);
  if (!list.length) return null;

  function watched({ e, next }) {
    const p = next.season ? progressFor(e, { status: 'watching', season: next.season, episode: next.episode }) : progressFor(e, { status: 'watching', episodes: next.episodes });
    updateEntry(e.id, p)
      .then(() => p.status === 'completed' && toast(`Finished ${e.title}!`))
      .catch((err) => toast(err.message, { kind: 'error' }));
  }

  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2 className="h-section">Up next</h2>
        <Link href="/calendar" className="link small">
          Calendar
        </Link>
      </div>
      <div className="shelf-track upnext-track">
        {list.slice(0, 20).map((x) => (
          <div key={x.e.id} className="upnext">
            <button className="as-button upnext-poster" onClick={() => setOpen(x.e)} aria-label={`${x.e.title}, details`}>
              <Poster src={x.e.poster_url} title={x.e.title} />
            </button>
            <div className="upnext-text">
              <b className="tile-title">{x.e.title}</b>
              <span className="muted small">
                {x.next.label}
                {x.next.left > 1 ? ` · ${x.next.left} to go` : x.next.left === 1 ? ' · last one' : ''}
              </span>
              <button className="btn sm primary" onClick={() => watched(x)}>
                <Icon.Check width={14} height={14} /> Watched
              </button>
            </div>
          </div>
        ))}
      </div>
      {open && <DetailSheet entry={open} open onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Goals for this year, plus a door into Wrapped. */
export function GoalsCard({ entries, profile }) {
  const year = new Date().getFullYear();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    diaryForYear(year).then(setRows);
  }, [year]);
  const s = useMemo(() => (rows ? yearSummary(entries || [], rows, year) : null), [entries, rows, year]);
  if (!s) return null;
  const goals = goalProgress(s, profile?.goals?.[year]);
  const month = new Date().getMonth();
  if (!goals.length && !s.titlesTouched) return null;
  return (
    <section className="goals-card panel">
      <div className="goals-head">
        <div>
          <p className="kicker">{year} so far</p>
          <h2 className="h-section">
            {s.hours.toLocaleString()} hours · {s.finished} finished
            {s.streak.current > 1 ? ` · ${s.streak.current}-day streak` : ''}
          </h2>
        </div>
        <div className="row">
          <Link href={`/wrapped/${year}`} className="btn sm primary">
            {month >= 10 ? `Your ${year} Wrapped` : month >= 5 ? 'Half-year Wrapped' : 'Your year so far'}
          </Link>
          {!goals.length && (
            <Link href="/settings" className="btn sm ghost">
              Set goals
            </Link>
          )}
        </div>
      </div>
      {goals.length > 0 && (
        <div className="goal-bars">
          {goals.map((g) => (
            <div key={g.key} className="goal">
              <div className="goal-label">
                <span>{g.label}</span>
                <b>
                  {g.value.toLocaleString()} <span className="muted">/ {g.target.toLocaleString()}</span>
                </b>
              </div>
              <div className="meter" role="meter" aria-valuenow={g.value} aria-valuemin={0} aria-valuemax={g.target} aria-label={g.label} title={`${g.pct}% of your goal`}>
                <i style={{ width: `${g.pct}%` }} />
              </div>
              <span className="muted small">{g.pct >= 100 ? 'Goal reached' : g.ahead >= 0 ? `${g.ahead.toLocaleString()} ahead of pace` : `${(-g.ahead).toLocaleString()} behind pace`}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
