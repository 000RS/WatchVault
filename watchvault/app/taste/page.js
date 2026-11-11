'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useEntries, saveProfile } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { displayName, friendships, sendFriendRequest, sharedEntries } from '@/lib/social';
import { AREA_LABEL, TRAIT_LABEL, compareTaste, tasteEvolution, tasteVector, topTraits } from '@/lib/tasteMatch';
import { CATEGORY_LABEL } from '@/lib/categories';
import { RankBars } from '@/components/Charts';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';
import { useAuth } from '@/components/AppShell';
import { toast } from '@/lib/toast';
import { TastePassport } from '@/components/ProfileExtras';

const asItem = (e) => ({ source: e.source, mediaType: e.media_type, sourceId: e.source_id, title: e.title, poster: e.poster_url, year: e.year, category: e.category, genres: e.genres, meta: e.meta || {} });

export default function TastePage() {
  const { entries, profile } = useEntries();
  const { user } = useAuth();
  const mine = useMemo(() => (entries ? tasteVector(entries) : null), [entries]);
  const [people, setPeople] = useState(null);
  const [friends, setFriends] = useState(null);
  const [pick, setPick] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  // Keep your shared summary fresh when you've opted in.
  useEffect(() => {
    if (!profile?.discoverable || !mine) return;
    if (profile.taste?.at === mine.at && profile.taste?.n === mine.n) return;
    saveProfile({ taste: mine }).catch(() => {});
  }, [profile?.discoverable, mine?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    getSupabase()
      .from('profiles')
      .select('id, username, display_name, is_public, taste')
      .eq('discoverable', true)
      .not('taste', 'is', null)
      .limit(300)
      .then(({ data, error: e }) => (e ? setError(e.message) : setPeople((data || []).filter((p) => p.id !== user.id))));
    friendships()
      .then(async ({ friends: fs }) => {
        const lists = await Promise.all(fs.map((f) => sharedEntries(f.other).catch(() => [])));
        setFriends(fs.map((f, i) => ({ profile: f.profile, entries: lists[i], taste: tasteVector(lists[i]) })));
      })
      .catch(() => setFriends([]));
  }, [user]);

  const scored = useMemo(() => {
    if (!mine) return [];
    const byId = new Map();
    for (const p of people || []) byId.set(p.id, { profile: p, taste: p.taste });
    for (const f of friends || []) byId.set(f.profile.id, { ...byId.get(f.profile.id), profile: f.profile, taste: f.taste, entries: f.entries, friend: true });
    return [...byId.values()].filter((x) => x.taste?.n >= 5).map((x) => ({ ...x, cmp: compareTaste(mine, x.taste) })).sort((a, b) => b.cmp.score - a.cmp.score);
  }, [mine, people, friends]);

  const twins = scored.filter((x) => x.cmp.score >= 50).slice(0, 8);
  const opposites = [...scored].reverse().filter((x) => x.cmp.score < 45).slice(0, 4);
  const evolution = useMemo(() => (entries ? tasteEvolution(entries) : []), [entries]);
  const gems = useMemo(() => {
    if (!entries || !friends) return [];
    const have = new Set(entries.map((e) => `${e.source}:${e.media_type}:${e.source_id}`));
    const m = new Map();
    for (const f of friends)
      for (const e of f.entries)
        if ((e.rating >= 8 || e.favourite) && !have.has(`${e.source}:${e.media_type}:${e.source_id}`)) {
          const k = `${e.source}:${e.media_type}:${e.source_id}`;
          const cur = m.get(k) || { e, who: [] };
          cur.who.push(displayName(f.profile));
          m.set(k, cur);
        }
    return [...m.values()].sort((a, b) => b.who.length - a.who.length || (b.e.rating ?? 0) - (a.e.rating ?? 0)).slice(0, 18);
  }, [entries, friends]);

  if (!mine) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;

  const areas = Object.entries(mine.shelves)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => ({ key: c, label: CATEGORY_LABEL[c] || c, value: n }));
  const topGenres = Object.entries(mine.genres)
    .filter(([, v]) => v > 0)
    .slice(0, 10)
    .map(([k, v]) => ({ key: k, label: `${k.split('|')[1]}`, value: Math.round(v), sub: AREA_LABEL[k.split('|')[0]] }));
  const why = topTraits(mine, 4);

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Taste</h1>
          <p className="muted">Your Taste DNA across every shelf, the people who share it, and how it has changed.</p>
        </div>
      </header>

      <section className="panel taste-dna">
        <div className="stack-sm">
          <p className="kicker">Your Taste DNA</p>
          <h2 className="h-section">{why.length ? `You come for ${why.slice(0, 2).map((t) => TRAIT_LABEL[t].toLowerCase()).join(' and ')}` : 'Add and rate a few things to build your DNA'}</h2>
          {why.length > 2 && <p className="muted">Also: {why.slice(2).map((t) => TRAIT_LABEL[t].toLowerCase()).join(', ')}.</p>}
          <div className="chips wrap">
            {why.map((t) => (
              <span key={t} className="trait">
                <b>{TRAIT_LABEL[t]}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="dash-grid">
          <div className="dash-card">
            <h3>Where your time goes</h3>
            <RankBars rows={areas} format={(v) => `${v}`} limit={8} />
          </div>
          <div className="dash-card">
            <h3>What you love most</h3>
            <RankBars rows={topGenres} format={(v) => `${v}`} limit={10} />
          </div>
        </div>
      </section>

      <TastePassport entries={entries} profile={profile} />

      <section className="panel stack" style={{ padding: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="stack-sm" style={{ maxWidth: 620 }}>
            <b>Let people with similar taste find me</b>
            <span className="muted small">Only a summary is shared: your shelves, favourite genres and favourite titles. Never your full history or notes. Turn it off any time.</span>
          </div>
          <span className="toggle">
            <input
              id="discoverable"
              type="checkbox"
              checked={Boolean(profile?.discoverable)}
              onChange={(e) =>
                saveProfile(e.target.checked ? { discoverable: true, taste: mine } : { discoverable: false, taste: null })
                  .then(() => toast(e.target.checked ? 'You can now be found by taste' : 'Taste matching off'))
                  .catch((err) => toast(/column/.test(err.message) ? 'This needs the version 5 database upgrade (supabase/upgrade_v5.sql).' : err.message, { kind: 'error' }))
              }
              aria-label="Discoverable by taste"
            />
            <span />
          </span>
        </div>
        {!profile?.username && (
          <p className="hint">
            Pick a username on <Link href="/">Home</Link> so matches can find you.
          </p>
        )}
      </section>

      {error && <p className="notice">{/does not exist|column/.test(error) ? 'Taste matching needs the version 5 database upgrade (supabase/upgrade_v5.sql).' : error}</p>}

      <section className="section">
        <h2 className="h-section">Taste twins</h2>
        {!people && !error && <div className="skeleton" style={{ height: 140, aspectRatio: 'auto' }} />}
        {people && !twins.length && <p className="muted">No close matches yet. As more people turn on matching, twins appear here.</p>}
        <div className="match-cards">
          {twins.map((x) => (
            <MatchCard key={x.profile.id} x={x} onCompare={() => setPick(x)} />
          ))}
        </div>
      </section>

      {opposites.length > 0 && (
        <section className="section">
          <h2 className="h-section">Taste opposites</h2>
          <p className="muted small">People who love completely different things. Great for getting out of your bubble.</p>
          <div className="match-cards">
            {opposites.map((x) => (
              <MatchCard key={x.profile.id} x={x} onCompare={() => setPick(x)} />
            ))}
          </div>
        </section>
      )}

      {pick && <Breakdown x={pick} onClose={() => setPick(null)} />}

      {gems.length > 0 && (
        <section className="section">
          <h2 className="h-section">Friends&apos; hidden gems</h2>
          <p className="muted small">Things your friends loved that you haven&apos;t tried, from every shelf.</p>
          <div className="shelf-track">
            {gems.map((g) => (
              <button key={`${g.e.source}${g.e.source_id}`} className="tile as-button" onClick={() => setOpen(asItem(g.e))}>
                <Poster src={g.e.poster_url} title={g.e.title} />
                <span className="tile-title">{g.e.title}</span>
                <span className="tile-sub">{g.who.slice(0, 2).join(', ')}{g.who.length > 2 ? ` +${g.who.length - 2}` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="h-section">How your taste has changed</h2>
        <div className="evolution">
          {evolution.map((p) => (
            <div key={p.label} className="evo-col">
              <span className="kicker">{p.label}</span>
              <b className="muted small">{p.count} things</b>
              {p.top.length ? (
                p.top.map((g) => (
                  <span key={g.name} className="evo-row">
                    <span>{g.name}</span>
                    <span className="muted">{g.share}%</span>
                    <i style={{ width: `${g.share}%` }} />
                  </span>
                ))
              ) : (
                <span className="muted small">Nothing logged</span>
              )}
              {p.shelves.length > 0 && <span className="muted small">{p.shelves.join(' · ')}</span>}
            </div>
          ))}
        </div>
        <EvolutionLine evolution={evolution} />
      </section>
      {open && <DetailSheet item={open} open onClose={() => setOpen(null)} />}
    </>
  );
}

function EvolutionLine({ evolution }) {
  const withData = evolution.filter((p) => p.top.length);
  if (withData.length < 2) return null;
  const first = withData[0].top[0]?.name;
  const last = withData[withData.length - 1].top[0]?.name;
  if (!first || !last) return null;
  return <p className="lede">{first === last ? `${first} has been your constant.` : `You've moved from ${first.toLowerCase()} towards ${last.toLowerCase()}.`}</p>;
}

function MatchCard({ x, onCompare }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="panel match-card">
      <div className="match-ring sm" style={{ '--p': x.cmp.score }}>
        <b>{x.cmp.score}%</b>
      </div>
      <div className="stack-sm" style={{ minWidth: 0 }}>
        <b>{displayName(x.profile)}</b>
        {x.cmp.why && <span className="muted small">{x.cmp.why}</span>}
        {x.cmp.sharedFavs.length > 0 && <span className="small">Both love {x.cmp.sharedFavs.slice(0, 2).join(', ')}</span>}
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onCompare}>
            Compare
          </button>
          {x.friend ? (
            x.profile.username && (
              <Link className="btn sm ghost" href={`/u/${x.profile.username}`}>
                Profile
              </Link>
            )
          ) : (
            <button
              className="btn sm ghost"
              disabled={sent}
              onClick={() =>
                sendFriendRequest(x.profile.id)
                  .then(() => (setSent(true), toast('Request sent')))
                  .catch((e) => toast(e.message, { kind: 'error' }))
              }
            >
              {sent ? 'Requested' : 'Say hi'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Breakdown({ x, onClose }) {
  const c = x.cmp;
  return (
    <section className="panel stack breakdown" style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="h-section">
          You and {displayName(x.profile)}: {c.score}%
        </h2>
        <button className="btn sm ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {c.why && <p className="lede">{c.why}</p>}
      <div className="dash-grid">
        {c.perArea.map((a) => (
          <div key={a.area} className="dash-card">
            <h3>
              {AREA_LABEL[a.area] || a.area} <span className="muted small">{a.score}% alike</span>
            </h3>
            {a.agree.length > 0 && <p className="small">Agree on: {a.agree.join(', ')}</p>}
            {a.onlyMe.length > 0 && <p className="small muted">Only you: {a.onlyMe.join(', ')}</p>}
            {a.onlyThem.length > 0 && <p className="small muted">Only them: {a.onlyThem.join(', ')}</p>}
          </div>
        ))}
      </div>
      {c.sharedFavs.length > 0 && <p className="small">Favourites you share: {c.sharedFavs.slice(0, 8).join(', ')}</p>}
    </section>
  );
}
