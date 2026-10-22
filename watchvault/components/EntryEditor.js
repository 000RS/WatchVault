'use client';

import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, STATUS_LABEL, episodesUpTo, isScreen, kindInfo, kindOf, seasonsFinished, statusesFor, suggestStatus } from '@/lib/categories';
import { progressFor } from '@/lib/list';
import { removeEntries, updateEntry } from '@/lib/store';
import { fillDetails } from '@/lib/actions';
import { toast } from '@/lib/toast';
import { Icon } from './Icons';
import { EpisodeGuide, ReviewField, RewatchField, TagsField } from './EntryExtras';

const MOVIE_STEPS = [
  { pct: 0, label: 'Not started' },
  { pct: 25, label: 'A quarter' },
  { pct: 50, label: 'Half' },
  { pct: 75, label: 'Most of it' },
  { pct: 100, label: 'All of it' },
];

const iso = (d) => d.toISOString().slice(0, 10);
function rangeFor(kind) {
  const now = new Date();
  if (kind === 'today') return [iso(now), iso(now)];
  if (kind === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return [iso(start), iso(now)];
  }
  if (kind === 'month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
  if (kind === 'year') return [iso(new Date(now.getFullYear(), 0, 1)), iso(now)];
  return [null, null];
}

/**
 * Everything you can change about a title in your list. Saves as you go.
 * `entry` must already exist in the list; `title` (optional) is fresh catalogue data.
 */
export default function EntryEditor({ entry, compact = false, onRemoved }) {
  const [confirm, setConfirm] = useState(false);
  const [notes, setNotes] = useState(entry.notes || '');
  const [dateMode, setDateMode] = useState(entry.watched_from ? 'custom' : null);
  const [showEpisodes, setShowEpisodes] = useState(!compact);

  useEffect(() => {
    fillDetails(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  const counts = entry.season_episode_counts || [];
  const screen = isScreen(entry);
  const kind = kindInfo(entry);
  const statuses = statusesFor(entry);
  const isMovie = entry.media_type === 'movie';
  const hasSeasons = screen && !isMovie && counts.length > 0;
  const UNIT_LABEL = { book: 'Pages read', manga: 'Chapters read', podcast: 'Episodes heard', game: 'Hours played', place: 'Visits' };
  const total = entry.total_episodes ?? (counts.length ? counts.reduce((a, b) => a + b, 0) : null);
  const finished = useMemo(() => seasonsFinished(entry), [entry]);

  const save = (patch) => updateEntry(entry.id, patch).catch((e) => toast(e.message, { kind: 'error' }));

  function setStatus(status) {
    if (status === 'completed') return save(progressFor(entry, { status }));
    if (status === 'watching' && isMovie && !entry.movie_progress_pct) return save({ status, movie_progress_pct: 50 });
    save({ status });
  }

  function setProgress(opts) {
    const status = entry.status === 'plan' || entry.status === 'completed' ? 'watching' : entry.status;
    save(progressFor(entry, { status, ...opts }));
  }

  const spotSeason = entry.current_season || 1;
  const spotEpisode = entry.current_episode || 0;
  const inSeason = counts[spotSeason - 1] || null;

  function stepEpisode(delta) {
    if (hasSeasons) {
      let s = spotSeason;
      let ep = spotEpisode + delta;
      if (ep > (counts[s - 1] || Infinity) && s < counts.length) {
        s += 1;
        ep = 1;
      } else if (ep < 0 && s > 1) {
        s -= 1;
        ep = counts[s - 1];
      }
      setProgress({ season: s, episode: Math.max(0, Math.min(ep, counts[s - 1] || ep)) });
    } else {
      const next = Math.max(0, (entry.episodes_watched || 0) + delta);
      setProgress({ episodes: total ? Math.min(next, total) : next });
    }
  }

  return (
    <div className={`editor ${compact ? 'compact' : ''}`}>
      <div className="field-block">
        <span className="field-label">Status</span>
        <div className="seg" role="radiogroup" aria-label="Status">
          {statuses.map((s) => (
            <button key={s.id} role="radio" aria-checked={entry.status === s.id} className={`seg-btn st-${s.id} ${entry.status === s.id ? 'on' : ''}`} onClick={() => setStatus(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        {screen && <p className="hint">{statuses.find((x) => x.id === entry.status)?.hint}</p>}
        {suggestStatus(entry) && (
          <p className="hint">
            {suggestStatus(entry) === 'tried' ? 'Only a few episodes in.' : 'You got through a full season or more.'}{' '}
            <button className="link as-text-link" onClick={() => setStatus(suggestStatus(entry))}>
              Mark as {STATUS_LABEL[suggestStatus(entry)]}
            </button>
          </p>
        )}
      </div>

      {isMovie && (
        <div className="field-block">
          <span className="field-label">How much have you seen?</span>
          <div className="seg" role="radiogroup" aria-label="Movie progress">
            {MOVIE_STEPS.map((m) => {
              const cur = entry.status === 'completed' ? 100 : entry.movie_progress_pct ?? 0;
              return (
                <button key={m.pct} role="radio" aria-checked={cur === m.pct} className={`seg-btn ${cur === m.pct ? 'on' : ''}`} onClick={() => (m.pct === 100 ? setStatus('completed') : setProgress({ pct: m.pct }))}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasSeasons && (
        <div className="field-block">
          <span className="field-label">Seasons finished</span>
          <div className="stepper-row">
            <Stepper value={finished ?? 0} max={counts.length} onChange={(n) => (n === 0 ? setProgress({ season: 1, episode: 0 }) : setProgress({ seasons: n }))} label="seasons finished" />
            <span className="muted">of {counts.length}</span>
          </div>
          <span className="field-label">Last episode watched</span>
          <div className="stepper-row">
            <select
              id={`season-${entry.id}`}
              className="select inline"
              value={spotSeason}
              onChange={(e) => setProgress({ season: Number(e.target.value), episode: Math.min(spotEpisode, counts[Number(e.target.value) - 1] || spotEpisode) })}
              aria-label="Season"
            >
              {counts.map((n, i) => (
                <option key={i} value={i + 1}>
                  Season {i + 1}
                </option>
              ))}
            </select>
            <Stepper value={spotEpisode} max={inSeason || undefined} onChange={(ep) => setProgress({ season: spotSeason, episode: ep })} label="episode" prefix="Ep " onStep={stepEpisode} />
            {inSeason ? <span className="muted">of {inSeason}</span> : null}
          </div>
          <p className="hint">
            {episodesUpTo(counts, entry.current_season, entry.current_episode) || entry.episodes_watched || 0} of {total} episodes watched
          </p>
        </div>
      )}

      {hasSeasons && entry.source === 'tmdb' && (
        showEpisodes ? (
          <EpisodeGuide entry={entry} />
        ) : (
          <button className="btn sm" onClick={() => setShowEpisodes(true)}>
            Episode guide: tick, rate, favourite
          </button>
        )
      )}

      {!screen && UNIT_LABEL[kindOf(entry)] && (
        <div className="field-block">
          <span className="field-label">{UNIT_LABEL[kindOf(entry)]}</span>
          <div className="stepper-row">
            <Stepper value={entry.episodes_watched || 0} max={entry.total_episodes || undefined} onChange={(n) => save({ episodes_watched: n, ...(entry.status === 'plan' && n > 0 ? { status: kindOf(entry) === 'place' ? 'completed' : 'watching' } : {}), ...(entry.total_episodes && n >= entry.total_episodes && entry.status === 'watching' ? { status: 'completed' } : {}) })} label={kind.unit || 'count'} wide />
            <span className="muted">{entry.total_episodes ? `of ${entry.total_episodes}` : ''}</span>
          </div>
        </div>
      )}

      {screen && !isMovie && !hasSeasons && (
        <div className="field-block">
          <span className="field-label">Episodes watched</span>
          <div className="stepper-row">
            <Stepper value={entry.episodes_watched || 0} max={total || undefined} onChange={(n) => setProgress({ episodes: n })} label="episodes" onStep={stepEpisode} wide />
            <span className="muted">{total ? `of ${total}` : ''}</span>
          </div>
        </div>
      )}

      <div className="field-block">
        <span className="field-label">Your rating</span>
        <div className="rating" role="radiogroup" aria-label="Rating out of 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} role="radio" aria-checked={Number(entry.rating) === n} className={`rate ${entry.rating >= n ? 'on' : ''}`} onClick={() => save({ rating: Number(entry.rating) === n ? null : n })}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="row small fav-row">
        <span className="toggle">
          <input type="checkbox" checked={Boolean(entry.favourite)} onChange={(e) => save({ favourite: e.target.checked })} aria-label="Favourite" />
          <span />
        </span>
        ♥ One of my favourites
      </label>
      {screen && ['completed', 'watching', 'on_hold', 'stopped'].includes(entry.status) && <RewatchField entry={entry} />}
      {entry.status !== 'plan' && <ReviewField entry={entry} />}
      <TagsField entry={entry} />

      <div className="field-block">
        <span className="field-label">{screen ? 'When did you watch it?' : kindOf(entry) === 'place' || kindOf(entry) === 'travel' || kindOf(entry) === 'event' ? 'When did you go?' : 'When?'}</span>
        <div className="chips">
          {[
            ['today', 'Today'],
            ['week', 'This week'],
            ['month', 'This month'],
            ['year', 'This year'],
            ['custom', 'Pick dates'],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`chip ${dateMode === k ? 'on' : ''}`}
              onClick={() => {
                setDateMode(k);
                if (k !== 'custom') {
                  const [from, to] = rangeFor(k);
                  save({ watched_from: from, watched_to: to });
                }
              }}
            >
              {label}
            </button>
          ))}
          {entry.watched_from && (
            <button className="chip ghost" onClick={() => (setDateMode(null), save({ watched_from: null, watched_to: null }))}>
              Clear
            </button>
          )}
        </div>
        {dateMode === 'custom' && (
          <div className="date-row">
            <label>
              From
              <input id={`from-${entry.id}`} type="date" className="input" value={entry.watched_from || ''} onChange={(e) => save({ watched_from: e.target.value || null })} />
            </label>
            <label>
              To
              <input id={`to-${entry.id}`} type="date" className="input" value={entry.watched_to || ''} onChange={(e) => save({ watched_to: e.target.value || null })} />
            </label>
          </div>
        )}
        {entry.watched_from && dateMode !== 'custom' && (
          <p className="hint">
            {entry.watched_from === entry.watched_to ? entry.watched_from : `${entry.watched_from} to ${entry.watched_to || 'now'}`}
          </p>
        )}
      </div>

      {!compact && (
        <>
          <div className="field-block">
            <label className="field-label" htmlFor={`cat-${entry.id}`}>
              Shelf
            </label>
            <select id={`cat-${entry.id}`} className="select" value={entry.category} onChange={(e) => save({ category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor={`notes-${entry.id}`}>
              Private notes
            </label>
            <textarea
              id={`notes-${entry.id}`}
              className="textarea"
              placeholder="Only you can see these"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (entry.notes || '') && save({ notes: notes.trim() || null })}
            />
          </div>
        </>
      )}

      <div className="editor-foot">
        {confirm ? (
          <div className="row">
            <span className="muted">Remove from your list?</span>
            <button
              className="btn danger sm"
              onClick={async () => {
                try {
                  await removeEntries([entry.id]);
                  toast(`Removed ${entry.title}`);
                  onRemoved?.();
                } catch (e) {
                  toast(e.message, { kind: 'error' });
                }
              }}
            >
              Remove
            </button>
            <button className="btn ghost sm" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button className="btn ghost sm danger-text" onClick={() => setConfirm(true)}>
            Remove from list
          </button>
        )}
        <span className="saved-note">Changes save automatically</span>
      </div>
    </div>
  );
}

function Stepper({ value, max, onChange, onStep, label, prefix = '', wide }) {
  const step = (d) => (onStep ? onStep(d) : onChange(Math.max(0, Math.min(value + d, max ?? Infinity))));
  return (
    <div className={`stepper ${wide ? 'wide' : ''}`}>
      <button onClick={() => step(-1)} disabled={value <= 0 && !onStep} aria-label={`One fewer ${label}`}>
        <Icon.Minus width={16} height={16} />
      </button>
      <input
        className="stepper-input"
        inputMode="numeric"
        aria-label={label}
        value={`${prefix}${value}`}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          if (Number.isFinite(n)) onChange(Math.max(0, Math.min(n, max ?? Infinity)));
          else if (e.target.value.replace(prefix, '') === '') onChange(0);
        }}
      />
      <button onClick={() => step(1)} disabled={max != null && value >= max && !onStep} aria-label={`One more ${label}`}>
        <Icon.Plus width={16} height={16} />
      </button>
    </div>
  );
}
