'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries, hiddenCategories, saveProfile } from '@/lib/store';
import { fetchActivity, fetchTopLists, friendships } from '@/lib/social';
import { EntryRow, TasteCard, TopPodiums, VaultHero, withDefaults } from '@/components/Vault';
import { GoalsCard, UpNext } from '@/components/UpNext';
import { Rediscover, TonightCard, VaultShelves } from '@/components/HomeExtras';
import { isScreen } from '@/lib/categories';
import { ActivityList } from '@/components/ActivityList';
import { useAuth } from '@/components/AppShell';
import { toast } from '@/lib/toast';
import LinkAnimeBanner from '@/components/LinkAnimeBanner';

export default function HomePage() {
  const { user } = useAuth();
  const { entries, profile, loading, error } = useEntries();
  const [topLists, setTopLists] = useState(null);
  const [friendFeed, setFriendFeed] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetchTopLists(user.id).then(setTopLists).catch(() => setTopLists({}));
    friendships()
      .then(async ({ friends }) => {
        const ids = friends.map((f) => f.other);
        const rows = await fetchActivity(ids, { limit: 12 });
        const names = Object.fromEntries(friends.map((f) => [f.other, f.profile]));
        setFriendFeed(rows.map((r) => ({ ...r, who: names[r.user_id] })));
      })
      .catch(() => setFriendFeed([]));
  }, [user]);

  const hidden = hiddenCategories(profile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const everything = useMemo(() => (entries || []).filter((e) => !hidden.has(e.category)), [entries, profile?.hidden_categories]);
  // The vault hero, top lists and screen rows are about films and series; other shelves get their own section.
  const visible = useMemo(() => everything.filter(isScreen), [everything]);
  const sections = withDefaults(profile?.home_sections);

  if (error && !entries) return <p className="notice error">{error}</p>;
  if (loading) return <div className="skeleton" style={{ height: 380, aspectRatio: 'auto' }} />;

  if (!entries.length) {
    return (
      <div className="empty">
        <h1 className="h-display">Your vault is empty</h1>
        <p className="lede">Bring in a list you already have, or tick off what you&apos;ve seen from the best-known titles of every year.</p>
        <div className="row">
          <Link href="/import" className="btn primary">
            Import a list
          </Link>
          <Link href="/explore?tab=browse" className="btn">
            Tick off titles
          </Link>
        </div>
      </div>
    );
  }

  const showcaseSize = profile?.showcase_size || 5;
  const shareUrl = profile?.username && typeof window !== 'undefined' ? `${window.location.origin}/u/${profile.username}` : null;

  const blocks = {
    tonight: <TonightCard key="tonight" />,
    vault: <VaultShelves key="vault" entries={everything} />,
    rediscover: <Rediscover key="rediscover" entries={everything} />,
    upnext: <UpNext key="upnext" entries={visible} />,
    goals: <GoalsCard key="goals" entries={entries} profile={profile} />,
    continue: (
      <EntryRow
        key="continue"
        title="Continue watching"
        href="/list"
        entries={visible.filter((e) => e.status === 'watching' && (e.media_type === 'movie' || !e.season_episode_counts?.length))}
      />
    ),
    tops: <TopPodiums key="tops" entries={visible} topLists={topLists} size={showcaseSize} hidden={hidden} editable />,
    recent: (
      <EntryRow
        key="recent"
        title="Recently watched"
        href="/activity"
        entries={visible.filter((e) => e.status === 'completed')}
      />
    ),
    friends:
      friendFeed && friendFeed.length ? (
        <section key="friends" className="section">
          <div className="shelf-head">
            <h2 className="h-section">Friends</h2>
            <Link href="/friends" className="link small">
              See all
            </Link>
          </div>
          <ActivityList rows={friendFeed} showWho />
        </section>
      ) : null,
    taste: <TasteCard key="taste" entries={visible} />,
  };

  return (
    <>
      <LinkAnimeBanner />
      {profile && !profile.username && <UsernamePrompt />}
      <VaultHero
        profile={profile}
        entries={visible}
        topLists={topLists}
        isSelf
        actions={
          <>
            <Link href="/top" className="btn sm">
              Choose your showcase
            </Link>
            {shareUrl && profile.is_public ? (
              <button
                className="btn sm ghost"
                onClick={() =>
                  navigator.clipboard
                    .writeText(shareUrl)
                    .then(() => toast('Profile link copied'))
                    .catch(() => toast(shareUrl))
                }
              >
                Copy profile link
              </button>
            ) : (
              <Link href="/settings" className="btn sm ghost">
                Share your vault
              </Link>
            )}
          </>
        }
      />
      {sections.filter((s) => s.on).map((s) => blocks[s.id] || null)}
    </>
  );
}

function UsernamePrompt() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await saveProfile({ username: name.trim().toLowerCase(), display_name: name.trim() });
          toast('Username saved');
        } catch (err) {
          toast(err.message, { kind: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="stack-sm">
        <h2 className="h-section">Pick a username</h2>
        <p className="muted">Friends find you by it, and it becomes your profile link.</p>
      </div>
      <div className="row">
        <input
          id="username"
          className="input"
          style={{ flex: '1 1 220px', width: 'auto' }}
          placeholder="e.g. rehaan"
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24))}
          minLength={3}
          required
        />
        <button className="btn primary" disabled={busy || name.length < 3}>
          Save username
        </button>
      </div>
    </form>
  );
}

