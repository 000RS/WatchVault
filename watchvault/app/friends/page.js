'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { acceptFriendRequest, displayName, fetchActivity, friendships, removeFriend, searchProfiles, sendFriendRequest } from '@/lib/social';
import { useProfile } from '@/lib/store';
import { ActivityList } from '@/components/ActivityList';
import { toast } from '@/lib/toast';
import { FriendButton } from '@/components/FriendButton';

export default function FriendsPage() {
  const profile = useProfile();
  const [data, setData] = useState(null);
  const [feed, setFeed] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await friendships();
      setData(d);
      const names = Object.fromEntries(d.friends.map((f) => [f.other, f.profile]));
      const rows = await fetchActivity(d.friends.map((f) => f.other), { limit: 40 });
      setFeed(rows.map((r) => ({ ...r, who: names[r.user_id] })));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => searchProfiles(q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
      load();
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };

  const status = (id) => {
    if (!data) return null;
    if (data.friends.some((f) => f.other === id)) return 'friends';
    if (data.outgoing.some((f) => f.other === id)) return 'requested';
    if (data.incoming.some((f) => f.other === id)) return 'incoming';
    return 'none';
  };

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Friends</h1>
          <p className="muted">Friends see your vault, top lists and history. Your private notes stay private.</p>
        </div>
      </header>

      {error && <p className="notice error">{error}</p>}
      {profile && !profile.username && (
        <p className="notice">
          Pick a username on <Link href="/" className="link">Home</Link> so friends can find you.
        </p>
      )}

      <section className="section">
        <h2 className="h-section">Find people</h2>
        <input id="find-people" className="input" placeholder="Search by username or name" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.length > 0 && (
          <div className="people">
            {found.map((p) => (
              <div key={p.id} className="person">
                <span className="avatar md">{(p.display_name || p.username || '?')[0].toUpperCase()}</span>
                <Link href={`/u/${p.username}`} className="person-name">
                  <b>{displayName(p)}</b>
                  <span className="muted small">@{p.username}</span>
                </Link>
                <FriendButton state={status(p.id)} onAdd={() => act(() => sendFriendRequest(p.id), 'Request sent')} onAccept={() => act(() => acceptFriendRequest(p.id), 'You are now friends')} />
              </div>
            ))}
          </div>
        )}
      </section>

      {data?.incoming.length > 0 && (
        <section className="section">
          <h2 className="h-section">Requests</h2>
          <div className="people">
            {data.incoming.map((f) => (
              <div key={f.other} className="person">
                <span className="avatar md">{displayName(f.profile)[0].replace('@', '').toUpperCase()}</span>
                <Link href={f.profile.username ? `/u/${f.profile.username}` : '#'} className="person-name">
                  <b>{displayName(f.profile)}</b>
                </Link>
                <button className="btn sm primary" onClick={() => act(() => acceptFriendRequest(f.other), 'You are now friends')}>
                  Accept
                </button>
                <button className="btn sm ghost" onClick={() => act(() => removeFriend(f.other), 'Request declined')}>
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="h-section">Your friends</h2>
        {data && !data.friends.length && <p className="muted">No friends yet. Search for someone above and send a request.</p>}
        <div className="people">
          {data?.friends.map((f) => (
            <div key={f.other} className="person">
              <span className="avatar md">{displayName(f.profile).replace('@', '')[0].toUpperCase()}</span>
              <Link href={f.profile.username ? `/u/${f.profile.username}` : '#'} className="person-name">
                <b>{displayName(f.profile)}</b>
                {f.profile.username && <span className="muted small">@{f.profile.username}</span>}
              </Link>
              <Link href={f.profile.username ? `/u/${f.profile.username}` : '#'} className="btn sm">
                View vault
              </Link>
            </div>
          ))}
          {data?.outgoing.map((f) => (
            <div key={f.other} className="person">
              <span className="avatar md">{displayName(f.profile).replace('@', '')[0].toUpperCase()}</span>
              <span className="person-name">
                <b>{displayName(f.profile)}</b>
                <span className="muted small">Request sent</span>
              </span>
              <button className="btn sm ghost" onClick={() => act(() => removeFriend(f.other), 'Request cancelled')}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      </section>

      {feed && feed.length > 0 && (
        <section className="section">
          <h2 className="h-section">What friends are watching</h2>
          <ActivityList rows={feed} showWho />
        </section>
      )}
    </>
  );
}
