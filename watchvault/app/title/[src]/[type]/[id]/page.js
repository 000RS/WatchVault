'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTitleFull, similarTitles } from '@/lib/catalog';
import { Credits, WhereToWatch } from '@/components/TitleExtras';
import { AddOptions } from '@/components/Tiles';
import AskPanel, { useAiEnabled } from '@/components/Ask';
import { CATEGORY_LABEL } from '@/lib/categories';
import { snapshotFromTitle } from '@/lib/list';
import { updateEntry, useEntries } from '@/lib/store';
import { addTitle } from '@/lib/actions';
import { toast } from '@/lib/toast';
import Poster from '@/components/Poster';
import EntryEditor from '@/components/EntryEditor';
import Shelf from '@/components/Shelf';
import { Icon } from '@/components/Icons';
import { ListsField } from '@/components/EntryExtras';

const SNAPSHOT_KEYS = ['title', 'poster_url', 'total_episodes', 'total_seasons', 'season_episode_counts', 'runtime', 'year', 'genres'];

const region = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
  } catch {
    return code;
  }
};
const language = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  } catch {
    return code;
  }
};

export default function TitlePage() {
  const { src, type, id } = useParams();
  const router = useRouter();
  const { index, lookup } = useEntries();
  const [title, setTitle] = useState(null);
  const [full, setFull] = useState(null);
  const [ask, setAsk] = useState(false);
  const ai = useAiEnabled();
  // The same anime saved from AniList counts as this title too.
  const entry = index.get(`${src}:${type}:${id}`) || (title ? lookup(title) : undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setTitle(null);
    setFull(null);
    setError(null);
    getTitleFull(src, type, id)
      .then((f) => {
        if (!alive) return;
        setFull(f);
        setTitle(f.title);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [src, type, id]);

  // New seasons, episodes or posters flow into your saved copy automatically.
  useEffect(() => {
    if (!title || !entry || String(entry.id).startsWith('tmp-') || entry.source !== title.source) return;
    const fresh = snapshotFromTitle(title);
    const changed = SNAPSHOT_KEYS.filter((k) => fresh[k] != null && JSON.stringify(fresh[k]) !== JSON.stringify(entry[k] ?? null));
    if (changed.length) updateEntry(entry.id, Object.fromEntries(changed.map((k) => [k, fresh[k]])), { delay: 0 }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, entry?.id]);

  const similar = useMemo(() => (src === 'tmdb' ? () => similarTitles(type, id) : null), [src, type, id]);

  const view = title || (entry && { title: entry.title, poster: entry.poster_url, year: entry.year, category: entry.category, countries: entry.origin_country ? [entry.origin_country] : [], genres: entry.genres || [], seasons: [], overview: '' });
  if (error && !view) return <p className="notice error">{error}</p>;
  if (!view) return <div className="skeleton" style={{ height: 360, aspectRatio: 'auto' }} />;

  const facts = [
    view.year,
    title?.mediaType === 'movie' ? 'Movie' : title?.format || (title?.totalSeasons ? `${title.totalSeasons} ${title.totalSeasons === 1 ? 'season' : 'seasons'}` : null),
    title?.totalEpisodes && title?.mediaType !== 'movie' ? `${title.totalEpisodes} episodes` : null,
    title?.runtime ? `${title.runtime} min${title.mediaType !== 'movie' ? ' per episode' : ''}` : null,
    view.countries?.length ? view.countries.map(region).join(', ') : null,
    title?.language ? language(title.language) : null,
    title?.airing,
  ].filter(Boolean);

  return (
    <>
      <div>
        <button className="btn sm ghost" onClick={() => (window.history.length > 1 ? router.back() : router.push('/list'))}>
          <Icon.Back width={16} height={16} /> Back
        </button>
      </div>

      <section className="title-hero">
        {title?.backdrop && (
          <div className="title-backdrop" aria-hidden="true">
            <img src={title.backdrop} alt="" />
          </div>
        )}
        <Poster src={view.poster} title={view.title} />
        <div className="stack">
          <p className="muted">{CATEGORY_LABEL[entry?.category || view.category]}</p>
          <h1 className="h-page">{view.title}</h1>
          {title?.originalTitle && title.originalTitle !== title.title && <p className="muted">{title.originalTitle}</p>}
          <div className="title-facts">
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
          {title?.nextEpisode && (
            <p className="small">
              Next episode{title.nextEpisode.season ? `, season ${title.nextEpisode.season}` : ''} episode {title.nextEpisode.episode}: {title.nextEpisode.date}
            </p>
          )}
        </div>
      </section>

      <div className="title-body">
        <div className="stack">
          {view.overview && <p className="overview">{view.overview}</p>}
          {view.genres?.length > 0 && <p className="muted">{view.genres.join(', ')}</p>}
          {src === 'tmdb' && (
            <div className="panel">
              <h2 className="h-sub">Where to watch</h2>
              {full ? <WhereToWatch providers={full.providers} /> : <div className="skeleton" style={{ height: 52, aspectRatio: 'auto' }} />}
              {ai && (
                <button className="btn sm" onClick={() => setAsk(!ask)}>
                  {ask ? 'Hide the guide' : 'Ask the guide how to watch this'}
                </button>
              )}
            </div>
          )}
          {ask && title && <AskPanel starter={`How should I watch ${title.title}${title.year ? ` (${title.year})` : ''}? Tell me where it streams for me, what to watch first if it's part of a bigger story, and anything I should know.`} />}
          {full && <Credits full={full} />}
          {title?.seasons?.length > 0 && (
            <div className="panel">
              <h2 className="h-sub">Seasons</h2>
              <div className="seasons">
                {title.seasons.map((s) => (
                  <div key={s.number} className="season-row">
                    <span>{s.name || `Season ${s.number}`}</span>
                    <span className="muted num">
                      {s.episodes} episodes{s.airDate ? `, ${s.airDate.slice(0, 4)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="panel">
          {entry ? (
            <>
              <h2 className="h-sub">In your list</h2>
              <EntryEditor key={entry.id} entry={entry} onRemoved={() => {}} />
            </>
          ) : (
            <AddPanel title={title} />
          )}
          {title && <ListsField title={title} />}
        </aside>
      </div>

      {similar && title && <Shelf key={`${src}${type}${id}`} title="More like this" load={() => similarTitles(type, id, { language: title.language, genres: title.genres })} hideAdded />}
    </>
  );
}

function AddPanel({ title }) {
  if (!title) return <div className="skeleton" style={{ height: 160, aspectRatio: 'auto' }} />;
  return (
    <div className="stack">
      <h2 className="h-sub">Add to your list</h2>
      <AddOptions item={title} />
      <p className="hint">You can set the exact season, episode, rating and date after adding.</p>
    </div>
  );
}
