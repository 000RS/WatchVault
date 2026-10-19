'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TitleTile } from './Tiles';
import { useEntries } from '@/lib/store';

/** A horizontal row of titles. Pass `items`, or `load` to fetch them. */
export default function Shelf({ title, subtitle, items: given, load, hideAdded = false, href, empty = null }) {
  const [items, setItems] = useState(given || null);
  const [error, setError] = useState(null);
  const { lookup } = useEntries();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given, load]);

  const shown = items ? (hideAdded ? items.filter((i) => !lookup(i)) : items) : null;
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
            : Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton poster-md" />)}
        </div>
      )}
    </section>
  );
}
