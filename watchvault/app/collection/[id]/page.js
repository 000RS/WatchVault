'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collectionFull } from '@/lib/catalog';
import { useEntries } from '@/lib/store';
import { TitleTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';
import { useAiEnabled } from '@/components/Ask';
import AskPanel from '@/components/Ask';

export default function CollectionPage() {
  const { id } = useParams();
  const router = useRouter();
  const { lookup } = useEntries();
  const ai = useAiEnabled();
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    collectionFull(id).then(setC).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="notice error">{error}</p>;
  if (!c) return <div className="skeleton" style={{ height: 320, aspectRatio: 'auto' }} />;
  const released = c.parts.filter((p) => p.date <= new Date().toISOString().slice(0, 10));
  const seen = released.filter((p) => lookup(p)).length;
  const next = released.find((p) => !lookup(p));

  return (
    <>
      <div>
        <button className="btn sm ghost" onClick={() => router.back()}>
          <Icon.Back width={16} height={16} /> Back
        </button>
      </div>
      <section className="title-hero" style={{ gridTemplateColumns: '1fr' }}>
        {c.backdrop && (
          <div className="title-backdrop" aria-hidden="true">
            <img src={c.backdrop} alt="" />
          </div>
        )}
        <div className="stack">
          <h1 className="h-page">{c.name}</h1>
          <p className="lede">
            {released.length} films in release order. You have seen {seen}.{next ? ` Next up for you: ${next.title}.` : seen ? ' You have seen them all.' : ''}
          </p>
          {c.overview && <p className="overview">{c.overview}</p>}
          {ai && (
            <div className="row">
              <button className="btn primary" onClick={() => setAsk(!ask)}>
                {ask ? 'Hide the guide' : 'Plan my watch order with the guide'}
              </button>
            </div>
          )}
        </div>
      </section>
      {ask && <AskPanel starter={`Help me plan how to watch the ${c.name}. I've seen ${seen} of ${released.length}. Ask me anything you need, then suggest an order.`} />}
      <ol className="order">
        {c.parts.map((p, i) => (
          <li key={p.sourceId} className="order-item">
            <span className="order-num">{i + 1}</span>
            <TitleTile item={p} />
          </li>
        ))}
      </ol>
    </>
  );
}
