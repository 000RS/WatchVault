'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { companyInfo, companyTitles } from '@/lib/catalog';
import { viewMemory } from '@/lib/store';
import { TitleTile } from '@/components/Tiles';
import { Icon } from '@/components/Icons';

export default function StudioPage() {
  const { id } = useParams();
  const router = useRouter();
  const memKey = `studio:${id}`;
  const mem = viewMemory.get(memKey) || {};
  const [info, setInfo] = useState(null);
  const [media, setMedia] = useState(mem.media || 'movie');
  const [grid, setGrid] = useState(mem.grids?.[mem.media || 'movie'] || { items: [], page: 0, total: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    companyInfo(id).then(setInfo).catch((e) => setError(e.message));
  }, [id]);

  const load = useCallback(
    async (page) => {
      setBusy(true);
      try {
        const r = await companyTitles(id, media, page);
        setGrid((g) => {
          const next = { items: page === 1 ? r.items : g.items.concat(r.items), page, total: r.totalPages };
          const m = viewMemory.get(memKey) || {};
          viewMemory.set(memKey, { ...m, media, grids: { ...(m.grids || {}), [media]: next } });
          return next;
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [id, media, memKey]
  );

  useEffect(() => {
    const cached = (viewMemory.get(memKey) || {}).grids?.[media];
    if (cached) setGrid(cached);
    else {
      setGrid({ items: [], page: 0, total: 1 });
      load(1);
    }
    viewMemory.set(memKey, { ...(viewMemory.get(memKey) || {}), media });
  }, [media, load, memKey]);

  return (
    <>
      <div>
        <button className="btn sm ghost" onClick={() => router.back()}>
          <Icon.Back width={16} height={16} /> Back
        </button>
      </div>
      <header className="page-head">
        <div className="head-text">
          {info?.logo && <img src={info.logo} alt="" className="studio-logo" />}
          <h1 className="h-page">{info?.name || 'Studio'}</h1>
          {info?.about && <p className="lede">{info.about}</p>}
        </div>
        <div className="tabs" role="tablist">
          {[
            ['movie', 'Films'],
            ['tv', 'Series'],
          ].map(([m, label]) => (
            <button key={m} role="tab" aria-selected={media === m} className={`tab-btn ${media === m ? 'on' : ''}`} onClick={() => setMedia(m)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {error && <p className="notice error">{error}</p>}
      <div className="grid-posters">
        {grid.items.map((i) => (
          <TitleTile key={`${i.mediaType}${i.sourceId}`} item={i} />
        ))}
        {busy && Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" />)}
      </div>
      {!busy && !grid.items.length && !error && <p className="muted">Nothing listed here yet.</p>}
      {!busy && grid.page < grid.total && grid.items.length > 0 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => load(grid.page + 1)}>
            Show more
          </button>
        </div>
      )}
    </>
  );
}
