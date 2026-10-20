'use client';

import Link from 'next/link';

/** A list as a card with stacked posters. */
export default function ListCard({ list, href }) {
  const items = list.items || [];
  return (
    <Link href={href || `/lists/${list.id}`} className="list-card">
      <span className="list-stack" aria-hidden="true">
        {items.slice(0, 4).map((it, k) => (
          <span key={k} style={{ zIndex: 4 - k }}>
            {it.poster_url ? <img src={it.poster_url} alt="" loading="lazy" /> : <i />}
          </span>
        ))}
        {!items.length && <span className="list-empty" />}
      </span>
      <span className="list-card-text">
        <b>{list.name}</b>
        <span className="muted small">
          {items.length} {items.length === 1 ? 'title' : 'titles'}
          {list.ranked ? ' · ranked' : ''}
          {list.is_public ? '' : ' · private'}
        </span>
        {list.description && <span className="muted small clamp-2">{list.description}</span>}
      </span>
    </Link>
  );
}
