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
