'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { addBlendItem, blendFull, leaveBlend, removeBlendItem, setBlendWatched, voteBlendItem } from '@/lib/social4';
import { displayName, sharedEntries } from '@/lib/social';
import { searchCatalog } from '@/lib/catalog';
import { useAuth } from '@/components/AppShell';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';

const key = (x) => `${x.source}:${x.media_type}:${x.source_id}`;
const SEEN = new Set(['completed', 'watching', 'stopped', 'dropped', 'tried']);

export default function BlendPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [b, setB] = useState(null);
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(null);

  const load = () =>
    blendFull(id)
      .then((x) => (x ? setB(x) : setError('This blend no longer exists, or you are not in it.')))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!b) return;
    Promise.all(b.members.map((m) => sharedEntries(m.id).catch(() => []))).then(setLists);
  }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchCatalog(q.trim()).then((r) => setResults(r.slice(0, 6))).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Suggestions: on someone's plan list or loved by someone, and not yet seen by everyone.
  const suggestions = useMemo(() => {
    if (!b || !lists) return [];
    const inBlend = new Set(b.items.map(key));
    const m = new Map();
    lists.forEach((list, i) => {
      for (const e of list) {
        const k = key(e);
        if (inBlend.has(k)) continue;
        const cur = m.get(k) || { e, wants: [], loved: [], seen: [] };
        if (e.status === 'plan') cur.wants.push(i);
        if (e.rating >= 8) cur.loved.push(i);
        if (SEEN.has(e.status)) cur.seen.push(i);
        m.set(k, cur);
      }
    });
    return [...m.values()]
      .filter((x) => x.seen.length < b.members.length && (x.wants.length || x.loved.length))
      .map((x) => ({ ...x, score: x.wants.length * 2 + x.loved.length * 1.5 - x.seen.length + (x.e.popularity || 0) / 1000 }))
      .sort((a, b2) => b2.score - a.score)
      .slice(0, 18);
  }, [b, lists]);

  if (error) return <p className="notice">{error}</p>;
  if (!b) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;
  const owner = b.created_by === user?.id;
  const nameOf = (i) => displayName(b.members[i]);

  async function add(t) {
    try {
      const it = await addBlendItem(b.id, t);
      setB({ ...b, items: [...b.items, it] });
      setQ('');
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }
  async function vote(it, v) {
    const mine = it.blend_votes.find((x) => x.user_id === user.id)?.vote || 0;
    const next = mine === v ? 0 : v;
    setB({ ...b, items: b.items.map((x) => (x.id === it.id ? { ...x, blend_votes: [...x.blend_votes.filter((y) => y.user_id !== user.id), ...(next ? [{ user_id: user.id, vote: next }] : [])] } : x)) });
    try {
      await voteBlendItem(it.id, next);
    } catch (e) {
      toast(e.message, { kind: 'error' });
      load();
    }
  }
  const score = (it) => it.blend_votes.reduce((a, v) => a + v.vote, 0);
  const items = [...b.items].sort((x, y) => Number(x.watched) - Number(y.watched) || score(y) - score(x));
  const pickTonight = items.find((x) => !x.watched);

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">{b.name}</h1>
          <p className="muted">{b.members.map((m) => displayName(m)).join(', ')}</p>
        </div>
        <button
          className="btn sm ghost danger-text"
          onClick={() =>
            leaveBlend(b.id, owner)
              .then(() => router.push('/blends'))
              .catch((e) => toast(e.message, { kind: 'error' }))
          }
        >
          {owner ? 'Delete blend' : 'Leave blend'}
        </button>
      </header>

      {pickTonight && score(pickTonight) > 0 && (
        <section className="panel tonight">
          <Poster src={pickTonight.poster_url} title={pickTonight.title} size="sm" />
          <div>
            <p className="kicker">Tonight&apos;s pick</p>
            <h2 className="h-section">{pickTonight.title}</h2>
            <p className="muted small">Top voted by the group</p>
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="h-section">The list</h2>
        <input id="blend-add" className="input" placeholder="Add a title for the group…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="add-results">
            {results.map((r) => (
              <button key={`${r.source}${r.sourceId}`} className="add-row as-button" onClick={() => add(r)}>
                <Poster src={r.poster} title={r.title} size="sm" />
                <span>
                  <b>{r.title}</b>
                  <span className="muted small">{r.year}</span>
                </span>
                <Icon.Plus width={16} height={16} />
              </button>
            ))}
          </div>
        )}
        {!items.length && <p className="muted">Nothing yet. Add titles above or from the suggestions below.</p>}
        <div className="blend-items">
          {items.map((it) => {
            const mine = it.blend_votes.find((x) => x.user_id === user?.id)?.vote || 0;
            return (
              <div key={it.id} className={`blend-item ${it.watched ? 'watched' : ''}`}>
                <button className="as-button" onClick={() => setOpen({ source: it.source, mediaType: it.media_type, sourceId: it.source_id, title: it.title, poster: it.poster_url, year: it.year })}>
                  <Poster src={it.poster_url} title={it.title} size="sm" />
                </button>
                <span className="cal-text">
                  <b>{it.title}</b>
                  <span className="muted small">
                    {score(it) > 0 ? `+${score(it)}` : score(it)} · added by {displayName(b.members.find((m) => m.id === it.added_by))}
                  </span>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <button className={`icon-btn sm ${mine === 1 ? 'on' : ''}`} onClick={() => vote(it, 1)} aria-label="Vote up">
                    <Icon.Up width={14} height={14} />
                  </button>
                  <button className={`icon-btn sm ${mine === -1 ? 'on' : ''}`} onClick={() => vote(it, -1)} aria-label="Vote down">
                    <Icon.Down width={14} height={14} />
                  </button>
                  <button
                    className={`icon-btn sm ${it.watched ? 'on' : ''}`}
                    onClick={() => setBlendWatched(it.id, !it.watched).then(() => setB({ ...b, items: b.items.map((x) => (x.id === it.id ? { ...x, watched: !x.watched } : x)) }))}
                    aria-label={it.watched ? 'Mark not watched' : 'We watched it'}
                  >
                    <Icon.Check width={14} height={14} />
                  </button>
                  {(it.added_by === user?.id || owner) && (
                    <button className="icon-btn sm" onClick={() => removeBlendItem(it.id).then(() => setB({ ...b, items: b.items.filter((x) => x.id !== it.id) }))} aria-label="Remove">
                      <Icon.Close width={14} height={14} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2 className="h-section">Suggested for this group</h2>
        <p className="muted small">From everyone&apos;s plan-to-watch lists and favourites, skipping what you&apos;ve all seen.</p>
        {!lists && <div className="skeleton" style={{ height: 160, aspectRatio: 'auto' }} />}
        {lists && !suggestions.length && <p className="muted">No suggestions yet. Members&apos; plan-to-watch lists and 8+ ratings feed this.</p>}
        <div className="blend-items">
          {suggestions.map((x) => (
            <div key={key(x.e)} className="blend-item">
              <Poster src={x.e.poster_url} title={x.e.title} size="sm" />
              <span className="cal-text">
                <b>{x.e.title}</b>
                <span className="muted small">
                  {[x.wants.length && `${x.wants.map(nameOf).join(', ')} want${x.wants.length === 1 ? 's' : ''} to watch`, x.loved.length && `${x.loved.map(nameOf).join(', ')} loved it`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button className="btn sm" onClick={() => add({ source: x.e.source, mediaType: x.e.media_type, sourceId: x.e.source_id, title: x.e.title, poster: x.e.poster_url, year: x.e.year })}>
                Add
              </button>
            </div>
          ))}
        </div>
      </section>
      {open && <DetailSheet item={open} open onClose={() => setOpen(null)} />}
    </>
  );
}
