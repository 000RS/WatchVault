'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEntries } from '@/lib/store';
import { fetchTopLists, saveTopList } from '@/lib/social';
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/categories';
import { isWatched } from '@/lib/stats';
import { useAuth } from '@/components/AppShell';
import Poster from '@/components/Poster';
import Sheet from '@/components/Sheet';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';

const MAX = 10;

export default function TopPage() {
  const { user } = useAuth();
  const { entries, profile } = useEntries();
  const [lists, setLists] = useState(null);
  const [picking, setPicking] = useState(null);

  useEffect(() => {
    if (user) fetchTopLists(user.id).then(setLists).catch((e) => (toast(e.message, { kind: 'error' }), setLists({})));
  }, [user]);

  const byId = useMemo(() => new Map((entries || []).map((e) => [e.id, e])), [entries]);
  const keys = useMemo(() => {
    const cats = new Set((entries || []).map((e) => e.category));
    return ['overall', ...CATEGORIES.map((c) => c.id).filter((c) => cats.has(c))];
  }, [entries]);

  async function update(key, ids) {
    const before = lists;
    setLists({ ...lists, [key]: ids });
    try {
      await saveTopList(key, ids);
    } catch (e) {
      setLists(before);
      toast(e.message, { kind: 'error' });
    }
  }

  if (!entries || !lists) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Top lists</h1>
          <p className="lede">Your overall top {MAX} leads your vault and your profile. Each shelf gets its own ranking too.</p>
        </div>
      </header>
      <p className="muted small">Your profile shows the top {profile?.showcase_size || 5} of each list. Change that in Settings.</p>

      <div className="top-grid">
        {keys.map((key) => {
          const ids = (lists[key] || []).filter((id) => byId.has(id));
          return (
            <section key={key} className="panel">
              <div className="spread">
                <h2 className="h-sub">{key === 'overall' ? 'Overall' : CATEGORY_LABEL[key]}</h2>
                {ids.length < MAX && (
                  <button className="btn sm" onClick={() => setPicking(key)}>
                    <Icon.Plus width={16} height={16} /> Add
                  </button>
                )}
              </div>
              {ids.length === 0 ? (
                <p className="muted small">Nothing ranked yet.</p>
              ) : (
                <ol className="ranked">
                  {ids.map((id, i) => {
                    const e = byId.get(id);
                    const move = (d) => {
                      const next = [...ids];
                      [next[i], next[i + d]] = [next[i + d], next[i]];
                      update(key, next);
                    };
                    return (
                      <li key={id} className="rank-row">
                        <span className="rank-num">{i + 1}</span>
                        <Poster src={e.poster_url} title={e.title} />
                        <span className="rank-title">{e.title}</span>
                        <span className="rank-tools">
                          <button className="icon-btn" disabled={i === 0} onClick={() => move(-1)} aria-label={`Move ${e.title} up`}>
                            <Icon.Up width={16} height={16} />
                          </button>
                          <button className="icon-btn" disabled={i === ids.length - 1} onClick={() => move(1)} aria-label={`Move ${e.title} down`}>
                            <Icon.Down width={16} height={16} />
                          </button>
                          <button className="icon-btn" onClick={() => update(key, ids.filter((x) => x !== id))} aria-label={`Remove ${e.title} from this list`}>
                            <Icon.Close width={16} height={16} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <Picker
        listKey={picking}
        entries={entries}
        taken={new Set(lists[picking] || [])}
        onClose={() => setPicking(null)}
        onPick={(id) => {
          const ids = (lists[picking] || []).filter((x) => byId.has(x));
          update(picking, [...ids, id].slice(0, MAX));
          if (ids.length + 1 >= MAX) setPicking(null);
        }}
      />
    </>
  );
}

function Picker({ listKey, entries, taken, onClose, onPick }) {
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => (listKey === 'overall' || e.category === listKey) && isWatched(e) && !taken.has(e.id))
      .filter((e) => !needle || e.title.toLowerCase().includes(needle))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 60);
  }, [entries, listKey, taken, q]);

  return (
    <Sheet open={Boolean(listKey)} onClose={onClose} title={listKey === 'overall' ? 'Add to your overall top 10' : `Add to top ${CATEGORY_LABEL[listKey] || ''}`}>
      <input id="pick-filter" className="input" placeholder="Find a title you've watched" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="ranked">
        {options.map((e) => (
          <button key={e.id} className="rank-row menu-item" style={{ gridTemplateColumns: '46px minmax(0,1fr) auto' }} onClick={() => onPick(e.id)}>
            <Poster src={e.poster_url} title={e.title} />
            <span className="rank-title">{e.title}</span>
            <span className="muted small">{e.rating != null ? `${Number(e.rating)}/10` : ''}</span>
          </button>
        ))}
        {!options.length && <p className="muted">No watched titles match.</p>}
      </div>
    </Sheet>
  );
}
