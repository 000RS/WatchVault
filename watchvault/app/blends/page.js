'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBlend, myBlends } from '@/lib/social4';
import { displayName, friendships } from '@/lib/social';
import { toast } from '@/lib/toast';

export default function BlendsPage() {
  const router = useRouter();
  const [blends, setBlends] = useState(null);
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState(null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    myBlends()
      .then(setBlends)
      .catch((e) => setError(e.message));
    friendships()
      .then((d) => setFriends(d.friends))
      .catch(() => {});
  }, []);

  async function create(e) {
    e.preventDefault();
    try {
      const b = await createBlend(name.trim() || 'Movie night', [...picked]);
      router.push(`/blends/${b.id}`);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  }

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Blends</h1>
          <p className="muted">A shared watchlist with friends. WatchVault suggests what none of you have seen yet, everyone votes, and you pick tonight&apos;s watch together.</p>
        </div>
        <button className="btn sm primary" onClick={() => setMaking(!making)}>
          New blend
        </button>
      </header>
      {error && <p className="notice">{error}</p>}
      {making && (
        <form className="panel stack" style={{ padding: 18 }} onSubmit={create}>
          <input id="blend-name" className="input" placeholder="Name it: Movie night, Anime club…" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <span className="field-label">Who&apos;s in?</span>
          {!friends.length && (
            <p className="muted small">
              Blends are with friends. <Link href="/friends">Add a friend</Link> first, or start one now and invite people later.
            </p>
          )}
          <div className="chips wrap">
            {friends.map((f) => (
              <button
                type="button"
                key={f.other}
                className={`chip ${picked.has(f.other) ? 'on' : ''}`}
                onClick={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    n.has(f.other) ? n.delete(f.other) : n.add(f.other);
                    return n;
                  })
                }
              >
                {displayName(f.profile)}
              </button>
            ))}
          </div>
          <button className="btn primary" style={{ justifySelf: 'start' }}>
            Create blend
          </button>
        </form>
      )}
      <div className="list-cards">
        {!blends && !error && <div className="skeleton" style={{ height: 120, aspectRatio: 'auto' }} />}
        {blends?.map((b) => (
          <Link key={b.id} href={`/blends/${b.id}`} className="list-card blend-card">
            <span className="blend-avatars" aria-hidden="true">
              {b.members.slice(0, 4).map((m) => (
                <span key={m.id} className="avatar md">
                  {displayName(m).replace('@', '')[0]?.toUpperCase()}
                </span>
              ))}
            </span>
            <span className="list-card-text">
              <b>{b.name}</b>
              <span className="muted small">{b.members.map((m) => displayName(m)).join(', ')}</span>
            </span>
          </Link>
        ))}
        {blends && !blends.length && !making && <p className="muted">No blends yet.</p>}
      </div>
    </>
  );
}
