'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeTmdb, similarTitles, tmdb, searchEverything } from '@/lib/catalog';
import { booksBySubject, mangaByGenres, searchShelf, SHELF_KINDS } from '@/lib/shelves';
import { isScreen, CATEGORY_SHORT } from '@/lib/categories';
import { addTitle } from '@/lib/actions';
import { useEntries, viewMemory } from '@/lib/store';
import { askGuide, useAiEnabled } from '@/components/Ask';
import Poster from '@/components/Poster';
import { DetailSheet, TitleTile } from '@/components/Tiles';
import { toast } from '@/lib/toast';

const TABS = [
  ['blind', 'Blind discovery', 'No titles, no ratings, no posters. Just the story. Decide on feel alone, then reveal.'],
  ['rabbit', 'Rabbit hole', 'Start anywhere and follow what grabs you. Every pick opens a new path, across every shelf.'],
  ['cross', 'Crossover', 'Loved something? Get books, manga, games, music and films with the same feel.'],
];

export default function DiscoverPage() {
  const [tab, setTab] = useState(viewMemory.get('discover:tab') || 'blind');
  useEffect(() => {
    viewMemory.set('discover:tab', tab);
  }, [tab]);
  const cur = TABS.find((t) => t[0] === tab);
  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Discover</h1>
          <p className="muted">{cur[2]}</p>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {tab === 'blind' && <Blind />}
      {tab === 'rabbit' && <Rabbit />}
      {tab === 'cross' && <Cross />}
    </>
  );
}

/* ---------------- Blind discovery ---------------- */

const mask = (text, item) => {
  let t = String(text || '');
  for (const n of [item.title, item.originalTitle].filter(Boolean)) t = t.split(n).join('▇▇▇');
  return t;
};

function Blind() {
  const { lookup } = useEntries();
  const [deck, setDeck] = useState(null);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    setDeck(null);
    setI(0);
    setRevealed(null);
    const page = String(1 + (round % 8));
    // Less-known but well-loved: the kind of thing ratings and posters make you skip.
    Promise.all([
      tmdb('discover/movie', { sort_by: 'vote_average.desc', 'vote_count.gte': '80', 'vote_count.lte': '1200', page }).catch(() => ({ results: [] })),
      tmdb('discover/tv', { sort_by: 'vote_average.desc', 'vote_count.gte': '40', 'vote_count.lte': '600', without_genres: '10767,10763,10764,16', page }).catch(() => ({ results: [] })),
    ]).then(([a, b]) => {
      const items = [...(a.results || []).map((r) => normalizeTmdb(r, 'movie')), ...(b.results || []).map((r) => normalizeTmdb(r, 'tv'))].filter((x) => x.overview && x.overview.length > 80 && !lookup(x));
      setDeck(items.sort(() => Math.random() - 0.5).slice(0, 20));
    });
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!deck) return <div className="skeleton" style={{ height: 320, aspectRatio: 'auto' }} />;
  const card = deck[i];
  if (!card)
    return (
      <div className="empty">
        <p className="lede">That&apos;s this batch.</p>
        <button className="btn" onClick={() => setRound((r) => r + 1)}>
          Another batch
        </button>
      </div>
    );

  function decide(want) {
    setRevealed({ card, want });
    if (want) addTitle(card, 'plan').then(() => toast(`Saved ${card.title}`)).catch(() => {});
  }
  const next = () => (setRevealed(null), setI(i + 1));

  return (
    <div className="blind">
      {!revealed ? (
        <article className="panel blind-card">
          <div className="swipe-tags">
            <span className="pill">{card.mediaType === 'movie' ? 'A film' : 'A series'}</span>
            {card.genres?.slice(0, 3).map((g) => (
              <span key={g} className="pill">
                {g}
              </span>
            ))}
            {card.year && <span className="pill">{Math.floor(card.year / 10) * 10}s</span>}
          </div>
          <p className="blind-story">{mask(card.overview, card)}</p>
          <div className="row">
            <button className="btn" onClick={() => decide(false)}>
              Not for me
            </button>
            <button className="btn primary" onClick={() => decide(true)}>
              I&apos;m in, reveal it
            </button>
          </div>
          <span className="muted small">
            {i + 1} of {deck.length}
          </span>
        </article>
      ) : (
        <article className="panel blind-reveal">
          <Poster src={revealed.card.poster} title={revealed.card.title} />
          <div className="stack-sm">
            <p className="kicker">{revealed.want ? 'Saved to your plan' : 'You passed on'}</p>
            <h2 className="h-section">{revealed.card.title}</h2>
            <p className="muted">
              {[revealed.card.year, CATEGORY_SHORT[revealed.card.category], revealed.card.rating ? `${revealed.card.rating.toFixed(1)} on TMDB` : null].filter(Boolean).join(' · ')}
            </p>
            {!revealed.want && (
              <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => addTitle(revealed.card, 'plan').then(() => toast('Saved after all'))}>
                Actually, save it
              </button>
            )}
            <button className="btn primary" style={{ justifySelf: 'start' }} onClick={next}>
              Next story
            </button>
          </div>
        </article>
      )}
    </div>
  );
}

/* ---------------- Rabbit hole ---------------- */

async function branches(node) {
  if (isScreen(node) && node.source === 'tmdb') {
    const [similar, books, manga] = await Promise.all([
      similarTitles(node.mediaType, node.sourceId, { language: node.language, genres: node.genres || [] }).catch(() => []),
      node.genres?.[0] ? booksBySubject(node.genres.find((g) => g !== 'Drama') || node.genres[0]).catch(() => []) : [],
      mangaByGenres(node.genres || []).catch(() => []),
    ]);
    return [
      ['More like it', similar.slice(0, 14)],
      ['Books with that feel', books.slice(0, 10)],
      ['Manga with that feel', manga.slice(0, 10)],
    ];
  }
  if (node.mediaType === 'manga' || node.mediaType === 'anime') {
    const [manga, screen] = await Promise.all([mangaByGenres(node.genres || []).catch(() => []), searchEverything((node.genres || [])[0] || node.title, { type: 'anime' }).then((r) => r.items).catch(() => [])]);
    return [
      ['Manga like it', manga.filter((m) => m.sourceId !== node.sourceId).slice(0, 12)],
      ['Anime to try', screen.slice(0, 12)],
    ];
  }
  if (node.mediaType === 'book') {
    const subj = (node.genres || [])[0];
    const [books, screen] = await Promise.all([subj ? booksBySubject(subj).catch(() => []) : [], subj ? searchEverything(subj, {}).then((r) => r.items).catch(() => []) : []]);
    return [
      ['More books on this', books.filter((b) => b.sourceId !== node.sourceId).slice(0, 12)],
      ['On screen', screen.slice(0, 12)],
    ];
  }
  const by = node.meta?.by;
  const more = by ? (await searchShelf(node.mediaType, by).catch(() => ({ items: [] }))).items : [];
  return [[by ? `More from ${by}` : 'More like it', more.filter((m) => m.sourceId !== node.sourceId).slice(0, 12)]];
}

function Rabbit() {
  const { entries } = useEntries();
  const [path, setPath] = useState(() => viewMemory.get('rabbit:path') || []);
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const node = path[path.length - 1];
  const starters = useMemo(
    () =>
      (entries || [])
        .filter((e) => e.favourite || e.rating >= 8)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 12)
        .map((e) => ({ source: e.source, sourceId: e.source_id, mediaType: e.media_type, title: e.title, poster: e.poster_url, year: e.year, category: e.category, genres: e.genres || [], meta: e.meta || {}, language: e.original_language })),
    [entries]
  );

  useEffect(() => {
    viewMemory.set('rabbit:path', path);
    if (!node) return setRows(null);
    setRows(null);
    branches(node).then(setRows);
  }, [node?.sourceId, node?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (item) => setPath((p) => [...p.slice(-9), item]);

  return (
    <>
      {path.length > 0 && (
        <nav className="trail" aria-label="Your path">
          {path.map((p, k) => (
            <button key={`${p.source}${p.sourceId}${k}`} className={`chip ${k === path.length - 1 ? 'on' : ''}`} onClick={() => setPath(path.slice(0, k + 1))}>
              {p.title}
            </button>
          ))}
          <button className="chip ghost" onClick={() => setPath([])}>
            Start over
          </button>
        </nav>
      )}
      {!node && (
        <section className="section">
          <h2 className="h-section">Start from something you love</h2>
          {!starters.length && <p className="muted">Rate a few things 8 or more, or mark favourites, and they show up here.</p>}
          <div className="grid-posters">
            {starters.map((s) => (
              <button key={`${s.source}${s.sourceId}`} className="tile as-button" onClick={() => go(s)}>
                <Poster src={s.poster} title={s.title} />
                <span className="tile-title">{s.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {node && (
        <section className="panel rabbit-node">
          <Poster src={node.poster} title={node.title} size="sm" />
          <div className="stack-sm">
            <p className="kicker">You are here</p>
            <h2 className="h-section">{node.title}</h2>
            <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setOpen(node)}>
              Details
            </button>
          </div>
        </section>
      )}
      {node && !rows && <div className="skeleton" style={{ height: 260, aspectRatio: 'auto' }} />}
      {rows?.map(([title, items]) =>
        items.length ? (
          <section key={title} className="section">
            <h2 className="h-sub">{title}</h2>
            <div className="shelf-track">
              {items.map((it) => (
                <button key={`${it.source}${it.mediaType}${it.sourceId}`} className="tile as-button" onClick={() => go(it)}>
                  <Poster src={it.poster} title={it.title} />
                  <span className="tile-title">{it.title}</span>
                  <span className="tile-sub">{CATEGORY_SHORT[it.category]}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null
      )}
      {open && <DetailSheet item={open} open onClose={() => setOpen(null)} />}
    </>
  );
}

/* ---------------- Crossover ---------------- */

const KIND_SEARCH = { film: 'movie', movie: 'movie', series: 'tv', tv: 'tv', anime: 'anime', book: 'book', manga: 'manga', game: 'game', music: 'music', album: 'music', podcast: 'podcast' };

function Cross() {
  const ai = useAiEnabled();
  const { entries } = useEntries();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const favs = (entries || []).filter((e) => e.favourite || e.rating >= 9).slice(0, 8);

  async function run(from) {
    const text = String(from || q).trim();
    if (!text) return;
    setQ(text);
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      if (!ai) throw new Error('Crossover uses the free AI guide. Add GEMINI_API_KEY in Vercel to switch it on (see README).');
      const d = await askGuide({ mode: 'crossover', from: text });
      // Find each pick in the real catalogues so it can be saved.
      const found = await Promise.all(
        (d.picks || []).map(async (p) => {
          const kind = KIND_SEARCH[p.kind] || 'book';
          const query = `${p.title}${p.by && ['book', 'music'].includes(kind) ? ` ${p.by}` : ''}`;
          let items = [];
          if (['movie', 'tv', 'anime'].includes(kind)) items = (await searchEverything(p.title, { type: kind }).catch(() => ({ items: [] }))).items;
          else items = (await searchShelf(kind, query).catch(() => ({ items: [] }))).items;
          return { ...p, kind, item: items[0] || null };
        })
      );
      setRes({ feel: d.feel, picks: found.filter((x) => x.item) });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    const m = new Map();
    for (const p of res?.picks || []) m.set(p.kind, [...(m.get(p.kind) || []), p]);
    return [...m.entries()];
  }, [res]);
  const LABEL = { movie: 'Films', tv: 'Series', anime: 'Anime', ...Object.fromEntries(SHELF_KINDS.map((k) => [k.id, k.label])) };

  return (
    <>
      <form className="search-bar" onSubmit={(e) => (e.preventDefault(), run())}>
        <input className="search-bar-input" placeholder="I loved… (a film, book, game, album)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary search-go" disabled={busy}>
          {busy ? 'Thinking…' : 'Cross over'}
        </button>
      </form>
      {favs.length > 0 && (
        <div className="chips wrap">
          <span className="muted small">From your favourites:</span>
          {favs.map((e) => (
            <button key={e.id} className="chip" onClick={() => run(e.title)}>
              {e.title}
            </button>
          ))}
        </div>
      )}
      {error && <p className="notice">{error}</p>}
      {busy && <div className="skeleton" style={{ height: 260, aspectRatio: 'auto' }} />}
      {res?.feel && <p className="lede">{res.feel}</p>}
      {groups.map(([kind, picks]) => (
        <section key={kind} className="section">
          <h2 className="h-sub">{LABEL[kind] || kind}</h2>
          <div className="cross-picks">
            {picks.map((p) => (
              <div key={`${p.item.source}${p.item.sourceId}`} className="cross-pick">
                <TitleTile item={p.item} />
                <p className="small muted">{p.why}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
