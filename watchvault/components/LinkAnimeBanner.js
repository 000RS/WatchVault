'use client';

import { useState } from 'react';
import { useEntries } from '@/lib/store';
import { keepOnAnilist, keptOnAnilist, linkAnimeToTmdb, mergeInto, tmdbCandidatesFor } from '@/lib/linkAnime';
import { searchCatalog } from '@/lib/catalog';
import { toast } from '@/lib/toast';
import Sheet from './Sheet';
import Poster from './Poster';

/** Shown while some anime are still saved the old way (one AniList entry per season). */
export default function LinkAnimeBanner() {
  const { entries } = useEntries();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [, bump] = useState(0);
  const kept = keptOnAnilist();
  const count = (entries || []).filter((e) => e.source === 'anilist' && !kept.has(e.id)).length;
  if (!count && !open) return null;

  async function run() {
    setOpen(true);
    setResult(null);
    setProgress({ done: 0, total: count });
    try {
      const r = await linkAnimeToTmdb((done, total) => setProgress({ done, total }));
      setResult(r);
      if (r.done) toast(`Merged ${r.done} anime into full shows`);
    } catch (e) {
      setResult({ done: 0, review: [], failed: [{ entry: { id: 'all', title: 'Every title' }, error: e.message }] });
    } finally {
      setProgress(null);
    }
  }

  const resolve = (id) => setResult((r) => ({ ...r, review: r.review.filter((x) => x.entry.id !== id), failed: r.failed.filter((x) => x.entry.id !== id) }));

  return (
    <>
      {count > 0 && (
        <div className="panel banner">
          <div className="stack-sm">
            <h2 className="h-sub">{count} anime need one quick update</h2>
            <p className="muted">
              They were saved one season at a time, so some shows look like they appear twice. Updating turns each one into a single show with every
              season. Your progress, ratings and notes are kept.
            </p>
          </div>
          <button className="btn primary" onClick={run}>
            Update now
          </button>
        </div>
      )}

      <Sheet open={open} onClose={() => !progress && setOpen(false)} title="Updating your anime" wide>
        {progress && (
          <div className="stack-sm">
            <p className="muted">
              Checking {progress.done} of {progress.total}…
            </p>
            <div className="progressbar">
              <i style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            </div>
          </div>
        )}

        {result && (
          <div className="stack">
            <p className="lede">
              {result.done ? `${result.done} merged.` : 'Nothing merged automatically.'}{' '}
              {result.review.length ? `${result.review.length} need you to pick the right show.` : ''}
              {result.failed.length ? ` ${result.failed.length} hit a problem.` : ''}
              {!result.review.length && !result.failed.length ? ' All done.' : ''}
            </p>

            {result.failed.length > 0 && (
              <div className="notice error">
                <b>What went wrong:</b> {result.failed[0].error}
                {result.failed.length > 1 ? ` (and ${result.failed.length - 1} more)` : ''}
              </div>
            )}

            {[...result.review, ...result.failed].map(({ entry, candidates }) => (
              <ReviewItem key={entry.id} entry={entry} candidates={candidates} onDone={() => (resolve(entry.id), bump((n) => n + 1))} />
            ))}

            {!progress && (result.review.length > 0 || result.failed.length > 0) && (
              <div className="row">
                <button className="btn" onClick={run}>
                  Try again
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    keepOnAnilist([...result.review, ...result.failed].map((x) => x.entry.id));
                    setOpen(false);
                  }}
                >
                  Keep the rest as they are
                </button>
              </div>
            )}
            {!result.review.length && !result.failed.length && (
              <button className="btn primary" onClick={() => setOpen(false)}>
                Done
              </button>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function ReviewItem({ entry, candidates: given, onDone }) {
  const [candidates, setCandidates] = useState(given || null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  if (entry.id === 'all') return null;

  async function pick(item) {
    setBusy(true);
    try {
      await mergeInto(entry, item);
      toast(`${entry.title} merged`);
      onDone();
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    const items = await searchCatalog(q.trim(), { type: 'tv' }).catch(() => []);
    setCandidates(items.filter((i) => i.source === 'tmdb').slice(0, 6));
    setBusy(false);
  }

  return (
    <div className="panel" style={{ padding: 18, gap: 12 }}>
      <div className="spread">
        <div>
          <b>{entry.title}</b>
          <p className="muted small">Saved as: {entry.status}, {entry.episodes_watched || 0} episodes</p>
        </div>
        <button
          className="btn sm ghost"
          onClick={() => {
            keepOnAnilist([entry.id]);
            onDone();
          }}
        >
          Keep as is
        </button>
      </div>
      {candidates === null && (
        <button className="btn sm" onClick={async () => setCandidates((await tmdbCandidatesFor(entry).catch(() => [])).map((c) => c.item))}>
          Find matches
        </button>
      )}
      {candidates && candidates.length > 0 && (
        <div className="pick-row">
          {candidates.map((c) => (
            <button key={`${c.mediaType}${c.sourceId}`} className="pick" disabled={busy} onClick={() => pick(c)}>
              <Poster src={c.poster} title={c.title} />
              <span className="tile-title">{c.title}</span>
              <span className="tile-sub">
                {c.year || '—'}
                {c.mediaType === 'movie' ? ', film' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      <form className="row" onSubmit={search}>
        <input className="input" style={{ flex: '1 1 200px', width: 'auto' }} placeholder="Not here? Search for the show" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm" disabled={busy}>
          Search
        </button>
      </form>
    </div>
  );
}
