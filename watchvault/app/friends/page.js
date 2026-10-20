'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { acceptFriendRequest, displayName, fetchActivity, friendships, profilesByIds, removeFriend, searchProfiles, sendFriendRequest, sharedEntries } from '@/lib/social';
import { following, reactionsFor } from '@/lib/social4';
import { useAuth } from '@/components/AppShell';
import { computeStats } from '@/lib/stats';
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
  const [reactions, setReactions] = useState([]);
  const [names, setNames] = useState({});
  const [board, setBoard] = useState(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      const d = await friendships();
      setData(d);
      const followed = await following().catch(() => []);
      const ids = [...new Set([...d.friends.map((f) => f.other), ...followed])];
      const extra = await profilesByIds(followed.filter((id) => !d.friends.some((f) => f.other === id))).catch(() => []);
      const nm = Object.fromEntries([...d.friends.map((f) => [f.other, f.profile]), ...extra.map((p) => [p.id, p])]);
      if (profile) nm[profile.id] = profile;
      const rows = await fetchActivity(ids, { limit: 40 });
      setFeed(rows.map((r) => ({ ...r, who: nm[r.user_id] })));
      const rx = await reactionsFor(rows.map((r) => r.id));
      // Names for people who reacted but aren't in the list yet.
      const missing = [...new Set(rx.map((r) => r.user_id))].filter((id) => !nm[id]);
      if (missing.length) for (const p of await profilesByIds(missing).catch(() => [])) nm[p.id] = p;
      setNames(nm);
      setReactions(rx);
      // Leaderboard: this year's finishes and hours for you and your friends.
      const people = [...d.friends.map((f) => f.profile), profile].filter(Boolean);
      const lists = await Promise.all(people.map((p) => sharedEntries(p.id).catch(() => [])));
      const year = String(new Date().getFullYear());
      setBoard(
        people
          .map((p, i) => {
            const thisYear = lists[i].filter((e) => String(e.watched_to || '').startsWith(year));
            const st = computeStats(lists[i]);
            return { p, finished: thisYear.filter((e) => e.status === 'completed').length, hours: Math.round(st.hours), total: st.watchedCount };
          })
          .sort((a, b) => b.hours - a.hours)
      );
    } catch (e) {
      setError(e.message);
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {board && board.length > 1 && (
        <section className="section">
          <h2 className="h-section">Leaderboard</h2>
          <div className="table-wrap">
            <table className="rates" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Who</th>
                  <th>Hours (all time)</th>
                  <th>Titles</th>
                  <th>Finished this year</th>
                </tr>
              </thead>
              <tbody>
                {board.map((b, i) => (
                  <tr key={b.p.id} className={b.p.id === profile?.id ? 'me' : ''}>
                    <td className="num">{i + 1}</td>
                    <td>{b.p.id === profile?.id ? 'You' : displayName(b.p)}</td>
                    <td className="num">{b.hours.toLocaleString()}</td>
                    <td className="num">{b.total.toLocaleString()}</td>
                    <td className="num">{b.finished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {feed && feed.length > 0 && (
        <section className="section">
          <h2 className="h-section">What friends are watching</h2>
          <ActivityList
            rows={feed}
            showWho
            reactions={reactions}
            me={user?.id}
            names={names}
            onReactions={(id, next) => setReactions((all) => [...all.filter((r) => r.activity_id !== id), ...next])}
          />
        </section>
      )}
    </>
  );
}
