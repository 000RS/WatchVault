'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getTitle } from '@/lib/catalog';
import { fetchEntry, snapshotFromTitle, updateEntry } from '@/lib/list';
import { CATEGORY_LABEL } from '@/lib/categories';
import { Poster } from '@/components/PosterCard';
import ProgressEditor from '@/components/ProgressEditor';

const SNAPSHOT_KEYS = ['title', 'poster_url', 'total_episodes', 'total_seasons', 'season_episode_counts', 'runtime', 'year'];

let regionNames = null;
function countryName(code) {
  try {
    regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code);
  } catch {
    return code;
  }
}
let langNames = null;
function languageName(code) {
  try {
    langNames ||= new Intl.DisplayNames(['en'], { type: 'language' });
    return langNames.of(code);
  } catch {
    return code;
  }
}

export default function TitlePage() {
  const { src, type, id } = useParams();
  const [title, setTitle] = useState(null);
  const [entry, setEntry] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setTitle(null);
    setEntry(undefined);
    setError(null);
    Promise.all([getTitle(src, type, id), fetchEntry(src, type, id)])
      .then(async ([t, e]) => {
        if (!alive) return;
        setTitle(t);
        setEntry(e);
        // Keep the saved copy of this title up to date (new episodes, new seasons, new poster).
        if (e) {
          const fresh = snapshotFromTitle(t);
          const changed = SNAPSHOT_KEYS.some((k) => JSON.stringify(fresh[k] ?? null) !== JSON.stringify(e[k] ?? null));
          if (changed) {
            const patch = Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, fresh[k] ?? null]));
            const updated = await updateEntry(e.id, patch).catch(() => null);
            if (alive && updated) setEntry(updated);
          }
        }
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [src, type, id]);

  if (error) return <div className="notice error">{error}</div>;
  if (!title || entry === undefined) return <p className="muted">Loading…</p>;

  const facts = [
    ['Type', title.mediaType === 'movie' ? 'Movie' : title.mediaType === 'anime' ? `Anime${title.format ? ` · ${title.format}` : ''}` : 'Series'],
    ['Year', title.year],
    ['Country', title.countries.map(countryName).join(', ')],
    ['Language', title.language ? languageName(title.language) : null],
    ['Seasons', title.totalSeasons],
    ['Episodes', title.totalEpisodes],
    ['Runtime', title.runtime ? `${title.runtime} min${title.mediaType !== 'movie' ? ' / ep' : ''}` : null],
    ['Status', title.airing],
    [
      'Next episode',
      title.nextEpisode
        ? `${title.nextEpisode.season ? `S${title.nextEpisode.season} ` : ''}E${title.nextEpisode.episode} on ${title.nextEpisode.date}`
        : null,
    ],
  ].filter(([, v]) => v);

  const newEpisodes =
    entry && title.totalEpisodes && entry.episodes_watched != null && entry.status !== 'completed'
      ? title.totalEpisodes - entry.episodes_watched
      : 0;

  return (
    <>
      <div className="hero">
        <Poster src={title.poster} title={title.title} />
        <div className="stack" style={{ minWidth: 0 }}>
          <span className="tag">{CATEGORY_LABEL[entry?.category || title.category]}</span>
          <h1>{title.title}</h1>
          {title.originalTitle && title.originalTitle !== title.title && <p className="muted">{title.originalTitle}</p>}
          <div className="facts">
            {facts.map(([k, v]) => (
              <span key={k}>
                {k} <b>{v}</b>
              </span>
            ))}
          </div>
          {title.genres.length > 0 && <p className="small muted">{title.genres.join(' · ')}</p>}
          {newEpisodes > 0 && entry.status === 'watching' && (
            <div className="notice ok">
              {newEpisodes} episode{newEpisodes === 1 ? '' : 's'} left for you to watch.
            </div>
          )}
          {title.overview && <p className="overview overview-wide">{title.overview}</p>}
          <a className="small muted" href={title.link} target="_blank" rel="noreferrer">
            View on {title.source === 'anilist' ? 'AniList' : 'TMDB'} ↗
          </a>
        </div>
      </div>
      {title.overview && <p className="overview overview-narrow">{title.overview}</p>}

      <ProgressEditor
        key={`${src}-${type}-${id}`}
        title={title}
        entry={entry}
        onSaved={setEntry}
        onRemoved={() => setEntry(null)}
      />
    </>
  );
}
