'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SWIPE_SHELVES, buildDeck, createRoom, itemKey, joinRoom, recordSwipe, roomMatches, roomState, roomVote, undoSwipe } from '@/lib/swipe';
import { LANGUAGES } from '@/lib/catalog';
import { addTitle } from '@/lib/actions';
import { profilesByIds, displayName } from '@/lib/social';
import { removeEntries, useEntries, viewMemory } from '@/lib/store';
import SwipeDeck from '@/components/SwipeDeck';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/AppShell';

export default function SwipePage() {
  const mem = viewMemory.get('swipe') || {};
  const [shelf, setShelf] = useState(mem.shelf || 'screen');
  const [language, setLanguage] = useState(mem.language || '');
  const [round, setRound] = useState(0);
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('solo'); // solo | group
  const [room, setRoom] = useState(null);
  const { lookup } = useEntries();

  useEffect(() => {
    viewMemory.set('swipe', { shelf, language });
  }, [shelf, language]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('mode') === 'group') setMode('group');
    const code = sp.get('room');
    if (code) {
      setMode('group');
      joinRoom(code)
        .then(setRoom)
        .catch((e) => toast(e.message, { kind: 'error' }));
    }
  }, []);

  useEffect(() => {
    if (mode !== 'solo') return;
    setDeck(null);
    setError(null);
    buildDeck(shelf, { language, round })
      .then((d) => setDeck(d.slice(0, 60)))
      .catch((e) => setError(e.message));
  }, [shelf, language, round, mode]);

  const onVote = useCallback((item, verdict) => recordSwipe(item, verdict), []);
  const onUndo = useCallback(
    (item) => {
      undoSwipe(item);
      const e = lookup(item);
      if (e) removeEntries([e.id]).catch(() => {});
    },
    [lookup]
  );

  return (
    <div className="swipe-page">
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Swipe</h1>
          <p className="muted">{mode === 'solo' ? 'Flick through trailers and covers. ♥ saves it, ✓ marks it done, ✕ teaches us what you don’t like.' : 'Everyone in the room swipes the same deck. Anything you all like is a match.'}</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'solo'} className={`tab-btn ${mode === 'solo' ? 'on' : ''}`} onClick={() => setMode('solo')}>
            Just me
          </button>
          <button role="tab" aria-selected={mode === 'group'} className={`tab-btn ${mode === 'group' ? 'on' : ''}`} onClick={() => setMode('group')}>
            Group swipe
          </button>
        </div>
      </header>

      {(mode === 'solo' || !room) && (
        <div className="swipe-top">
          <div className="chips">
            {SWIPE_SHELVES.map((s) => (
              <button key={s.id} className={`chip ${shelf === s.id ? 'on' : ''}`} onClick={() => (setShelf(s.id), setRound(0))}>
                {s.label}
              </button>
            ))}
          </div>
          {['screen', 'movie', 'tv'].includes(shelf) && (
            <select id="swipe-lang" className="select inline" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
              <option value="">Any language</option>
              {LANGUAGES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === 'solo' && (
        <>
          {error && <p className="notice error">{error}</p>}
          {!deck && !error && <div className="skeleton swipe-skeleton" />}
          {deck && !deck.length && (
            <div className="empty">
              <p className="lede">You&apos;ve swiped everything here for now.</p>
              <button className="btn" onClick={() => setRound((r) => r + 1)}>
                Load more
              </button>
            </div>
          )}
          {deck?.length > 0 && <SwipeDeck key={`${shelf}${language}${round}`} deck={deck} onVote={onVote} onUndo={onUndo} onEmpty={() => setRound((r) => r + 1)} />}
        </>
      )}

      {mode === 'group' && (room ? <Room room={room} onLeave={() => setRoom(null)} /> : <RoomStart shelf={shelf} language={language} onRoom={setRoom} />)}
    </div>
  );
}

function RoomStart({ shelf, language, onRoom }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      onRoom(await createRoom(shelf, { language }));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }
  async function join(e) {
    e.preventDefault();
    setBusy(true);
    try {
      onRoom(await joinRoom(code));
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="room-start">
      <section className="panel stack" style={{ padding: 22 }}>
        <h2 className="h-section">Start a room</h2>
        <p className="muted">Pick a shelf above, then share the code. Works for movie night, a road-trip playlist, a book club pick or a game to play together.</p>
        <button className="btn primary" disabled={busy} onClick={create} style={{ justifySelf: 'start' }}>
          {busy ? 'Making the deck…' : 'Create a room'}
        </button>
      </section>
      <form className="panel stack" style={{ padding: 22 }} onSubmit={join}>
        <h2 className="h-section">Join a room</h2>
        <input id="room-code" className="input room-code-input" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} />
        <button className="btn" disabled={busy || code.length < 5} style={{ justifySelf: 'start' }}>
          Join
        </button>
      </form>
    </div>
  );
}

function Room({ room, onLeave }) {
  const [state, setState] = useState({ members: [], votes: [] });
  const [names, setNames] = useState({});
  const [open, setOpen] = useState(null);
  const seenMatches = useRef(new Set());
  const { user } = useAuth();
  const deck = room.deck || [];
  const [myDeck, setMyDeck] = useState(null);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/swipe?room=${room.code}` : '';

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const s = await roomState(room.id);
        if (!live) return;
        setState(s);
        // On (re)joining, skip what you already voted on.
        setMyDeck((d) => d || deck.filter((x) => !s.votes.some((v) => v.user_id === user?.id && v.item_key === itemKey(x))));
        const missing = s.members.filter((id) => !names[id]);
        if (missing.length) profilesByIds(missing).then((ps) => setNames((n) => ({ ...n, ...Object.fromEntries(ps.map((p) => [p.id, p])) })));
      } catch {
        /* keep the last state */
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = roomMatches(deck, state);
  useEffect(() => {
    for (const m of matches) {
      const k = itemKey(m);
      if (!seenMatches.current.has(k)) {
        seenMatches.current.add(k);
        toast(`It's a match: ${m.title}`);
      }
    }
  }, [matches]);

  const onVote = useCallback(
    (item, verdict) => {
      roomVote(room.id, item, verdict === 'like' ? 1 : -1)
        .then(() => roomState(room.id).then(setState))
        .catch((e) => toast(e.message, { kind: 'error' }));
    },
    [room.id]
  );

  return (
    <div className="room">
      <div className="panel room-bar">
        <div>
          <p className="kicker">Room code</p>
          <b className="room-code">{room.code}</b>
        </div>
        <div className="room-members">
          {state.members.map((id) => (
            <span key={id} className="avatar sm" title={displayName(names[id])}>
              {displayName(names[id]).replace('@', '')[0]?.toUpperCase()}
            </span>
          ))}
          <span className="muted small">{state.members.length} in the room</span>
        </div>
        <div className="row">
          <button
            className="btn sm"
            onClick={() =>
              navigator.share
                ? navigator.share({ title: 'Swipe with me on WatchVault', text: `Join my room: ${room.code}`, url: link }).catch(() => {})
                : navigator.clipboard.writeText(link).then(() => toast('Invite link copied'))
            }
          >
            Invite
          </button>
          <button className="btn sm ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>

      <div className="room-grid">
        {myDeck ? <SwipeDeck deck={myDeck} onVote={onVote} allowSeen={false} labels={{ like: 'Yes!', skip: 'Pass' }} /> : <div className="skeleton swipe-skeleton" />}
        <aside className="panel room-matches">
          <h2 className="h-sub">Matches {matches.length > 0 && <span className="pill">{matches.length}</span>}</h2>
          {state.members.length < 2 && <p className="muted small">Waiting for someone to join. Share the code.</p>}
          {state.members.length >= 2 && !matches.length && <p className="muted small">Keep swiping. Anything everyone likes appears here.</p>}
          <div className="stack-sm">
            {matches.map((m) => (
              <div key={itemKey(m)} className="add-row">
                <button className="as-button" onClick={() => setOpen(m)} aria-label={`${m.title}, details`}>
                  <Poster src={m.poster} title={m.title} size="sm" />
                </button>
                <span>
                  <b>{m.title}</b>
                  <span className="muted small">{m.year}</span>
                </span>
                <button className="btn sm" onClick={() => addTitle(m, 'plan').then(() => toast(`Saved ${m.title}`))}>
                  Save
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
      {open && <DetailSheet item={open} open onClose={() => setOpen(null)} />}
    </div>
  );
}
