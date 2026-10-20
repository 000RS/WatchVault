'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { personFull } from '@/lib/catalog';
import { useEntries, viewMemory } from '@/lib/store';
import { TitleTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';

export default function PersonPage() {
  const { id } = useParams();
  const router = useRouter();
  const { lookup } = useEntries();
  const [data, setData] = useState(viewMemory.get(`person:${id}`) || null);
  const [role, setRole] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (data) return;
    personFull(id)
      .then((d) => {
        viewMemory.set(`person:${id}`, d);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [id, data]);

  if (error) return <p className="notice error">{error}</p>;
  if (!data) return <div className="skeleton" style={{ height: 320, aspectRatio: 'auto' }} />;

  const { person, roles } = data;
  const current = roles.find((r) => r.id === role) || roles.find((r) => r.id === (person.dept === 'Directing' ? 'directing' : person.dept === 'Writing' ? 'writing' : 'acting')) || roles[0];
  const seen = current ? current.items.filter((i) => lookup(i)).length : 0;
  const items = current ? (showAll ? current.items : current.items.slice(0, 48)) : [];

  return (
    <>
      <div>
        <button className="btn sm ghost" onClick={() => router.back()}>
          <Icon.Back width={16} height={16} /> Back
        </button>
      </div>
      <section className="person-hero">
        <span className="person-photo">{person.photo ? <img src={person.photo} alt="" /> : <span>{person.name[0]}</span>}</span>
        <div className="stack">
          <h1 className="h-page">{person.name}</h1>
          <p className="muted">{[person.dept === 'Acting' ? 'Actor' : person.dept, person.place].filter(Boolean).join(' · ')}</p>
          {current && (
            <p className="lede">
              You have seen {seen} of {current.items.length} titles in their {current.label.toLowerCase()} work.
            </p>
          )}
          {person.bio && <p className="overview clamp">{person.bio}</p>}
        </div>
      </section>
      {roles.length > 1 && (
        <div className="tabs" role="tablist">
          {roles.map((r) => (
            <button key={r.id} role="tab" aria-selected={current?.id === r.id} className={`tab-btn ${current?.id === r.id ? 'on' : ''}`} onClick={() => (setRole(r.id), setShowAll(false))}>
              {r.label} <span className="muted">{r.items.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid-posters">
        {items.map((i) => (
          <TitleTile key={`${i.mediaType}${i.sourceId}`} item={i} />
        ))}
      </div>
      {!showAll && current && current.items.length > 48 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setShowAll(true)}>
            Show all {current.items.length}
          </button>
        </div>
      )}
    </>
  );
}
