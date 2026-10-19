'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, STATUSES, episodesUpTo } from '@/lib/categories';
import { deleteEntry, saveEntry, snapshotFromTitle } from '@/lib/list';

const MOVIE_STEPS = [
  { pct: 0, label: 'Not started' },
  { pct: 25, label: 'A quarter' },
  { pct: 50, label: 'Half' },
  { pct: 75, label: 'Three-quarters' },
  { pct: 100, label: 'Finished' },
];

function initialForm(title, entry) {
  return {
    status: entry?.status || 'plan',
    category: entry?.category || title.category,
    season: entry?.current_season || 1,
    episode: entry?.current_episode ?? 0,
    episodes: entry?.episodes_watched ?? 0,
    pct: entry?.movie_progress_pct ?? (entry?.status === 'completed' ? 100 : 0),
    minutes: entry?.movie_minutes_watched ?? '',
    rating: entry?.rating ?? '',
    notes: entry?.notes || '',
  };
}

export default function ProgressEditor({ title, entry, onSaved, onRemoved }) {
  const [f, setF] = useState(() => initialForm(title, entry));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isMovie = title.mediaType === 'movie';
  const isTvSeasons = title.mediaType === 'tv' && title.seasons.length > 0;
  const counts = useMemo(() => title.seasons.map((s) => s.episodes || 0), [title.seasons]);
  const total = title.totalEpisodes || (counts.length ? counts.reduce((a, b) => a + b, 0) : null);
  const seasonCount = counts[f.season - 1] || null;
  const tvWatched = isTvSeasons ? episodesUpTo(counts, f.season, f.episode) : null;

  // Change progress and nudge the status along with it.
  function setProgress(patch) {
    setF((prev) => {
      const next = { ...prev, ...patch };
      const watched = isMovie
        ? next.pct
        : isTvSeasons
          ? episodesUpTo(counts, next.season, next.episode)
          : Number(next.episodes) || 0;
      const done = isMovie ? watched >= 100 : total ? watched >= total : false;
      if (done) next.status = 'completed';
      else if (watched > 0 && (next.status === 'plan' || next.status === 'completed')) next.status = 'watching';
      return next;
    });
    setMsg(null);
  }

  function setStatus(status) {
    setMsg(null);
    if (status !== 'completed') return setF((p) => ({ ...p, status }));
    // Completed: fill progress to the end when we know where the end is.
    if (isMovie) return setF((p) => ({ ...p, status, pct: 100, minutes: title.runtime || p.minutes }));
    if (isTvSeasons) return setF((p) => ({ ...p, status, season: counts.length, episode: counts[counts.length - 1] || p.episode }));
    return setF((p) => ({ ...p, status, episodes: total || p.episodes }));
  }

  function plusOne() {
    if (isTvSeasons) {
      let season = f.season;
      let episode = f.episode + 1;
      if (seasonCount && episode > seasonCount) {
        if (season < counts.length) {
          season += 1;
          episode = 1;
        } else episode = seasonCount;
      }
      setProgress({ season, episode });
    } else {
      const next = (Number(f.episodes) || 0) + 1;
      setProgress({ episodes: total ? Math.min(next, total) : next });
    }
  }

  function setMinutes(value) {
    const minutes = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
    const patch = { minutes };
    if (title.runtime && minutes !== '') patch.pct = Math.min(100, Math.round((minutes / title.runtime) * 100));
    setProgress(patch);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const rating = f.rating === '' ? null : Math.min(10, Math.max(0, Number(f.rating)));
      const row = {
        ...snapshotFromTitle(title),
        category: f.category,
        status: f.status,
        current_season: isTvSeasons ? f.season : null,
        current_episode: isTvSeasons ? f.episode : null,
        episodes_watched: isMovie ? null : isTvSeasons ? tvWatched : Number(f.episodes) || 0,
        movie_progress_pct: isMovie ? f.pct : null,
        movie_minutes_watched: isMovie && f.minutes !== '' ? Number(f.minutes) : null,
        rating,
        notes: f.notes.trim() || null,
      };
      const saved = await saveEntry(row);
      onSaved?.(saved);
      setMsg({ kind: 'ok', text: entry ? 'Saved.' : 'Added to your list.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await deleteEntry(entry.id);
      setF(initialForm(title, null));
      setConfirmRemove(false);
      onRemoved?.();
      setMsg({ kind: 'ok', text: 'Removed from your list.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-label="Your progress">
      <div className="spread">
        <h2>{entry ? 'Your progress' : 'Add to your list'}</h2>
        {entry && <span className={`pill ${entry.status}`}>In your list</span>}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span className="tag">Status</span>
        <div className="seg">
          {STATUSES.map((s) => (
            <button key={s.id} type="button" className={`st-${s.id} ${f.status === s.id ? 'on' : ''}`} onClick={() => setStatus(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {isMovie && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="tag">How much have you watched?</span>
          <div className="seg">
            {MOVIE_STEPS.map((s) => (
              <button
                key={s.pct}
                type="button"
                className={f.pct === s.pct ? 'on' : ''}
                onClick={() => setProgress({ pct: s.pct, minutes: title.runtime ? Math.round((title.runtime * s.pct) / 100) : f.minutes })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="formgrid">
            <label className="field">
              Minutes watched{title.runtime ? ` (of ${title.runtime})` : ''}
              <input id="minutes" className="input mono" type="number" min="0" max={title.runtime || undefined} value={f.minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
            <label className="field">
              Percent watched
              <input id="pct" className="input mono" type="number" min="0" max="100" value={f.pct} onChange={(e) => setProgress({ pct: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
            </label>
          </div>
        </div>
      )}

      {isTvSeasons && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="tag">Where are you?</span>
          <div className="formgrid">
            <label className="field">
              Season
              <select
                id="season"
                className="select"
                value={f.season}
                onChange={(e) => setProgress({ season: Number(e.target.value), episode: Math.min(f.episode, counts[Number(e.target.value) - 1] || f.episode) })}
              >
                {title.seasons.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.name || `Season ${s.number}`} ({s.episodes} eps)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Last episode watched{seasonCount ? ` (of ${seasonCount})` : ''}
              <input
                id="episode"
                className="input mono"
                type="number"
                min="0"
                max={seasonCount || undefined}
                value={f.episode}
                onChange={(e) => setProgress({ episode: Math.max(0, Math.min(parseInt(e.target.value, 10) || 0, seasonCount || Infinity)) })}
              />
            </label>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={plusOne}>+1 episode</button>
            {seasonCount ? (
              <button type="button" className="btn sm" onClick={() => setProgress({ episode: seasonCount })}>
                Finished season {f.season}
              </button>
            ) : null}
            <span className="small muted mono">
              {tvWatched} {total ? `of ${total}` : ''} episodes watched
            </span>
          </div>
        </div>
      )}

      {!isMovie && !isTvSeasons && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="tag">Episodes watched</span>
          <div className="row">
            <input
              id="episodes"
              className="input mono"
              style={{ width: 120 }}
              type="number"
              min="0"
              max={total || undefined}
              value={f.episodes}
              onChange={(e) => setProgress({ episodes: Math.max(0, Math.min(parseInt(e.target.value, 10) || 0, total || Infinity)) })}
            />
            <span className="muted mono">/ {total ?? '?'}</span>
            <button type="button" className="btn sm" onClick={plusOne}>+1 episode</button>
            {total ? (
              <button type="button" className="btn sm" onClick={() => setProgress({ episodes: total })}>All episodes</button>
            ) : null}
          </div>
        </div>
      )}

      <div className="formgrid">
        <label className="field">
          Your rating (0–10)
          <input id="rating" className="input mono" type="number" min="0" max="10" step="0.5" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} />
        </label>
        <label className="field">
          Shelf
          <select id="category" className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        Notes
        <textarea
          id="notes"
          className="textarea"
          placeholder="e.g. Stopped at the wedding scene, watched Part 1 only, rewatch with friends…"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </label>

      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      <div className="spread">
        <button className="btn primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : entry ? 'Save changes' : 'Add to my list'}
        </button>
        {entry &&
          (confirmRemove ? (
            <div className="row">
              <span className="small muted">Remove from your list?</span>
              <button className="btn sm danger" disabled={saving} onClick={remove}>Remove</button>
              <button className="btn sm ghost" onClick={() => setConfirmRemove(false)}>Keep</button>
            </div>
          ) : (
            <button className="btn ghost sm danger" onClick={() => setConfirmRemove(true)}>Remove from list</button>
          ))}
      </div>
    </section>
  );
}
