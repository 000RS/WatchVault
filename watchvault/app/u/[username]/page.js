'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { acceptFriendRequest, fetchActivity, fetchTopLists, profileByUsername, relationTo, sendFriendRequest, sharedEntries } from '@/lib/social';
import { EntryRow, TasteCard, TopPodiums, VaultHero } from '@/components/Vault';
import { ActivityList } from '@/components/ActivityList';
import { FriendButton } from '@/components/FriendButton';
import { useAuth } from '@/components/AppShell';
import { toast } from '@/lib/toast';

export default function ProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const profile = await profileByUsername(decodeURIComponent(username));
        if (!profile) return alive && setState({ missing: true });
        const [entries, topLists, activity, relation] = await Promise.all([
          sharedEntries(profile.id),
          fetchTopLists(profile.id).catch(() => ({})),
          fetchActivity([profile.id], { limit: 15 }).catch(() => []),
          relationTo(profile.id).catch(() => 'none'),
        ]);
        if (alive) setState({ profile, entries, topLists, activity, relation });
      } catch (e) {
        if (alive) setState({ error: e.message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [username, user]);

  if (state.loading) return <div className="skeleton" style={{ height: 380, aspectRatio: 'auto' }} />;
  if (state.error) return <p className="notice error">{state.error}</p>;
  if (state.missing)
    return (
      <div className="empty">
        <h1 className="h-page">No one goes by @{decodeURIComponent(username)}</h1>
        <p className="muted">Check the spelling of the link.</p>
      </div>
    );

  const { profile, entries, topLists, activity, relation } = state;
  const isSelf = relation === 'self';
  const canSee = isSelf || profile.is_public || relation === 'friends';
  const size = profile.showcase_size || 5;
  const hidden = new Set(profile.hidden_categories || []);
  const visible = entries.filter((e) => !hidden.has(e.category));

  const friendAction = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
      setState((s) => ({ ...s, relation: msg === 'Request sent' ? 'requested' : 'friends' }));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };

  const actions =
    relation === 'signed-out' ? (
      <Link href="/" className="btn sm">
        Sign in to add as a friend
      </Link>
    ) : isSelf ? (
      <Link href="/settings" className="btn sm">
        Edit profile
      </Link>
    ) : (
      <FriendButton state={relation} onAdd={() => friendAction(() => sendFriendRequest(profile.id), 'Request sent')} onAccept={() => friendAction(() => acceptFriendRequest(profile.id), 'You are now friends')} />
    );

  if (!canSee) {
    return (
      <div className="empty">
        <span className="avatar">{(profile.display_name || profile.username)[0].toUpperCase()}</span>
        <h1 className="h-page">{profile.display_name || `@${profile.username}`}</h1>
        <p className="lede">This vault is private. Friends can see it.</p>
        <div className="row">{actions}</div>
      </div>
    );
  }

  return (
    <>
      <VaultHero profile={profile} entries={visible} topLists={topLists} isSelf={isSelf} actions={actions} />
      <TopPodiums entries={visible} topLists={topLists} size={size} hidden={hidden} />
      <EntryRow title="Watching now" entries={visible.filter((e) => e.status === 'watching')} />
      {activity.length > 0 && (
        <section className="section">
          <h2 className="h-section">Recently</h2>
          <ActivityList rows={activity.filter((a) => !hidden.has(a.category))} />
        </section>
      )}
      <TasteCard entries={visible} isSelf={isSelf} />
    </>
  );
}
