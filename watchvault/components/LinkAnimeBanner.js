'use client';

import { useState } from 'react';
import { useEntries } from '@/lib/store';
import { linkAnimeToTmdb } from '@/lib/linkAnime';
import { toast } from '@/lib/toast';

/** Shown while some anime are still saved the old way (one AniList entry per season). */
export default function LinkAnimeBanner() {
  const { entries } = useEntries();
  const [progress, setProgress] = useState(null);
  const count = (entries || []).filter((e) => e.source === 'anilist').length;
  if (!count) return null;

  async function run() {
    setProgress({ done: 0, total: count });
    try {
      const { linked, kept } = await linkAnimeToTmdb((done, total) => setProgress({ done, total }));
      toast(`Merged ${linked} anime into full shows${kept ? `. ${kept} couldn't be matched and stay as they are` : ''}.`);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="panel banner">
      <div className="stack-sm">
        <h2 className="h-sub">{count} anime need one quick update</h2>
        <p className="muted">
          They were saved one season at a time, so some shows can look like they appear twice. Updating merges each show into one entry with all its
          seasons. Your progress, ratings and notes are kept.
        </p>
        {progress && (
          <div className="progressbar">
            <i style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
        )}
      </div>
      <button className="btn primary" disabled={Boolean(progress)} onClick={run}>
        {progress ? `Updating ${progress.done} of ${progress.total}…` : 'Update now'}
      </button>
    </div>
  );
}
