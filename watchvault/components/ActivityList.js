'use client';

import Link from 'next/link';
import Poster from './Poster';
import { STATUS_LABEL } from '@/lib/categories';
import { titleHref } from '@/lib/actions';
import { displayName } from '@/lib/social';
import { Reactions } from './Reactions';

/** [words before the title, words after it] */
export function describe(a) {
  const st = (STATUS_LABEL[a.status] || a.status || '').toLowerCase();
  if (a.kind === 'added') {
    if (a.status === 'plan') return ['added', 'to plan to watch'];
    return ['added', `as ${st}${a.detail && a.status !== 'completed' ? `, ${a.detail}` : ''}`];
  }
  if (a.kind === 'status') return ['moved', `to ${st}`];
  if (a.kind === 'progress') return ['watched', a.detail ? `up to ${a.detail}` : ''];
  if (a.kind === 'rated') return ['rated', `${a.detail}/10`];
  return ['updated', ''];
}

const dayLabel = (d) => {
  const date = new Date(d);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === y.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

/** History grouped by day. */
export function ActivityList({ rows, showWho = false, reactions, me, names = {}, onReactions }) {
  const days = [];
  for (const r of rows) {
    const label = dayLabel(r.updated_at || r.created_at);
    if (!days.length || days[days.length - 1].label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push(r);
  }
  return (
    <div className="activity">
      {days.map((d) => (
        <div key={d.label} className="activity-day">
          <h3 className="activity-date">{d.label}</h3>
          {d.items.map((a) => (
            <div key={a.id} className="activity-item">
              <Link href={titleHref(a.source, a.media_type, a.source_id)}>
                <Poster src={a.poster_url} title={a.title} />
              </Link>
              <p className="activity-text">
                {showWho && (
                  <>
                    <Link href={a.who?.username ? `/u/${a.who.username}` : '#'} className="link">
                      {displayName(a.who)}
                    </Link>{' '}
                  </>
                )}
                {showWho ? describe(a)[0] : capitalise(describe(a)[0])}{' '}
                <Link href={titleHref(a.source, a.media_type, a.source_id)}>
                  <b>{a.title}</b>
                </Link>{' '}
                {describe(a)[1]}
              </p>
              <span className="activity-time">{new Date(a.updated_at || a.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
              {reactions && <Reactions activity={a} list={reactions.filter((r) => r.activity_id === a.id)} me={me} names={names} onChange={(next) => onReactions(a.id, next)} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
