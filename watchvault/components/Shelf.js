'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TitleTile } from './Tiles';
import { useEntries } from '@/lib/store';

/**
 * A horizontal row of titles. Pass `items`, or `load` to fetch them once.
 * With `hideAdded`, titles already in your list when the row loaded are left out;
 * titles you tick while browsing stay put (with a check) until you come back later.
 */
export default function Shelf({ title, subtitle, items: given, load, hideAdded = false, href, empty = null }) {
  const [items, setItems] = useState(given || null);
  const [error, setError] = useState(null);
  const { lookup } = useEntries();
  const hiddenAtLoad = useRef(null);

  useEffect(() => {
    if (given) {
      setItems(given);
      return;
    }
    if (!load) return;
    let alive = true;
    load()
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // `load` is created once by the page; reloading only happens on a new visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items && hiddenAtLoad.current === null) {
    hiddenAtLoad.current = new Set(hideAdded ? items.filter((i) => lookup(i)).map((i) => `${i.mediaType}:${i.sourceId}`) : []);
  }
  const shown = items ? items.filter((i) => !hiddenAtLoad.current?.has(`${i.mediaType}:${i.sourceId}`)) : null;
  if (shown && !shown.length) return empty;

  return (
    <section className="shelf">
      <div className="shelf-head">
        <div>
          <h2 className="h-section">{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="link small">
            See all
          </Link>
        )}
      </div>
      {error ? (
        <p className="notice error">{error}</p>
      ) : (
        <div className="shelf-track">
          {shown
            ? shown.slice(0, 20).map((i) => <TitleTile key={`${i.source}-${i.mediaType}-${i.sourceId}`} item={i} />)
            : Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton" />)}
        </div>
      )}
    </section>
  );
}
