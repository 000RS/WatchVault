'use client';

import { useState } from 'react';
import { react, unreact } from '@/lib/social4';
import { displayName } from '@/lib/social';
import { toast } from '@/lib/toast';

export const EMOJI = ['❤️', '🔥', '😂', '😮', '😭', '👏'];

/** Emoji reactions and comments under one activity row. `list` = reactions for this row. */
export function Reactions({ activity, list, me, names, onChange }) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [shown, setShown] = useState(() => new Set());
  const emojis = EMOJI.map((e) => ({ e, all: list.filter((r) => r.emoji === e), mine: list.find((r) => r.emoji === e && r.user_id === me) }));
  const comments = list.filter((r) => r.comment);

  async function toggle(x) {
    try {
      if (x.mine) {
        await unreact(x.mine.id);
        onChange(list.filter((r) => r.id !== x.mine.id));
      } else {
        const r = await react({ activityId: activity.id, ownerId: activity.user_id, emoji: x.e });
        onChange([...list, r]);
      }
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  }
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const r = await react({ activityId: activity.id, ownerId: activity.user_id, comment: text.trim().slice(0, 1000), spoiler });
      onChange([...list, r]);
      setText('');
      setSpoiler(false);
      setWriting(false);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  }

  return (
    <div className="reactions">
      <div className="reaction-row">
        {emojis.map((x) => (
          <button
            key={x.e}
            className={`reaction ${x.mine ? 'on' : ''} ${x.all.length ? 'has' : ''}`}
            onClick={() => toggle(x)}
            aria-pressed={Boolean(x.mine)}
            title={x.all.map((r) => displayName(names[r.user_id])).join(', ')}
          >
            {x.e}
            {x.all.length > 0 && <span>{x.all.length}</span>}
          </button>
        ))}
        <button className="reaction comment-btn" onClick={() => setWriting(!writing)}>
          {comments.length ? `${comments.length} comment${comments.length > 1 ? 's' : ''}` : 'Comment'}
        </button>
      </div>
      {(writing || comments.length > 0) && (
        <div className="comments">
          {comments.map((c) => (
            <p key={c.id} className="comment">
              <b>{displayName(names[c.user_id])}</b>{' '}
              {c.spoiler && !shown.has(c.id) ? (
                <button className="spoiler-inline as-button" onClick={() => setShown((s) => new Set([...s, c.id]))}>
                  spoiler, tap to read
                </button>
              ) : (
                c.comment
              )}
              {(c.user_id === me || activity.user_id === me) && (
                <button className="as-text-link small" onClick={() => unreact(c.id).then(() => onChange(list.filter((r) => r.id !== c.id)))}>
                  {' '}
                  remove
                </button>
              )}
            </p>
          ))}
          {writing && (
            <form className="comment-form" onSubmit={send}>
              <input className="input" autoFocus placeholder="Say something…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
              <label className="row small">
                <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> Spoiler
              </label>
              <button className="btn sm primary" disabled={!text.trim()}>
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
