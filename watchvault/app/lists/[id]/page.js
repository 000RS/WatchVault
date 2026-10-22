'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { deleteList, getList, saveList, itemOf, sameItem } from '@/lib/social4';
import { profilesByIds, displayName } from '@/lib/social';
import { searchAnything as searchCatalog } from '@/lib/shelves';
import { useAuth } from '@/components/AppShell';
import { useEntries } from '@/lib/store';
import Poster from '@/components/Poster';
import { CATEGORY_SHORT } from '@/lib/categories';
import { DetailSheet } from '@/components/Tiles';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';

export default function ListPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { lookup } = useEntries();
  const [list, setList] = useState(null);
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    getList(id)
      .then(async (l) => {
        if (!l) return setError('This list is private or no longer exists.');
        setList(l);
        const [p] = await profilesByIds([l.user_id]);
        setOwner(p || null);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchCatalog(q.trim()).then((r) => setResults(r.slice(0, 14))).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  if (error) return <p className="notice">{error}</p>;
  if (!list) return <div className="skeleton" style={{ height: 300, aspectRatio: 'auto' }} />;
  const mine = user?.id === list.user_id;
  const items = list.items || [];

  async function update(patch) {
    const next = { ...list, ...patch };
    setList(next);
    try {
      setList(await saveList(next));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }
  const move = (k, d) => {
    const next = [...items];
    [next[k], next[k + d]] = [next[k + d], next[k]];
    update({ items: next });
  };
  const add = (t) => {
    const it = itemOf(t);
    if (items.some((x) => sameItem(x, it))) return toast('Already in this list');
    update({ items: [...items, it] });
    toast(`Added ${t.title}`);
  };
  const seen = items.filter((it) => lookup({ source: it.source, mediaType: it.media_type, sourceId: it.source_id, title: it.title })).length;

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          {editing ? (
            <input className="input h-input" value={list.name} onChange={(e) => setList({ ...list, name: e.target.value })} onBlur={() => update({ name: list.name.trim() || 'Untitled list' })} maxLength={80} aria-label="List name" />
          ) : (
            <h1 className="h-page">{list.name}</h1>
          )}
          <p className="muted">
            {items.length} titles
            {owner && !mine ? ` · by ${displayName(owner)}` : ''}
            {!mine && items.length ? ` · you've seen ${seen}` : ''}
          </p>
        </div>
        <div className="row">
          {mine && (
            <button className={`btn sm ${editing ? 'primary' : ''}`} onClick={() => setEditing(!editing)}>
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            className="btn sm"
            onClick={() =>
              navigator.clipboard
                .writeText(window.location.href)
                .then(() => toast(list.is_public ? 'Link copied' : 'Link copied. Make the list public so others can open it.'))
                .catch(() => toast(window.location.href))
            }
          >
            <Icon.Link width={16} height={16} /> Share
          </button>
        </div>
      </header>

      {editing ? (
        <div className="panel stack" style={{ padding: 18 }}>
          <textarea className="textarea" placeholder="What's this list about? (optional)" value={list.description || ''} onChange={(e) => setList({ ...list, description: e.target.value })} onBlur={() => update({ description: list.description })} maxLength={500} />
          <div className="toolbar">
            <label className="row small">
              <span className="toggle">
                <input type="checkbox" checked={list.ranked} onChange={(e) => update({ ranked: e.target.checked })} />
                <span />
              </span>
              Ranked (numbered in order)
            </label>
            <label className="row small">
              <span className="toggle">
                <input type="checkbox" checked={list.is_public} onChange={(e) => update({ is_public: e.target.checked })} />
                <span />
              </span>
              Public on your profile
            </label>
            {confirm ? (
              <>
                <span className="muted small">Delete this list?</span>
                <button
                  className="btn sm danger"
                  onClick={() =>
                    deleteList(list.id)
                      .then(() => router.push('/lists'))
                      .catch((e) => toast(e.message, { kind: 'error' }))
                  }
                >
                  Delete
                </button>
                <button className="btn sm ghost" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button className="btn sm ghost danger-text" onClick={() => setConfirm(true)}>
                Delete list
              </button>
            )}
          </div>
          <input id="list-add" className="input" placeholder="Add a title: search movies, series, anime…" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length > 0 && (
            <div className="add-results">
              {results.map((r) => (
                <button key={`${r.source}${r.sourceId}`} className="add-row as-button" onClick={() => add(r)}>
                  <Poster src={r.poster} title={r.title} size="sm" />
                  <span>
                    <b>{r.title}</b>
                    <span className="muted small">{[r.year, CATEGORY_SHORT[r.category]].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Icon.Plus width={16} height={16} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        list.description && <p className="lede">{list.description}</p>
      )}

      {!items.length && <p className="muted">{mine ? 'Empty for now. Tap Edit to add titles, or use “Your lists” on any title.' : 'Nothing here yet.'}</p>}
      <ol className={`list-items ${list.ranked ? 'ranked' : ''}`}>
        {items.map((it, k) => {
          const title = { source: it.source, mediaType: it.media_type, sourceId: it.source_id, title: it.title, poster: it.poster_url, year: it.year };
          const have = lookup(title);
          return (
            <li key={`${it.source}${it.source_id}`} className="list-item">
              {list.ranked && <span className="rank-big">{k + 1}</span>}
              <button className="as-button" onClick={() => setOpen(title)} aria-label={`${it.title}, details`}>
                <Poster src={it.poster_url} title={it.title} />
              </button>
              <span className="list-item-text">
                <b>{it.title}</b>
                <span className="muted small">
                  {it.year}
                  {have ? ' · in your list' : ''}
                </span>
              </span>
              {editing && (
                <span className="row list-item-tools">
                  <button className="icon-btn sm" disabled={k === 0} onClick={() => move(k, -1)} aria-label="Move up">
                    <Icon.Up width={14} height={14} />
                  </button>
                  <button className="icon-btn sm" disabled={k === items.length - 1} onClick={() => move(k, 1)} aria-label="Move down">
                    <Icon.Down width={14} height={14} />
                  </button>
                  <button className="icon-btn sm" onClick={() => update({ items: items.filter((_, j) => j !== k) })} aria-label="Remove">
                    <Icon.Close width={14} height={14} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {owner?.username && !mine && (
        <Link href={`/u/${owner.username}`} className="link small">
          More from {displayName(owner)}
        </Link>
      )}
      {open && <DetailSheet item={open} open onClose={() => setOpen(null)} />}
    </>
  );
}
