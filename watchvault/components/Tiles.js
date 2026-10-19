'use client';

import { useState } from 'react';
import Link from 'next/link';
import Poster from './Poster';
import Sheet from './Sheet';
import EntryEditor from './EntryEditor';
import { Icon } from './Icons';
import { CATEGORY_SHORT, STATUS_LABEL, completionPct, progressLabel } from '@/lib/categories';
import { addTitle, entryHref, itemHref } from '@/lib/actions';
import { toast } from '@/lib/toast';
import { useEntries } from '@/lib/store';
import { tilt } from './tilt';

const QUICK = [
  { status: 'completed', label: 'Watched it all' },
  { status: 'watching', label: 'Watched half', pct: 50, movieOnly: true },
  { status: 'watching', label: 'Watching now' },
  { status: 'plan', label: 'Want to watch' },
  { status: 'dropped', label: 'Started, then stopped' },
];

/** A catalogue title with one-tap "seen it" and a menu for other states. */
export function TitleTile({ item, size = 'md', showMeta = true }) {
  const { lookup } = useEntries();
  const entry = lookup(item);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);

  async function add(status, pct) {
    setMenu(false);
    try {
      await addTitle(item, status, pct != null ? { pct } : {});
      toast(`${item.title} added as ${pct === 50 ? 'half watched' : STATUS_LABEL[status].toLowerCase()}`);
    } catch {
      /* addTitle already showed the error */
    }
  }

  return (
    <div className="tile">
      <Link href={itemHref(item)} className="tile-link" aria-label={item.title} {...tilt}>
        <Poster src={item.poster} title={item.title} size={size}>
          {entry && <span className={`tile-badge st-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>}
        </Poster>
      </Link>
      <div className="tile-actions">
        <button className="tick ghost" onClick={() => (entry ? setEdit(true) : setMenu(true))} aria-label={`More options for ${item.title}`}>
          <Icon.More width={16} height={16} />
        </button>
        {entry ? (
          <button className="tick on" onClick={() => setEdit(true)} aria-label={`Edit ${item.title} in your list`}>
            <Icon.Check width={16} height={16} />
          </button>
        ) : (
          <button className="tick" onClick={() => add('completed')} aria-label={`Mark ${item.title} as watched`}>
            <Icon.Check width={16} height={16} />
          </button>
        )}
      </div>
      {showMeta && (
        <div className="tile-meta">
          <Link href={itemHref(item)} className="tile-title">
            {item.title}
          </Link>
          <span className="tile-sub">{[item.year, CATEGORY_SHORT[item.category]].filter(Boolean).join(', ')}</span>
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={item.title}>
        <div className="menu-list">
          {QUICK.filter((q) => !q.movieOnly || item.mediaType === 'movie').map((q) => (
            <button key={q.label} className="menu-item" onClick={() => add(q.status, q.pct)}>
              {q.label}
            </button>
          ))}
          <Link href={itemHref(item)} className="menu-item muted-item" onClick={() => setMenu(false)}>
            Open details
          </Link>
        </div>
      </Sheet>
      {entry && <QuickEdit entry={entry} open={edit} onClose={() => setEdit(false)} />}
    </div>
  );
}

/** One of your own titles, with quick edit and multi-select. */
export function EntryTile({ entry, selecting = false, selected = false, onToggle }) {
  const [edit, setEdit] = useState(false);
  const pct = completionPct(entry);
  const body = (
    <Poster src={entry.poster_url} title={entry.title}>
      {selecting && <span className={`select-dot ${selected ? 'on' : ''}`}>{selected && <Icon.Check width={14} height={14} />}</span>}
      {pct != null && pct > 0 && pct < 100 && (
        <span className="progress-line" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
    </Poster>
  );
  return (
    <div className={`tile ${selected ? 'selected' : ''}`}>
      {selecting ? (
        <button className="tile-link as-button" onClick={() => onToggle?.(entry.id)} aria-pressed={selected} aria-label={`Select ${entry.title}`}>
          {body}
        </button>
      ) : (
        <Link href={entryHref(entry)} className="tile-link" aria-label={entry.title} {...tilt}>
          {body}
        </Link>
      )}
      {!selecting && (
        <div className="tile-actions">
          <button className="tick ghost" onClick={() => setEdit(true)} aria-label={`Quick edit ${entry.title}`}>
            <Icon.More width={16} height={16} />
          </button>
        </div>
      )}
      <div className="tile-meta">
        <Link href={entryHref(entry)} className="tile-title">
          {entry.title}
        </Link>
        <span className="tile-sub">
          <span className={`dot st-${entry.status}`} aria-hidden="true" />
          {entry.status === 'completed' && entry.media_type === 'movie' ? 'Watched' : entry.status === 'completed' ? progressLabel(entry) : `${STATUS_LABEL[entry.status]}${entry.status !== 'plan' ? `, ${progressLabel(entry).toLowerCase()}` : ''}`}
        </span>
        {entry.rating != null && <span className="tile-rating">{Number(entry.rating)}/10</span>}
      </div>
      <QuickEdit entry={entry} open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}

export function QuickEdit({ entry, open, onClose }) {
  const { index } = useEntries();
  // Always edit the newest copy of the entry
  const live = [...index.values()].find((e) => e.id === entry.id) || entry;
  return (
    <Sheet open={open} onClose={onClose} title={live.title}>
      <div className="quick-head">
        <Poster src={live.poster_url} title={live.title} size="sm" />
        <div>
          <p className="muted">{[live.year, CATEGORY_SHORT[live.category]].filter(Boolean).join(', ')}</p>
          <Link href={entryHref(live)} className="link" onClick={onClose}>
            Open full page
          </Link>
        </div>
      </div>
      <EntryEditor entry={live} compact onRemoved={onClose} />
    </Sheet>
  );
}
