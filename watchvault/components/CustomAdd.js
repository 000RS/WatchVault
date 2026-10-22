'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import { SHELF_KINDS, customItem } from '@/lib/shelves';
import { addTitle } from '@/lib/actions';
import { statusesFor } from '@/lib/categories';
import { toast } from '@/lib/toast';

const KINDS = [...SHELF_KINDS, { id: 'movie', label: 'Film', category: 'movies' }, { id: 'tv', label: 'Series', category: 'series' }, { id: 'custom', label: 'Anything else', category: 'other' }];

/** "Can't find it? Add it yourself": a hobby, a local café, a stage play, a book that isn't listed. */
export default function CustomAdd({ defaultTitle = '', defaultKind = 'custom', label = 'Can’t find it? Add it yourself' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => setOpen(true)}>
        + {label}
      </button>
      {open && <CustomForm defaultTitle={defaultTitle} defaultKind={defaultKind} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CustomForm({ defaultTitle, defaultKind, onClose }) {
  const [f, setF] = useState({ title: defaultTitle, kind: KINDS.some((k) => k.id === defaultKind) ? defaultKind : 'custom', by: '', year: '', poster: '', link: '', notes: '', status: 'completed' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const kind = KINDS.find((k) => k.id === f.kind);
  const statuses = statusesFor({ media_type: f.kind === 'food' ? 'place' : f.kind === 'movie' || f.kind === 'tv' ? 'movie' : f.kind });
  async function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      const item = customItem({ ...f, kind: ['movie', 'tv'].includes(f.kind) ? f.kind : f.kind, category: kind.category });
      await addTitle(item, f.status);
      toast(`Added ${item.title}`);
      onClose();
    } catch {
      setBusy(false);
    }
  }
  return (
    <Sheet open onClose={onClose} title="Add it yourself">
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input className="input" autoFocus value={f.title} onChange={set('title')} maxLength={200} required />
        </label>
        <label className="field">
          <span>Shelf</span>
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, status: 'completed' })}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="radiogroup" aria-label="Status">
          {statuses.map((s) => (
            <button type="button" key={s.id} role="radio" aria-checked={f.status === s.id} className={`seg-btn ${f.status === s.id ? 'on' : ''}`} onClick={() => setF({ ...f, status: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="goal-row">
          <label className="field">
            <span>{f.kind === 'book' ? 'Author' : f.kind === 'music' ? 'Artist' : ['place', 'food', 'event', 'travel'].includes(f.kind) ? 'Where' : 'By (optional)'}</span>
            <input className="input" value={f.by} onChange={set('by')} maxLength={120} />
          </label>
          <label className="field">
            <span>Year (optional)</span>
            <input className="input" inputMode="numeric" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </label>
        </div>
        <label className="field">
          <span>Image link (optional)</span>
          <input className="input" type="url" placeholder="https://…" value={f.poster} onChange={set('poster')} />
        </label>
        <label className="field">
          <span>Web link (optional)</span>
          <input className="input" type="url" placeholder="https://…" value={f.link} onChange={set('link')} />
        </label>
        <button className="btn primary" disabled={busy || !f.title.trim()}>
          {busy ? 'Adding…' : 'Add to my vault'}
        </button>
      </form>
    </Sheet>
  );
}
