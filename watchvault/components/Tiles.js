'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Poster from './Poster';
import Sheet from './Sheet';
import EntryEditor from './EntryEditor';
import { Credits, WhereToWatch } from './TitleExtras';
import { Icon } from './Icons';
import { ListsField } from './EntryExtras';
import { CATEGORY_LABEL, CATEGORY_SHORT, STATUS_LABEL, completionPct, progressLabel } from '@/lib/categories';
import { getTitleFull } from '@/lib/catalog';
import { addTitle, entryHref, itemHref } from '@/lib/actions';
import { toast } from '@/lib/toast';
import { useEntries } from '@/lib/store';
import { tilt } from './tilt';

const ADD_OPTIONS = [
  { status: 'completed', label: 'Watched it', primary: true },
  { status: 'completed', label: 'Watched today', hint: 'logs it in your diary', today: true },
  { status: 'watching', label: 'Watched half', pct: 50, movieOnly: true },
  { status: 'watching', label: 'Watching now' },
  { status: 'plan', label: 'Plan to watch' },
  { status: 'tried', label: 'Tried it', hint: 'a few episodes', showOnly: true },
  { status: 'stopped', label: 'Stopped', hint: 'after a while', showOnly: true },
  { status: 'dropped', label: "Didn't like it" },
  { status: 'clips', label: 'Seen clips', hint: 'reels, TikTok' },
];

export function AddOptions({ item, onAdded }) {
  const [busy, setBusy] = useState(false);
  const isMovie = item.mediaType === 'movie';
  async function add(o) {
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await addTitle(item, o.status, o.pct != null ? { pct: o.pct } : o.status === 'tried' ? { episodes: 2 } : o.today ? { fields: { watched_from: today, watched_to: today } } : {});
      toast(`${item.title}: ${o.pct === 50 ? 'half watched' : STATUS_LABEL[o.status].toLowerCase()}`);
      onAdded?.();
    } catch {
      /* addTitle already showed the error */
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="add-grid">
      {ADD_OPTIONS.filter((o) => (!o.movieOnly || isMovie) && (!o.showOnly || !isMovie)).map((o) => (
        <button key={o.label} className={`btn ${o.primary ? 'primary' : ''}`} disabled={busy} onClick={() => add(o)}>
          {o.label}
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Everything about a title in a panel over the current page, so browsing never
 * loses your place. `item` is a catalogue title, `entry` one of your saved titles.
 */
export function DetailSheet({ item, entry: given, open, onClose }) {
  const { lookup, index } = useEntries();
  const src = item?.source || given?.source;
  const type = item?.mediaType || given?.media_type;
  const id = item?.sourceId || given?.source_id;
  const [full, setFull] = useState(null);

  useEffect(() => {
    if (!open || full) return;
    let alive = true;
    getTitleFull(src, type, id)
      .then((f) => alive && setFull(f))
      .catch(() => alive && setFull({ title: null }));
    return () => {
      alive = false;
    };
  }, [open, src, type, id, full]);

  const t = full?.title || item;
  const entry = (given && [...index.values()].find((e) => e.id === given.id)) || (t ? lookup(t) : undefined) || index.get(`${src}:${type}:${id}`);
  const poster = t?.poster || entry?.poster_url;
  const name = t?.title || entry?.title || '';
  const facts = [
    t?.year || entry?.year,
    CATEGORY_LABEL[entry?.category || t?.category],
    t?.mediaType === 'movie' ? (t?.runtime ? `${t.runtime} min` : null) : t?.totalSeasons ? `${t.totalSeasons} ${t.totalSeasons === 1 ? 'season' : 'seasons'}` : null,
    t?.rating ? `${Number(t.rating).toFixed(1)} on TMDB` : null,
  ].filter(Boolean);
  const href = entry ? entryHref(entry) : t ? itemHref(t) : '#';

  return (
    <Sheet open={open} onClose={onClose} title={name} wide className="detail">
      {t?.backdrop && (
        <div className="detail-backdrop" aria-hidden="true">
          <img src={t.backdrop} alt="" />
        </div>
      )}
      <div className="detail-top">
        <Poster src={poster} title={name} />
        <div className="stack-sm">
          <h3 className="detail-title">{name}</h3>
          <p className="muted small">{facts.join('  ·  ')}</p>
          {t?.genres?.length > 0 && <p className="muted small">{t.genres.slice(0, 4).join(', ')}</p>}
          <Link href={href} className="link small" onClick={onClose}>
            Open full page
          </Link>
        </div>
      </div>

      <Overview text={t?.overview} loading={!full && !t?.overview} />

      {entry ? (
        <div className="panel" style={{ padding: 18 }}>
          <EntryEditor entry={entry} compact onRemoved={() => {}} />
        </div>
      ) : t ? (
        <AddOptions item={t} />
      ) : null}

      {t && <ListsField title={t} />}

      {src === 'tmdb' && (
        <div className="stack">
          <h4 className="h-sub">Where to watch</h4>
          {full ? <WhereToWatch providers={full.providers} compact /> : <div className="skeleton" style={{ height: 52, aspectRatio: 'auto' }} />}
        </div>
      )}
      {full && <Credits full={full} onNavigate={onClose} />}
    </Sheet>
  );
}

function Overview({ text, loading }) {
  const [more, setMore] = useState(false);
  if (loading) return <div className="skeleton" style={{ height: 66, aspectRatio: 'auto' }} />;
  if (!text) return null;
  const long = text.length > 260;
  return (
    <div className="overview-wrap">
      <p className={`overview ${long && !more ? 'clamp' : ''}`}>{text}</p>
      {long && (
        <button className="as-text-link small" onClick={() => setMore(!more)}>
          {more ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** A catalogue title: tap for details, ✓ for "watched it". */
export function TitleTile({ item, size = 'md', showMeta = true }) {
  const { lookup } = useEntries();
  const entry = lookup(item);
  const [open, setOpen] = useState(false);

  async function quickAdd() {
    try {
      await addTitle(item, 'completed');
      toast(`${item.title} added as completed`);
    } catch {
      /* addTitle already showed the error */
    }
  }

  return (
    <div className="tile">
      <button className="tile-link as-button" onClick={() => setOpen(true)} aria-label={`${item.title}, details`} {...tilt}>
        <Poster src={item.poster} title={item.title} size={size}>
          {entry && <span className={`tile-badge st-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>}
        </Poster>
      </button>
      <div className="tile-actions">
        <button className="tick ghost" onClick={() => setOpen(true)} aria-label={`More options for ${item.title}`}>
          <Icon.More width={16} height={16} />
        </button>
        {entry ? (
          <button className="tick on" onClick={() => setOpen(true)} aria-label={`Edit ${item.title} in your list`}>
            <Icon.Check width={16} height={16} />
          </button>
        ) : (
          <button className="tick" onClick={quickAdd} aria-label={`Mark ${item.title} as watched`}>
            <Icon.Check width={16} height={16} />
          </button>
        )}
      </div>
      {showMeta && (
        <div className="tile-meta">
          <button className="tile-title as-text" onClick={() => setOpen(true)}>
            {item.title}
          </button>
          <span className="tile-sub">{[item.year, CATEGORY_SHORT[item.category]].filter(Boolean).join(', ')}</span>
        </div>
      )}
      {open && <DetailSheet item={item} open={open} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** One of your own titles: tap for details and editing, or select in bulk. */
export function EntryTile({ entry, selecting = false, selected = false, onToggle }) {
  const [open, setOpen] = useState(false);
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
        <button className="tile-link as-button" onClick={() => setOpen(true)} aria-label={`${entry.title}, details`} {...tilt}>
          {body}
        </button>
      )}
      {!selecting && (
        <div className="tile-actions">
          <button className="tick ghost" onClick={() => setOpen(true)} aria-label={`Quick edit ${entry.title}`}>
            <Icon.More width={16} height={16} />
          </button>
        </div>
      )}
      <div className="tile-meta">
        <button className="tile-title as-text" onClick={() => (selecting ? onToggle?.(entry.id) : setOpen(true))}>
          {entry.title}
        </button>
        <span className="tile-sub">
          <span className={`dot st-${entry.status}`} aria-hidden="true" />
          {entry.status === 'completed' ? (entry.media_type === 'movie' ? 'Watched' : progressLabel(entry)) : entry.status === 'plan' || entry.status === 'clips' ? STATUS_LABEL[entry.status] : `${STATUS_LABEL[entry.status]}, ${progressLabel(entry).toLowerCase()}`}
        </span>
        {entry.rating != null && <span className="tile-rating">{Number(entry.rating)}/10</span>}
      </div>
      {open && <DetailSheet entry={entry} open={open} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Kept for older callers: the editor in a sheet. */
export function QuickEdit({ entry, open, onClose }) {
  return open ? <DetailSheet entry={entry} open={open} onClose={onClose} /> : null;
}
