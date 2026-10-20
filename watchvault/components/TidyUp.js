'use client';

import { useMemo, useState } from 'react';
import { useEntries, updateMany } from '@/lib/store';
import { STATUS_LABEL, suggestStatus } from '@/lib/categories';
import { toast } from '@/lib/toast';

const DISMISS = 'wv:tidy-dismissed';

/**
 * Offers to re-sort old "Dropped" titles into Tried / Stopped, and to move
 * cartoons out of Movies and Series onto the Animation shelf.
 */
export default function TidyUp({ always = false }) {
  const { entries } = useEntries();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS) === '1';
    } catch {
      return false;
    }
  });

  const plan = useMemo(() => {
    const status = new Map();
    const animation = [];
    for (const e of entries || []) {
      const s = suggestStatus(e);
      if (s) status.set(s, [...(status.get(s) || []), e.id]);
      if ((e.category === 'movies' || e.category === 'series') && (e.genres || []).includes('Animation') && e.original_language !== 'ja') animation.push(e.id);
    }
    return { status, animation };
  }, [entries]);

  const total = [...plan.status.values()].reduce((a, b) => a + b.length, 0) + plan.animation.length;
  if (!total || (hidden && !always)) return null;

  async function apply() {
    setBusy(true);
    try {
      for (const [st, ids] of plan.status) await updateMany(ids, { status: st });
      if (plan.animation.length) await updateMany(plan.animation, { category: 'animation' });
      toast(`Sorted ${total} titles`);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const parts = [...plan.status].map(([st, ids]) => `${ids.length} to ${STATUS_LABEL[st]}`);
  if (plan.animation.length) parts.push(`${plan.animation.length} to the Animation shelf`);

  return (
    <div className="panel banner">
      <div className="stack-sm">
        <h2 className="h-sub">Sort {total} titles into the new groups</h2>
        <p className="muted">
          Moves {parts.join(', ')}. Tried means a few episodes, Stopped means a season or more. You can change any title afterwards.
        </p>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={apply}>
          {busy ? 'Sorting…' : 'Sort them'}
        </button>
        {!always && (
          <button
            className="btn ghost"
            onClick={() => {
              setHidden(true);
              try {
                localStorage.setItem(DISMISS, '1');
              } catch {
                /* fine */
              }
            }}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
