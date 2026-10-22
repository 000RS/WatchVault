'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { trailerFor } from '@/lib/swipe';
import { itemByline } from '@/lib/shelves';
import { isScreen, kindInfo, statusLabel } from '@/lib/categories';
import { Icon } from './Icons';

/**
 * One card at a time, full height. Drag or flick left (not for me) / right (want it),
 * tap ✓ if you've already seen it. Keyboard: ← → and ↓, space for the trailer.
 * `onVote(item, verdict)` gets 'like' | 'seen' | 'skip'. `allowSeen` hides ✓ in group rooms.
 */
export default function SwipeDeck({ deck, onVote, onUndo, onEmpty, allowSeen = true, labels = {} }) {
  const [i, setI] = useState(0);
  const [history, setHistory] = useState([]);
  const [drag, setDrag] = useState(null); // { x0, dx }
  const [leaving, setLeaving] = useState(null); // 'left' | 'right' | 'down'
  const [trailer, setTrailer] = useState(null);
  const [play, setPlay] = useState(false);
  const card = deck[i];
  const next = deck[i + 1];
  const busy = useRef(false);

  useEffect(() => {
    setPlay(false);
    setTrailer(null);
    if (!card) return;
    let live = true;
    trailerFor(card).then((k) => live && setTrailer(k));
    if (next) trailerFor(next);
    return () => {
      live = false;
    };
  }, [card, next]);

  const vote = useCallback(
    (verdict) => {
      if (!card || busy.current) return;
      busy.current = true;
      setLeaving(verdict === 'like' ? 'right' : verdict === 'skip' ? 'left' : 'down');
      setTimeout(() => {
        onVote(card, verdict);
        setHistory((h) => [...h, { idx: i, verdict }]);
        setI((x) => x + 1);
        setLeaving(null);
        setDrag(null);
        busy.current = false;
      }, 220);
    },
    [card, i, onVote]
  );

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setI(last.idx);
    onUndo?.(deck[last.idx], last.verdict);
  }

  useEffect(() => {
    const key = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowRight') vote('like');
      else if (e.key === 'ArrowLeft') vote('skip');
      else if (e.key === 'ArrowDown' && allowSeen) vote('seen');
      else if (e.key === ' ' && trailer) (e.preventDefault(), setPlay((p) => !p));
      else if (e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) undo();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  useEffect(() => {
    if (!card && deck.length) onEmpty?.();
  }, [card, deck.length, onEmpty]);

  if (!card)
    return (
      <div className="swipe-empty">
        <p className="lede">That&apos;s the deck.</p>
      </div>
    );

  const dx = drag?.dx || 0;
  const style = leaving
    ? { transform: leaving === 'right' ? 'translateX(120%) rotate(14deg)' : leaving === 'left' ? 'translateX(-120%) rotate(-14deg)' : 'translateY(110%)', opacity: 0, transition: 'transform .22s ease-in, opacity .22s' }
    : drag
      ? { transform: `translateX(${dx}px) rotate(${dx / 22}deg)`, transition: 'none' }
      : {};
  const hint = dx > 60 ? 'like' : dx < -60 ? 'skip' : null;
  const k = kindInfo(card);

  return (
    <div className="swipe">
      <div className="swipe-stage">
        {next && (
          <div className="swipe-card back" aria-hidden="true">
            <Art item={next} />
          </div>
        )}
        <div
          className={`swipe-card ${hint ? `hint-${hint}` : ''}`}
          style={style}
          onPointerDown={(e) => {
            if (e.target.closest('button, a, iframe, audio')) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({ x0: e.clientX, dx: 0 });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
          onPointerUp={() => {
            if (!drag) return;
            if (drag.dx > 90) vote('like');
            else if (drag.dx < -90) vote('skip');
            else setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {play && trailer ? (
            <div className="swipe-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailer}?autoplay=1&mute=0&playsinline=1&rel=0&modestbranding=1`}
                title={`${card.title} trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <Art item={card} />
          )}
          <div className="swipe-info">
            <div className="swipe-tags">
              <span className="pill">{isScreen(card) ? (card.mediaType === 'movie' ? 'Film' : card.mediaType === 'anime' ? 'Anime' : 'Series') : `${k.icon} ${card.meta?.type || k.noun}`}</span>
              {card.genres?.slice(0, 2).map((g) => (
                <span key={g} className="pill">
                  {g}
                </span>
              ))}
              {card.rating ? <span className="pill">★ {Number(card.rating).toFixed(1)}</span> : null}
            </div>
            <h2 className="swipe-title">{card.title}</h2>
            <p className="muted small">{[isScreen(card) ? card.year : itemByline(card), isScreen(card) && card.runtime ? `${card.runtime} min` : null].filter(Boolean).join(' · ')}</p>
            {card.overview && <p className="swipe-overview">{card.overview}</p>}
            <div className="row" style={{ gap: 8 }}>
              {trailer && (
                <button className="btn sm" onClick={() => setPlay(!play)}>
                  {play ? 'Show poster' : '▶ Trailer'}
                </button>
              )}
              {card.meta?.preview && <audio className="preview-audio" controls preload="none" src={card.meta.preview} aria-label="Preview" />}
            </div>
          </div>
          {hint && <span className={`swipe-stamp ${hint}`}>{hint === 'like' ? labels.like || 'Want it' : labels.skip || 'Nope'}</span>}
        </div>
      </div>

      <div className="swipe-actions">
        <button className="swipe-btn small" onClick={undo} disabled={!history.length} aria-label="Undo">
          <Icon.Back width={18} height={18} />
        </button>
        <button className="swipe-btn skip" onClick={() => vote('skip')} aria-label="Not for me">
          <Icon.Close width={26} height={26} />
        </button>
        {allowSeen && (
          <button className="swipe-btn seen" onClick={() => vote('seen')} aria-label={`Already ${statusLabel(card, 'completed').toLowerCase()}`} title={`Already ${statusLabel(card, 'completed').toLowerCase()}`}>
            <Icon.Check width={24} height={24} />
          </button>
        )}
        <button className="swipe-btn like" onClick={() => vote('like')} aria-label={labels.like || 'Want it'}>
          <Icon.Heart width={26} height={26} />
        </button>
        <span className="swipe-count muted small">
          {i + 1}/{deck.length}
        </span>
      </div>
      <p className="hint swipe-keys">Drag or use ← → {allowSeen ? '↓ (seen it)' : ''} · space plays the trailer</p>
    </div>
  );
}

function Art({ item }) {
  // Posters fill a tall card best; wide art (backdrops) sits on a blurred copy of itself.
  const src = item.poster || item.backdrop;
  const [failed, setFailed] = useState(false);
  return (
    <div className="swipe-art">
      {src && !failed ? (
        <>
          <img className="swipe-art-blur" src={src} alt="" aria-hidden="true" draggable={false} />
          <img className="swipe-art-main" src={src} alt="" draggable={false} onError={() => setFailed(true)} />
        </>
      ) : (
        <div className="swipe-noart">
          <span>{kindInfo(item).icon || '🎬'}</span>
        </div>
      )}
    </div>
  );
}
