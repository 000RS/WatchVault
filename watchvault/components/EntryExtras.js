'use client';

import { useEffect, useMemo, useState } from 'react';
import { seasonEpisodes } from '@/lib/catalog';
import { episodesUpTo } from '@/lib/categories';
import { progressFor } from '@/lib/list';
import { getStoreEntries, updateEntry } from '@/lib/store';
import { myLists, saveList, sameItem, itemOf, toggleInList } from '@/lib/social4';
import { toast } from '@/lib/toast';
import { Icon } from './Icons';

const save = (entry, patch) => updateEntry(entry.id, patch).catch((e) => toast(e.message, { kind: 'error' }));

/** Times rewatched. Each extra rewatch is logged in the diary by the database. */
export function RewatchField({ entry }) {
  const n = entry.rewatch_count || 0;
  return (
    <div className="field-block">
      <span className="field-label">Rewatches</span>
      <div className="row">
        <div className="stepper">
          <button onClick={() => save(entry, { rewatch_count: Math.max(0, n - 1) })} disabled={n <= 0} aria-label="One fewer rewatch">
            <Icon.Minus width={16} height={16} />
          </button>
          <span className="stepper-input" aria-live="polite">
            {n}
          </span>
          <button onClick={() => save(entry, { rewatch_count: n + 1 })} aria-label="Log a rewatch today">
            <Icon.Plus width={16} height={16} />
          </button>
        </div>
        <span className="muted small">{n ? `Seen ${n + 1} times` : 'Tap + each time you watch it again'}</span>
      </div>
    </div>
  );
}

/** A review friends can read, with a spoiler switch. */
export function ReviewField({ entry, startOpen = false }) {
  const [open, setOpen] = useState(startOpen || Boolean(entry.review));
  const [text, setText] = useState(entry.review || '');
  useEffect(() => setText(entry.review || ''), [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open)
    return (
      <button className="btn sm" onClick={() => setOpen(true)}>
        Write a review
      </button>
    );
  return (
    <div className="field-block">
      <label className="field-label" htmlFor={`review-${entry.id}`}>
        Your review
      </label>
      <textarea
        id={`review-${entry.id}`}
        className="textarea"
        placeholder="What did you think? Friends can read this."
        maxLength={5000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (entry.review || '') && save(entry, { review: text.trim() || null })}
      />
      <label className="row small">
        <span className="toggle">
          <input type="checkbox" checked={Boolean(entry.review_spoiler)} onChange={(e) => save(entry, { review_spoiler: e.target.checked })} />
          <span />
        </span>
        Contains spoilers (friends tap to reveal)
      </label>
    </div>
  );
}

/** Your own tags: "comfort", "cried", "with mum"… */
export function TagsField({ entry }) {
  const [draft, setDraft] = useState('');
  const tags = entry.tags || [];
  const known = useMemo(() => {
    const c = new Map();
    for (const e of getStoreEntries()) for (const t of e.tags || []) c.set(t, (c.get(t) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, []);
  const add = (t) => {
    const tag = t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
    if (!tag || tags.includes(tag)) return;
    save(entry, { tags: [...tags, tag].slice(0, 20) });
  };
  const suggestions = known.filter((t) => !tags.includes(t) && (!draft || t.includes(draft.toLowerCase()))).slice(0, 6);
  return (
    <div className="field-block">
      <span className="field-label">Tags</span>
      <div className="chips wrap">
        {tags.map((t) => (
          <button key={t} className="chip on" onClick={() => save(entry, { tags: tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}>
            {t} <Icon.Close width={12} height={12} />
          </button>
        ))}
        <form
          className="tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
            setDraft('');
          }}
        >
          <input id={`tag-${entry.id}`} className="input tag-input" placeholder="Add a tag" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={30} />
        </form>
        {suggestions.map((t) => (
          <button key={t} className="chip" onClick={() => add(t)}>
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Put a title in any of your custom lists, or start a new one. */
export function ListsField({ title }) {
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const it = itemOf(title);
  useEffect(() => {
    myLists()
      .then(setLists)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return null; // lists need the v4 upgrade; stay quiet until then
  async function toggle(l) {
    try {
      const saved = await toggleInList(l, title);
      setLists((ls) => ls.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }
  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const saved = await saveList({ name: name.trim(), items: [it] });
      setLists((ls) => [saved, ...(ls || [])]);
      setName('');
      toast(`Added to ${saved.name}`);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  }
  return (
    <div className="field-block">
      <span className="field-label">Your lists</span>
      <div className="chips wrap">
        {(lists || []).map((l) => {
          const on = (l.items || []).some((x) => sameItem(x, it));
          return (
            <button key={l.id} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(l)} aria-pressed={on}>
              {on && <Icon.Check width={12} height={12} />} {l.name}
            </button>
          );
        })}
        <form className="tag-form" onSubmit={create}>
          <input id="new-list" className="input tag-input" placeholder="New list…" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </form>
      </div>
    </div>
  );
}

/**
 * Episode-by-episode guide for a TMDB series: tick up to an episode, rate episodes,
 * pick a favourite, or mark a whole season watched.
 */
export function EpisodeGuide({ entry }) {
  const counts = entry.season_episode_counts || [];
  const [season, setSeason] = useState(entry.current_season || 1);
  const [eps, setEps] = useState(null);
  const [error, setError] = useState(null);
  const [rateFor, setRateFor] = useState(null);

  useEffect(() => {
    if (entry.source !== 'tmdb') return;
    let live = true;
    setEps(null);
    setError(null);
    seasonEpisodes(entry.source_id, season)
      .then((e) => live && setEps(e))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [entry.source, entry.source_id, season]);

  if (entry.source !== 'tmdb' || entry.media_type !== 'tv' || !counts.length) return null;

  const watchedUpTo = episodesUpTo(counts, entry.current_season, entry.current_episode) || 0;
  const before = episodesUpTo(counts, season - 1, counts[season - 2] || 0) || 0;
  const done = (n) => entry.status === 'completed' || before + n <= watchedUpTo;
  const log = entry.episode_log || {};
  const ratingOf = (n) => log?.[season]?.[n]?.r;
  const best = entry.best_episode;

  function tickTo(n) {
    // Tapping the last watched episode unticks it; any other tap means "watched up to here".
    const status = ['plan', 'completed', 'clips'].includes(entry.status) ? 'watching' : entry.status;
    const isLast = before + n === (entry.status === 'completed' ? counts.reduce((a, b) => a + b, 0) : watchedUpTo);
    save(entry, progressFor(entry, { status, season, episode: isLast ? n - 1 : n }));
  }
  function rate(n, r) {
    const next = { ...log, [season]: { ...(log[season] || {}), [n]: { ...(log?.[season]?.[n] || {}), r, d: new Date().toISOString().slice(0, 10) } } };
    if (!r) delete next[season][n].r;
    save(entry, { episode_log: next });
    setRateFor(null);
  }
  const markSeason = () => save(entry, progressFor(entry, { status: season >= counts.length ? 'completed' : entry.status === 'completed' ? 'completed' : 'watching', seasons: season }));

  return (
    <div className="field-block">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="field-label">Episodes</span>
        <div className="row">
          <select id={`ep-season-${entry.id}`} className="select inline" value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">
            {counts.map((n, i) => (
              <option key={i} value={i + 1}>
                Season {i + 1} ({n})
              </option>
            ))}
          </select>
          <button className="btn sm" onClick={markSeason}>
            Mark season watched
          </button>
        </div>
      </div>
      {error && <p className="notice error">{error}</p>}
      <ol className="episodes">
        {(eps || Array.from({ length: Math.min(counts[season - 1] || 6, 8) }, (_, i) => ({ number: i + 1, loading: true }))).map((e) => {
          const key = `S${season}E${e.number}`;
          const future = e.air && e.air > new Date().toISOString().slice(0, 10);
          return (
            <li key={e.number} className={`episode ${done(e.number) ? 'done' : ''}`}>
              <button className={`tick ${done(e.number) ? 'on' : ''}`} onClick={() => tickTo(e.number)} disabled={e.loading || future} aria-label={`Watched up to episode ${e.number}`}>
                <Icon.Check width={14} height={14} />
              </button>
              <span className="episode-text">
                <b>
                  {e.number}. {e.loading ? '…' : e.name}
                </b>
                <span className="muted small">{[e.air && (future ? `Airs ${e.air}` : e.air), e.runtime && `${e.runtime} min`, e.rating && `${e.rating.toFixed(1)} on TMDB`].filter(Boolean).join(' · ')}</span>
              </span>
              {!e.loading && !future && (
                <span className="episode-actions">
                  <button className={`chip ${ratingOf(e.number) ? 'on' : ''}`} onClick={() => setRateFor(rateFor === e.number ? null : e.number)} aria-label={`Rate episode ${e.number}`}>
                    {ratingOf(e.number) ? `${ratingOf(e.number)}/10` : 'Rate'}
                  </button>
                  <button className={`icon-btn sm ${best === key ? 'on' : ''}`} onClick={() => save(entry, { best_episode: best === key ? null : key })} aria-label={`Make episode ${e.number} your favourite`} title="Favourite episode">
                    <Icon.Heart width={15} height={15} />
                  </button>
                </span>
              )}
              {rateFor === e.number && (
                <span className="rating episode-rating">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button key={n} className={`rate ${ratingOf(e.number) >= n ? 'on' : ''}`} onClick={() => rate(e.number, ratingOf(e.number) === n ? null : n)}>
                      {n}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {best && <p className="hint">Favourite episode: {best.replace('S', 'Season ').replace('E', ', episode ')}</p>}
    </div>
  );
}
