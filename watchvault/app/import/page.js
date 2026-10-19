'use client';

import { useState } from 'react';
import Link from 'next/link';
import { animeByMalIds, anilistUserList, normalizeTmdb, searchAnime, sleep, tmdb } from '@/lib/catalog';
import { CATEGORY_LABEL, STATUSES } from '@/lib/categories';
import { saveMany, snapshotFromTitle } from '@/lib/list';
import { useList } from '@/components/useList';

const METHODS = [
  { id: 'mal', label: 'MyAnimeList file' },
  { id: 'anilist', label: 'AniList username' },
  { id: 'text', label: 'Paste a list of titles' },
];

const MAL_STATUS = {
  watching: 'watching', '1': 'watching',
  completed: 'completed', '2': 'completed',
  'on-hold': 'on_hold', '3': 'on_hold',
  dropped: 'dropped', '4': 'dropped',
  'plan to watch': 'plan', '6': 'plan',
};

const STATUS_WORDS = {
  watching: 'watching', current: 'watching',
  completed: 'completed', done: 'completed', watched: 'completed', finished: 'completed',
  plan: 'plan', 'plan to watch': 'plan', 'to watch': 'plan', later: 'plan',
  'on hold': 'on_hold', 'on-hold': 'on_hold', paused: 'on_hold', hold: 'on_hold',
  dropped: 'dropped',
};

export default function ImportPage() {
  const [method, setMethod] = useState('mal');
  const [rows, setRows] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const { lookup, reload } = useList();

  function reset() {
    setRows(null);
    setUnmatched([]);
    setMsg(null);
    setProgress('');
  }

  async function run(task) {
    reset();
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  /* ----- MyAnimeList export file ----- */
  function onMalFile(file) {
    if (!file) return;
    run(async () => {
      setProgress('Reading file…');
      const list = await readMalFile(file);
      setProgress(`Matching ${list.length} anime with AniList…`);
      const found = await animeByMalIds(list.map((a) => a.malId).filter(Boolean));
      const byMal = new Map(found.map((i) => [i.malId, i]));
      const ok = [];
      const missing = [];
      for (const a of list) {
        const item = byMal.get(a.malId);
        if (!item) missing.push(a.title);
        else ok.push({ item, status: a.status, episodes: a.episodes, rating: a.score || null, notes: null });
      }
      setRows(ok.map((r) => ({ ...r, include: true })));
      setUnmatched(missing);
    });
  }

  /* ----- AniList username ----- */
  function onAnilist(user) {
    if (!user.trim()) return;
    run(async () => {
      setProgress('Loading your AniList…');
      const list = await anilistUserList(user.trim());
      if (!list.length) throw new Error('That AniList profile has no anime, or it is set to private.');
      setRows(list.map((r) => ({ ...r, include: true })));
    });
  }

  /* ----- Pasted titles ----- */
  function onText(text, kind) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    run(async () => {
      const ok = [];
      const missing = [];
      for (let i = 0; i < lines.length; i++) {
        const { name, status, episodes } = parseLine(lines[i]);
        setProgress(`Looking up ${i + 1} of ${lines.length}: ${name}`);
        let item = null;
        try {
          if (kind === 'anime') {
            item = (await searchAnime(name, 1))[0] || null;
          } else {
            const r = await tmdb('search/multi', { query: name, include_adult: 'false' });
            const hit = (r.results || []).find((x) => x.media_type === 'movie' || x.media_type === 'tv');
            item = hit ? normalizeTmdb(hit) : null;
          }
        } catch (e) {
          if (/rate/i.test(e.message)) {
            setProgress('Waiting a minute for AniList…');
            await sleep(60000);
            i--;
            continue;
          }
        }
        if (item) ok.push({ item, status, episodes, rating: null, notes: null, query: name, include: true });
        else missing.push(name);
        await sleep(kind === 'anime' ? 750 : 150);
      }
      setRows(ok);
      setUnmatched(missing);
    });
  }

  async function doImport() {
    const chosen = rows.filter((r) => r.include && !(skipExisting && lookup(r.item)));
    if (!chosen.length) return setMsg({ kind: 'error', text: 'Nothing selected to import.' });
    setBusy(true);
    setMsg(null);
    try {
      const n = await saveMany(chosen.map(toEntry));
      await reload();
      setRows(null);
      setUnmatched([]);
      setMsg({ kind: 'ok', text: `Imported ${n} titles.` });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const selected = rows ? rows.filter((r) => r.include && !(skipExisting && lookup(r.item))).length : 0;

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Import</h1>
        <p className="muted">Bring in a list you already have. You&apos;ll see a preview before anything is saved.</p>
      </div>

      <div className="chips">
        {METHODS.map((m) => (
          <button key={m.id} className={`chip ${method === m.id ? 'on' : ''}`} onClick={() => { setMethod(m.id); reset(); }}>
            {m.label}
          </button>
        ))}
      </div>

      <section className="panel">
        {method === 'mal' && <MalForm busy={busy} onFile={onMalFile} />}
        {method === 'anilist' && <AnilistForm busy={busy} onSubmit={onAnilist} />}
        {method === 'text' && <TextForm busy={busy} onSubmit={onText} />}
        {progress && <p className="muted small">{progress}</p>}
      </section>

      {msg && (
        <div className={`notice ${msg.kind}`}>
          {msg.text} {msg.kind === 'ok' && <Link href="/" style={{ textDecoration: 'underline' }}>Open my list</Link>}
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="notice">
          Couldn&apos;t find {unmatched.length}: {unmatched.slice(0, 20).join(', ')}
          {unmatched.length > 20 ? '…' : ''}. Add these from Search instead.
        </div>
      )}

      {rows && rows.length > 0 && (
        <section className="stack">
          <div className="spread">
            <h2>Preview · {rows.length} found</h2>
            <div className="row">
              <label className="row small">
                <input id="skip-existing" type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
                Skip titles already in my list
              </label>
              <button className="btn primary" disabled={busy || !selected} onClick={doImport}>
                Import {selected} titles
              </button>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th></th>
                  <th>Title</th>
                  <th>Shelf</th>
                  <th>Status</th>
                  <th>Eps</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const exists = !!lookup(r.item);
                  return (
                    <tr key={`${r.item.source}-${r.item.sourceId}-${i}`} style={{ opacity: r.include && !(skipExisting && exists) ? 1 : 0.5 }}>
                      <td>
                        <input
                          id={`inc-${i}`}
                          type="checkbox"
                          aria-label={`Include ${r.item.title}`}
                          checked={r.include}
                          onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                        />
                      </td>
                      <td>{r.item.poster ? <img src={r.item.poster} alt="" /> : null}</td>
                      <td style={{ minWidth: 180 }}>
                        <div style={{ fontWeight: 600 }}>{r.item.title}</div>
                        <div className="small muted">
                          {[r.item.year, r.query && r.query.toLowerCase() !== r.item.title.toLowerCase() ? `you typed "${r.query}"` : null, exists ? 'already in your list' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td>{CATEGORY_LABEL[r.item.category]}</td>
                      <td>
                        <select
                          id={`st-${i}`}
                          className="select"
                          style={{ padding: '5px 8px', minWidth: 130 }}
                          value={r.status}
                          onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}
                        >
                          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="num">
                        {r.item.mediaType === 'movie' ? '—' : `${r.episodes ?? 0}${r.item.totalEpisodes ? `/${r.item.totalEpisodes}` : ''}`}
                      </td>
                      <td className="num">{r.rating ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function toEntry(r) {
  const t = r.item;
  const done = r.status === 'completed';
  const isMovie = t.mediaType === 'movie';
  let episodes = isMovie ? null : r.episodes ?? 0;
  if (!isMovie && done && t.totalEpisodes) episodes = t.totalEpisodes;
  return {
    ...snapshotFromTitle(t),
    category: t.category,
    status: r.status,
    episodes_watched: episodes,
    movie_progress_pct: isMovie ? (done ? 100 : 0) : null,
    rating: r.rating ? Math.min(10, Number(r.rating)) : null,
    notes: r.notes || null,
  };
}

function parseLine(line) {
  // "Title", "Title | completed", "Title | watching | 12" (also accepts commas or tabs as separators)
  const parts = line.split(/\s*[|\t]\s*/);
  const name = parts[0].replace(/^\d+[.)]\s*/, '').trim();
  let status = 'completed';
  let explicit = false;
  let episodes = null;
  for (const p of parts.slice(1)) {
    const lower = p.toLowerCase().trim();
    if (STATUS_WORDS[lower]) {
      status = STATUS_WORDS[lower];
      explicit = true;
    }
    else if (/^\d+$/.test(lower)) episodes = parseInt(lower, 10);
  }
  // A bare episode count with no status means you're part-way through.
  if (episodes && !explicit) status = 'watching';
  return { name, status, episodes };
}

async function readMalFile(file) {
  let text;
  if (/\.gz$/i.test(file.name)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .gz files. Unzip it first, then choose the .xml file.');
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = await file.text();
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const nodes = [...doc.getElementsByTagName('anime')];
  if (!nodes.length) throw new Error('No anime found in that file. Use the export from myanimelist.net/panel.php?go=export.');
  const get = (n, tag) => n.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  return nodes.map((n) => ({
    malId: parseInt(get(n, 'series_animedb_id'), 10) || null,
    title: get(n, 'series_title'),
    episodes: parseInt(get(n, 'my_watched_episodes'), 10) || 0,
    score: parseInt(get(n, 'my_score'), 10) || null,
    status: MAL_STATUS[get(n, 'my_status').toLowerCase()] || 'plan',
  }));
}

function MalForm({ busy, onFile }) {
  return (
    <div className="stack">
      <h2>From MyAnimeList</h2>
      <ol className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>On myanimelist.net, go to your profile menu → Settings → Export (or open myanimelist.net/panel.php?go=export).</li>
        <li>Choose &quot;Anime List&quot; and download the file. It ends in .xml.gz.</li>
        <li>Pick that file below. You can choose the .gz file directly.</li>
      </ol>
      <input id="mal-file" type="file" accept=".xml,.gz,application/xml,application/gzip" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

function AnilistForm({ busy, onSubmit }) {
  const [user, setUser] = useState('');
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(user); }}>
      <h2>From AniList</h2>
      <p className="muted small">Your AniList profile needs to be public for this to work.</p>
      <div className="row">
        <input id="anilist-user" className="input" style={{ flex: '1 1 200px' }} placeholder="AniList username" value={user} onChange={(e) => setUser(e.target.value)} />
        <button className="btn primary" disabled={busy || !user.trim()}>Load list</button>
      </div>
    </form>
  );
}

function TextForm({ busy, onSubmit }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('anime');
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(text, kind); }}>
      <h2>Paste titles</h2>
      <p className="muted small">
        One title per line. Add a status or episode count after a <span className="mono">|</span> if you like:
        <br />
        <span className="mono">Naruto Shippuden | completed</span> · <span className="mono">Jujutsu Kaisen | watching | 14</span> ·{' '}
        <span className="mono">Frieren | plan</span>. Lines without a status are saved as Completed.
      </p>
      <div className="seg">
        <button type="button" className={kind === 'anime' ? 'on' : ''} onClick={() => setKind('anime')}>These are anime</button>
        <button type="button" className={kind === 'other' ? 'on' : ''} onClick={() => setKind('other')}>Movies, series or dramas</button>
      </div>
      <textarea id="titles" className="textarea mono" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Death Note\nAttack on Titan | completed\nOne Piece | watching | 1100'} />
      <div className="row">
        <button className="btn primary" disabled={busy || !text.trim()}>Find these titles</button>
        <span className="small muted">Anime lookups take about a second each.</span>
      </div>
    </form>
  );
}

