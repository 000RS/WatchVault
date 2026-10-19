'use client';

import Link from 'next/link';
import { CATEGORY_LABEL, STATUS_LABEL, progressLabel } from '@/lib/categories';

export function titleHref(source, mediaType, id) {
  return `/title/${source}/${mediaType}/${id}`;
}

/** A poster tile for a catalogue result (search, new releases). */
export function TitleCard({ item, entry }) {
  return (
    <div className="card">
      <Link href={titleHref(item.source, item.mediaType, item.sourceId)}>
        <Poster src={item.poster} title={item.title} badge={CATEGORY_LABEL[item.category]} inList={entry ? STATUS_LABEL[entry.status] : null} />
      </Link>
      <Link href={titleHref(item.source, item.mediaType, item.sourceId)} className="card-title">
        {item.title}
      </Link>
      <div className="card-meta">
        {[item.year, item.mediaType === 'movie' ? 'Movie' : item.mediaType === 'anime' ? item.format || 'Anime' : 'Series']
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  );
}

/** A poster tile for one of your own list entries. */
export function EntryCard({ entry, onPlusOne, busy }) {
  const pct = completion(entry);
  const canPlus =
    entry.media_type !== 'movie' && (entry.status === 'watching' || entry.status === 'plan' || entry.status === 'on_hold');
  return (
    <div className="card">
      <Link href={titleHref(entry.source, entry.media_type, entry.source_id)}>
        <Poster src={entry.poster_url} title={entry.title} badge={CATEGORY_LABEL[entry.category]} />
      </Link>
      <Link href={titleHref(entry.source, entry.media_type, entry.source_id)} className="card-title">
        {entry.title}
      </Link>
      <div className="row" style={{ gap: 6 }}>
        <span className={`pill ${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
        {entry.rating != null && <span className="small mono muted">★ {Number(entry.rating)}</span>}
      </div>
      {pct != null && pct > 0 && pct < 100 && (
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="spread" style={{ gap: 6 }}>
        <span className="card-meta mono">{progressLabel(entry)}</span>
        {canPlus && (
          <button className="btn sm" disabled={busy} onClick={() => onPlusOne?.(entry)} title="Mark the next episode as watched">
            +1 ep
          </button>
        )}
      </div>
    </div>
  );
}

function completion(e) {
  if (e.media_type === 'movie') return e.movie_progress_pct ?? null;
  if (!e.total_episodes) return null;
  return Math.round(((e.episodes_watched || 0) / e.total_episodes) * 100);
}

export function Poster({ src, title, badge, inList }) {
  return (
    <div className="poster">
      {src ? <img src={src} alt="" loading="lazy" /> : <div className="noimg">{title}</div>}
      {badge && <span className="badge">{badge}</span>}
      {inList && <span className="inlist">{inList}</span>}
    </div>
  );
}
