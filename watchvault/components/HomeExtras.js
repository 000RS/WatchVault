'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CATEGORIES, isScreen, statusLabel } from '@/lib/categories';
import { viewMemory } from '@/lib/store';
import { SHELF_KINDS } from '@/lib/shelves';
import { EntryTile } from './Tiles';

export const MOODS = [
  ['funny', '😂 Funny'],
  ['cosy', '☕ Cosy'],
  ['romantic', '💞 Romantic'],
  ['thrilling', '⚡ Thrilling'],
  ['emotional', '😭 Emotional'],
  ['mindbending', '🌀 Mind-bending'],
  ['scary', '👻 Scary'],
  ['chill', '🌙 Chill'],
];

/** The door into the decision engine, right on Home. */
export function TonightCard() {
  return (
    <section className="panel tonight-card">
      <div className="stack-sm">
        <p className="kicker">Can&apos;t decide?</p>
        <h2 className="h-section">What should I do tonight?</h2>
        <p className="muted">Pick a mood. You get three picks from your vault and beyond: something to watch, read, play, hear or go to.</p>
      </div>
      <div className="chips wrap">
        {MOODS.map(([id, label]) => (
          <Link key={id} href={`/tonight?mood=${id}`} className="chip">
            {label}
          </Link>
        ))}
        <Link href="/tonight?surprise=1" className="chip on">
          🎲 Surprise me
        </Link>
      </div>
    </section>
  );
}

/** Every shelf you use at a glance, plus a nudge to start the ones you don't. */
export function VaultShelves({ entries }) {
  const shelves = useMemo(() => {
    const by = new Map();
    for (const e of entries) {
      const c = by.get(e.category) || { done: 0, doing: 0, want: 0, sample: e };
      if (e.status === 'completed') c.done++;
      else if (e.status === 'watching') c.doing++;
      else if (e.status === 'plan') c.want++;
      by.set(e.category, c);
    }
    return by;
  }, [entries]);
  const screenCount = entries.filter(isScreen).length;
  const used = CATEGORIES.filter((c) => c.kind && shelves.has(c.id));
  const unused = SHELF_KINDS.filter((k) => !shelves.has(k.category)).slice(0, 4);
  const go = (cat) => viewMemory.set('list', { ...(viewMemory.get('list') || {}), category: cat, status: 'all', scroll: 0 });
  return (
    <section className="section">
      <div className="shelf-head">
        <h2 className="h-section">Your vault</h2>
        <Link href="/explore?tab=shelves" className="link small">
          Discover more
        </Link>
      </div>
      <div className="vault-shelves">
        <Link href="/list" className="vault-shelf" onClick={() => go('all')}>
          <span className="vault-icon">🎬</span>
          <b>Films & series</b>
          <span className="muted small">{screenCount.toLocaleString()} titles</span>
        </Link>
        {used.map((c) => {
          const x = shelves.get(c.id);
          return (
            <Link key={c.id} href="/list" className="vault-shelf" onClick={() => go(c.id)}>
              <span className="vault-icon">{SHELF_KINDS.find((k) => k.category === c.id)?.icon || '✦'}</span>
              <b>{c.label}</b>
              <span className="muted small">
                {[x.done && `${x.done} ${statusLabel(x.sample, 'completed').toLowerCase()}`, x.doing && `${x.doing} now`, x.want && `${x.want} saved`].filter(Boolean).join(' · ')}
              </span>
            </Link>
          );
        })}
        {unused.map((k) => (
          <Link key={k.id} href={`/explore?type=${k.id}`} className="vault-shelf empty">
            <span className="vault-icon">{k.icon}</span>
            <b>{k.label}</b>
            <span className="muted small">Start this shelf</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Things you saved a while ago and may have forgotten. A different few each visit. */
export function Rediscover({ entries }) {
  const [seed] = useState(() => Math.random());
  const picks = useMemo(() => {
    const old = entries.filter((e) => e.status === 'plan' && Date.now() - new Date(e.created_at).getTime() > 45 * 86400000);
    return old
      .map((e, i) => ({ e, r: Math.abs(Math.sin((i + 1) * 9301 * (seed + 0.1))) }))
      .sort((a, b) => a.r - b.r)
      .slice(0, 10)
      .map((x) => x.e);
  }, [entries, seed]);
  if (picks.length < 2) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <div>
          <h2 className="h-section">Rediscover</h2>
          <p className="muted small">You saved these a while ago. Still keen?</p>
        </div>
      </div>
      <div className="shelf-track">
        {picks.map((e) => (
          <EntryTile key={e.id} entry={e} />
        ))}
      </div>
    </section>
  );
}
