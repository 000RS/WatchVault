'use client';

import { useEffect, useState } from 'react';
import Poster from './Poster';
import { DetailSheet } from './Tiles';
import ListCard from './ListCard';
import { tasteMatch } from '@/lib/taste';
import { followerCount, following, listsOf, setFollow } from '@/lib/social4';
import { toast } from '@/lib/toast';

const asItem = (e) => ({ source: e.source, mediaType: e.media_type, sourceId: e.source_id, title: e.title, poster: e.poster_url, year: e.year, category: e.category });

/** Taste match with the person whose profile you're on, plus what they loved that you haven't seen. */
export function TasteMatch({ mine, theirs, name }) {
  const [open, setOpen] = useState(null);
  if (!mine?.length || !theirs?.length) return null;
  const m = tasteMatch(mine, theirs);
  const word = m.pct >= 80 ? 'Taste twins' : m.pct >= 60 ? 'Very alike' : m.pct >= 40 ? 'Some overlap' : 'Opposites attract';
  return (
    <section className="panel match">
      <div className="match-head">
        <div className="match-ring" style={{ '--p': m.pct }} role="img" aria-label={`${m.pct}% taste match`}>
          <b>{m.pct}%</b>
        </div>
        <div className="stack-sm">
          <p className="kicker">Taste match</p>
          <h2 className="h-section">{word}</h2>
          <p className="muted">
            You&apos;ve both watched {m.common} {m.common === 1 ? 'title' : 'titles'}.
            {m.sharedFaves[0] ? ` You both love ${m.sharedFaves[0].title}.` : ''}
            {m.fights[0] ? ` You disagree most about ${m.fights[0].e.title} (you ${m.fights[0].mine}, ${name} ${m.fights[0].e.rating}).` : ''}
          </p>
        </div>
      </div>
      {m.loved.length > 0 && (
        <div className="stack-sm">
          <span className="field-label">{name} loved these, you haven&apos;t seen them</span>
          <div className="shelf-track">
            {m.loved.slice(0, 16).map((e) => (
              <button key={e.id} className="tile as-button" onClick={() => setOpen(asItem(e))}>
                <Poster src={e.poster_url} title={e.title} />
                <span className="tile-title">{e.title}</span>
                {e.rating != null && <span className="tile-sub">{name}: {e.rating}/10</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {open && <DetailSheet item={open} open onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Their reviews, with spoilers hidden until tapped. */
export function Reviews({ entries }) {
  const rows = entries.filter((e) => e.review).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  if (!rows.length) return null;
  return (
    <section className="section">
      <h2 className="h-section">Reviews</h2>
      <div className="reviews">
        {rows.slice(0, 12).map((e) => (
          <Review key={e.id} e={e} />
        ))}
      </div>
    </section>
  );
}
function Review({ e }) {
  const [show, setShow] = useState(!e.review_spoiler);
  return (
    <article className="review">
      <Poster src={e.poster_url} title={e.title} size="sm" />
      <div className="stack-sm">
        <b>
          {e.title} {e.rating != null && <span className="muted small">· {e.rating}/10</span>}
        </b>
        {show ? (
          <p className="pre-wrap">{e.review}</p>
        ) : (
          <button className="spoiler as-button" onClick={() => setShow(true)}>
            Contains spoilers. Tap to read.
          </button>
        )}
      </div>
    </article>
  );
}

export function PublicLists({ userId }) {
  const [lists, setLists] = useState(null);
  useEffect(() => {
    listsOf(userId)
      .then((l) => setLists(l.filter((x) => x.is_public && x.items?.length)))
      .catch(() => setLists([]));
  }, [userId]);
  if (!lists?.length) return null;
  return (
    <section className="section">
      <h2 className="h-section">Lists</h2>
      <div className="list-cards">
        {lists.map((l) => (
          <ListCard key={l.id} list={l} />
        ))}
      </div>
    </section>
  );
}

/** Follow a public vault without being friends. */
export function FollowButton({ userId }) {
  const [on, setOn] = useState(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    following()
      .then((ids) => setOn(ids.includes(userId)))
      .catch(() => setOn(undefined));
    followerCount(userId).then(setCount);
  }, [userId]);
  if (on === undefined || on === null) return null;
  return (
    <button
      className={`btn sm ${on ? '' : 'ghost'}`}
      onClick={async () => {
        try {
          await setFollow(userId, !on);
          setOn(!on);
          setCount((c) => c + (on ? -1 : 1));
          toast(on ? 'Unfollowed' : 'Following. Their updates show in your Friends feed.');
        } catch (e) {
          toast(e.message, { kind: 'error' });
        }
      }}
    >
      {on ? 'Following' : 'Follow'} {count > 0 && <span className="muted">· {count}</span>}
    </button>
  );
}

/** A shareable one-card summary of someone's taste: what they come for, their shelves and stamps. */
export function TastePassport({ entries, profile }) {
  if (!entries?.length) return null;
  // Imported lazily-style helpers kept local to avoid a heavier bundle on profiles.
  const vec = tasteVectorLite(entries);
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
  const countries = [...new Set(entries.filter((e) => e.status !== 'plan' && e.origin_country).map((e) => e.origin_country))].slice(0, 24);
  const favByShelf = new Map();
  for (const e of entries) if ((e.favourite || e.rating >= 9) && !favByShelf.has(e.category)) favByShelf.set(e.category, e);
  return (
    <section className="passport">
      <div className="passport-head">
        <span className="kicker">Taste passport</span>
        <b className="passport-name">{profile?.display_name || (profile?.username ? `@${profile.username}` : 'You')}</b>
      </div>
      {vec.traits.length > 0 && (
        <p className="passport-line">
          Comes for <b>{vec.traits.slice(0, 3).join(', ').toLowerCase()}</b>
        </p>
      )}
      <div className="passport-stamps">
        {vec.shelves.slice(0, 8).map(([label, n, icon]) => (
          <span key={label} className="stamp">
            <i>{icon}</i>
            <b>{n}</b>
            <span>{label}</span>
          </span>
        ))}
      </div>
      {favByShelf.size > 0 && (
        <p className="muted small">
          Favourites: {[...favByShelf.values()].slice(0, 5).map((e) => e.title).join(' · ')}
        </p>
      )}
      {countries.length > 1 && (
        <p className="passport-flags" aria-label={`Stories from ${countries.length} countries`}>
          {countries.map((c) => flag(c)).join(' ')}
        </p>
      )}
    </section>
  );
}

const TRAIT_RE = [
  ['Emotional stories', /drama|romance|slice of life|psychological/i],
  ['Action', /action|adventure|fighting|shooter|war/i],
  ['Mysteries', /mystery|thriller|crime|puzzle/i],
  ['Laughs', /comedy|humou?r/i],
  ['Fantasy worlds', /fantasy|sci-?fi|science fiction|supernatural/i],
  ['Scares', /horror/i],
  ['Real stories', /documentary|history|biography/i],
];
const ICONS = { books: '📖', manga: '📚', games: '🎮', music: '🎵', podcasts: '🎙️', food: '☕', places: '📍', events: '🎟️', travel: '🧭', anime: '🌸', movies: '🎬', series: '📺' };
function tasteVectorLite(entries) {
  const t = {};
  const shelves = {};
  for (const e of entries) {
    if (e.status === 'plan') continue;
    shelves[e.category] = (shelves[e.category] || 0) + 1;
    for (const g of e.genres || []) for (const [label, re] of TRAIT_RE) if (re.test(g)) t[label] = (t[label] || 0) + (e.rating ? e.rating / 5 : 1);
  }
  return {
    traits: Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k]) => k),
    shelves: Object.entries(shelves)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => [c === 'movies' ? 'Films' : c === 'series' ? 'Series' : c.charAt(0).toUpperCase() + c.slice(1), n, ICONS[c] || '🎞️']),
  };
}
