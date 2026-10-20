'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { myLists, saveList } from '@/lib/social4';
import { toast } from '@/lib/toast';
import ListCard from '@/components/ListCard';

const IDEAS = ['Comfort watches', 'Best of Studio Ghibli', 'Watch with family', 'Hidden gems', 'Shows that got me through exams', 'Perfect rainy day films'];

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');

  useEffect(() => {
    myLists({ fresh: true })
      .then(setLists)
      .catch((e) => setError(e.message));
  }, []);

  async function create(n) {
    const title = (n || name).trim();
    if (!title) return;
    try {
      const l = await saveList({ name: title });
      router.push(`/lists/${l.id}`);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Lists</h1>
          <p className="muted">Make lists for anything: themes, moods, rankings, recommendations for a friend. Public lists show on your profile.</p>
        </div>
      </header>
      {error && <p className="notice">{error}</p>}
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input id="new-list-name" className="input" placeholder="Name a new list" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button className="btn primary" disabled={!name.trim()}>
          Create list
        </button>
      </form>
      {lists && !lists.length && (
        <div className="chips wrap">
          <span className="muted small">Ideas:</span>
          {IDEAS.map((i) => (
            <button key={i} className="chip" onClick={() => create(i)}>
              {i}
            </button>
          ))}
        </div>
      )}
      <div className="list-cards">
        {!lists && !error && Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150, aspectRatio: 'auto' }} />)}
        {lists?.map((l) => (
          <ListCard key={l.id} list={l} />
        ))}
      </div>
    </>
  );
}
