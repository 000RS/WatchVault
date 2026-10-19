'use client';

import { useEffect, useState } from 'react';
import { releaseShelves } from '@/lib/catalog';
import { useList } from '@/components/useList';
import { TitleCard } from '@/components/PosterCard';

export default function DiscoverPage() {
  const [shelves] = useState(releaseShelves);
  const { lookup } = useList();

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>New releases</h1>
        <p className="muted">Pulled live from TMDB and AniList every time you open this page.</p>
      </div>
      {shelves.map((s) => (
        <Shelf key={s.id} shelf={s} lookup={lookup} />
      ))}
    </>
  );
}

function Shelf({ shelf, lookup }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    shelf
      .load()
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [shelf]);

  if (items && items.length === 0) return null;

  return (
    <section className="shelf">
      <h2>{shelf.title}</h2>
      {error ? (
        <div className="notice error">{error}</div>
      ) : (
        <div className="shelf-track">
          {items
            ? items.map((item) => <TitleCard key={`${item.source}-${item.sourceId}`} item={item} entry={lookup(item)} />)
            : Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" />)}
        </div>
      )}
    </section>
  );
}
