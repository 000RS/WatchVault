'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { extractFromText, readFile } from '@/lib/extract';
import { anilistUserList } from '@/lib/catalog';
import { CATEGORY_SHORT, STATUSES, STATUS_LABEL } from '@/lib/categories';
import { keyOfTitle, progressFor, snapshotFromTitle } from '@/lib/list';
import { saveEntries, useEntries } from '@/lib/store';
import Poster from '@/components/Poster';
import { toast } from '@/lib/toast';

const KINDS = [
  { id: 'any', label: 'A mix' },
  { id: 'anime', label: 'Anime' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'Series & dramas' },
];
const SURE = 0.85;
const MAYBE = 0.55;
const CHUNK = 40;

export default function ImportPage() {
  const { lookup } = useEntries();
  const [stage, setStage] = useState('input');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [kind, setKind] = useState('any');
  const [aniUser, setAniUser] = useState('');
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState([]); // { line, best, confidence, alternatives, include, status }
  const [leftover, setLeftover] = useState('');
  const [defaultStatus, setDefaultStatus] = useState('completed');
  const [skipExisting, setSkipExisting] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);

  async function collect() {
    const lines = [];
    for (const f of files) {
      try {
        lines.push(...(await readFile(f)));
      } catch (e) {
        throw new Error(`${f.name}: ${e.message}`);
      }
    }
    if (text.trim()) lines.push(...extractFromText(text));
    if (aniUser.trim()) {
      const list = await anilistUserList(aniUser.trim());
      if (!list.length) throw new Error('That AniList profile has no anime, or it is private.');
      lines.push(
        ...list.map((r, i) => ({ id: `ani${i}`, raw: r.ani.title, q: r.ani.names[0] || r.ani.title, year: r.ani.year, kind: 'anime', status: r.status, episodes: r.episodes || null, rating: r.rating }))
      );
    }
    return lines;
  }

  async function match(lines) {
    setStage('matching');
    setProgress({ done: 0, total: lines.length });
    const out = new Map();
    const chunks = [];
    for (let i = 0; i < lines.length; i += CHUNK) chunks.push(lines.slice(i, i + CHUNK));
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        let data = null;
        for (let attempt = 0; attempt < 2 && !data; attempt++) {
          try {
            const res = await fetch('/api/match', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: chunk.map((l) => ({ id: l.id, q: l.q, year: l.year, kind: l.kind || kind })) }),
            });
            data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Matching failed.');
          } catch (e) {
            if (attempt === 1) throw e;
          }
        }
        for (const r of data.results || []) out.set(r.id, r);
        setProgress((p) => ({ ...p, done: Math.min(p.total, p.done + chunk.length) }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
    return lines.map((line) => {
      const r = out.get(line.id) || {};
      return { line, best: r.best || null, confidence: r.confidence || 0, alternatives: r.alternatives || [], include: Boolean(r.best && r.confidence >= SURE), status: line.status || null };
    });
  }

  async function start() {
    setError(null);
    try {
      const lines = await collect();
      if (!lines.length) throw new Error('No titles found. Add a file, paste some titles, or enter an AniList username.');
      const matched = await match(lines);
      setRows(matched);
      setLeftover(matched.filter((r) => !r.best || r.confidence < MAYBE).map((r) => r.line.raw).join('\n'));
      setStage('review');
    } catch (e) {
      setError(e.message);
      setStage('input');
    }
  }

  async function retryLeftover() {
    setError(null);
    const lines = extractFromText(leftover);
    if (!lines.length) return;
    const keep = rows.filter((r) => r.best && r.confidence >= MAYBE);
    try {
      const again = await match(lines);
      const all = keep.concat(again);
      setRows(all);
      setLeftover(again.filter((r) => !r.best || r.confidence < MAYBE).map((r) => r.line.raw).join('\n'));
    } catch (e) {
      setError(e.message);
    }
    setStage('review');
  }

  const groups = useMemo(() => {
    const sure = [];
    const check = [];
    const seen = new Set();
    for (const r of rows) {
      if (!r.best || r.confidence < MAYBE) continue;
      const k = keyOfTitle(r.best);
      if (seen.has(k)) continue; // same title listed twice
      seen.add(k);
      (r.confidence >= SURE ? sure : check).push(r);
    }
    return { sure, check };
  }, [rows]);

  const chosen = [...groups.sure, ...groups.check].filter((r) => r.include && !(skipExisting && lookup(r.best)));

  function update(row, patch) {
    setRows((rs) => rs.map((r) => (r === row ? { ...r, ...patch } : r)));
  }

  async function doImport() {
    const toRows = chosen.map((r) => {
      const t = r.best;
      const status = r.status || r.line.status || defaultStatus;
      const { episodes, seasons, season, episode, pct } = r.line;
      return {
        ...snapshotFromTitle(t),
        category: t.category,
        ...progressFor(t, { status, episodes, seasons, season, episode, pct }),
        rating: r.line.rating ? Math.min(10, Number(r.line.rating)) : null,
      };
    });
    setStage('saving');
    try {
      const saved = await saveEntries(toRows);
      setResult({ count: saved.length, notFound: leftover.split('\n').filter((l) => l.trim()).length });
      setStage('done');
    } catch (e) {
      toast(e.message, { kind: 'error' });
      setStage('review');
    }
  }

  /* ---------------- Screens ---------------- */

  if (stage === 'matching' || stage === 'saving') {
    const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
    return (
      <div className="center-page">
        <div className="card narrow" style={{ width: '100%' }}>
          <h1 className="h-section">{stage === 'saving' ? 'Adding to your list…' : `Matching ${progress.total} titles…`}</h1>
          <div className="progressbar">
            <i style={{ width: `${stage === 'saving' ? 100 : pct}%` }} />
          </div>
          <p className="muted small">{stage === 'saving' ? 'Almost done.' : `${progress.done} of ${progress.total} checked`}</p>
        </div>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="empty">
        <h1 className="h-page">{result.count} titles added</h1>
        {result.notFound > 0 && <p className="lede">{result.notFound} lines weren&apos;t matched. You can add those from Search.</p>}
        <div className="row">
          <Link href="/list" className="btn primary">
            Open My List
          </Link>
          <button
            className="btn"
            onClick={() => {
              setStage('input');
              setRows([]);
              setFiles([]);
              setText('');
              setAniUser('');
            }}
          >
            Import more
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'review') {
    const notFound = leftover.split('\n').filter((l) => l.trim()).length;
    const sureShown = showAll ? groups.sure : groups.sure.slice(0, 40);
    return (
      <>
        <header className="page-head">
          <div className="head-text">
            <h1 className="h-page">Check your import</h1>
            <p className="lede">
              Found {groups.sure.length + groups.check.length} titles.
              {groups.check.length ? ` ${groups.check.length} need a quick look.` : ''}
              {notFound ? ` ${notFound} couldn't be found.` : ''}
            </p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setStage('input')}>
              Back
            </button>
            <button className="btn primary" disabled={!chosen.length} onClick={doImport}>
              Add {chosen.length} {chosen.length === 1 ? 'title' : 'titles'}
            </button>
          </div>
        </header>

        <div className="group">
          <div className="group-row">
            <div>
              <b>Lines without a status</b>
              <span className="muted small">Used when your list didn&apos;t say.</span>
            </div>
            <select id="default-status" className="select inline" value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="group-row">
            <b>Skip titles already in my list</b>
            <span className="toggle">
              <input id="skip-existing" type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} aria-label="Skip titles already in my list" />
              <span />
            </span>
          </div>
        </div>

        {notFound > 0 && (
          <section className="section">
            <div className="stack-sm">
              <h2 className="h-section">Not found</h2>
              <p className="muted">Only the lines we couldn&apos;t match are left here. Fix the spelling, add the year, or delete lines you don&apos;t need, then search again.</p>
            </div>
            <textarea id="leftover" className="textarea" style={{ minHeight: 140 }} value={leftover} onChange={(e) => setLeftover(e.target.value)} />
            <div className="row">
              <button className="btn" onClick={retryLeftover} disabled={!leftover.trim()}>
                Search these again
              </button>
            </div>
          </section>
        )}

        {groups.check.length > 0 && (
          <section className="section">
            <h2 className="h-section">Is this the one?</h2>
            <div className="review">
              {groups.check.map((r) => (
                <ReviewRow key={r.line.id} r={r} lookup={lookup} skipExisting={skipExisting} defaultStatus={defaultStatus} onChange={(p) => update(r, p)} ask />
              ))}
            </div>
          </section>
        )}

        {groups.sure.length > 0 && (
          <section className="section">
            <div className="spread">
              <h2 className="h-section">Matched</h2>
              <select
                className="select inline"
                aria-label="Set status for every matched title"
                value=""
                onChange={(e) => e.target.value && setRows((rs) => rs.map((r) => (groups.sure.includes(r) ? { ...r, status: e.target.value } : r)))}
              >
                <option value="">Set status for all</option>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="review">
              {sureShown.map((r) => (
                <ReviewRow key={r.line.id} r={r} lookup={lookup} skipExisting={skipExisting} defaultStatus={defaultStatus} onChange={(p) => update(r, p)} />
              ))}
            </div>
            {!showAll && groups.sure.length > 40 && (
              <button className="btn" onClick={() => setShowAll(true)}>
                Show all {groups.sure.length}
              </button>
            )}
          </section>
        )}
      </>
    );
  }

  // Input
  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Import</h1>
          <p className="lede">Bring in any list you keep. Titles are matched in seconds, typos included, and you check everything before it is added.</p>
        </div>
      </header>

      {error && <p className="notice error">{error}</p>}

      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          setFiles((f) => [...f, ...e.dataTransfer.files]);
        }}
      >
        <h2 className="h-section">Drop files here</h2>
        <p className="muted small">Excel, CSV, Word (.docx), text, Letterboxd or IMDb exports, MyAnimeList export</p>
        <input
          ref={fileInput}
          id="files"
          type="file"
          multiple
          hidden
          accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.md,.rtf,.docx,.xml,.gz,.json"
          onChange={(e) => setFiles((f) => [...f, ...e.target.files])}
        />
        <button className="btn" onClick={() => fileInput.current?.click()}>
          Choose files
        </button>
        {files.length > 0 && (
          <div className="chips wrap">
            {files.map((f, i) => (
              <button key={i} className="chip" onClick={() => setFiles(files.filter((_, j) => j !== i))} title="Remove">
                {f.name} ×
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="field">
        <span>Or paste titles, in any format</span>
        <textarea
          id="paste"
          className="textarea"
          style={{ minHeight: 200 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Completed:\nBreaking Bad\nAttack on Titan S4\n\nDropped:\nOne Piece ep 750\nInception (2010) - half'}
        />
      </label>
      <p className="hint">Headings like &quot;Completed&quot;, &quot;Dropped&quot; or &quot;Movies&quot; apply to the lines under them. You can add a year, &quot;S2&quot;, &quot;ep 12&quot;, &quot;half&quot; or a rating like 9/10 anywhere on a line.</p>

      <div className="toolbar">
        <label className="field" style={{ flex: '1 1 200px' }}>
          <span>What&apos;s in this list?</span>
          <select id="kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}>
          <span>AniList username (optional)</span>
          <input id="anilist-user" className="input" value={aniUser} onChange={(e) => setAniUser(e.target.value)} placeholder="Public profiles only" />
        </label>
      </div>

      <div className="row">
        <button className="btn primary" onClick={start} disabled={!files.length && !text.trim() && !aniUser.trim()}>
          Find my titles
        </button>
        <span className="muted small">PDF or photo? Copy the text out and paste it here.</span>
      </div>
    </>
  );
}

function ReviewRow({ r, lookup, skipExisting, defaultStatus, onChange, ask = false }) {
  const t = r.best;
  const exists = Boolean(lookup(t));
  const off = !r.include || (skipExisting && exists);
  const status = r.status || r.line.status || defaultStatus;
  const extras = [r.line.season ? `S${r.line.season} E${r.line.episode || 0}` : null, r.line.seasons ? `${r.line.seasons} seasons` : null, r.line.episodes ? `${r.line.episodes} eps` : null, r.line.pct != null && r.line.pct < 100 ? `${r.line.pct}%` : null]
    .filter(Boolean)
    .join(', ');
  return (
    <div className={`review-row ${off ? 'off' : ''}`}>
      <input id={`inc-${r.line.id}`} type="checkbox" checked={r.include} onChange={(e) => onChange({ include: e.target.checked })} aria-label={`Include ${t.title}`} />
      <Poster src={t.poster} title={t.title} />
      <div style={{ minWidth: 0 }}>
        <b>{t.title}</b>{' '}
        <span className="muted small">{[t.year, CATEGORY_SHORT[t.category]].filter(Boolean).join(', ')}</span>
        <div className="review-from">
          From your list: {r.line.raw}
          {exists ? ' (already in your list)' : ''}
        </div>
        {ask && r.alternatives.length > 0 && (
          <div className="alts">
            {r.alternatives.map((a) => (
              <button
                key={`${a.mediaType}${a.sourceId}`}
                className="chip"
                onClick={() => onChange({ best: a, alternatives: [t, ...r.alternatives.filter((x) => x !== a)], include: true })}
              >
                {a.title}
                {a.year ? ` (${a.year})` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="review-controls">
        {extras && <span className="muted small">{extras}</span>}
        <select className="select" value={status} onChange={(e) => onChange({ status: e.target.value })} aria-label={`Status for ${t.title}`}>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {STATUS_LABEL[s.id]}
            </option>
          ))}
        </select>
        {ask && !r.include && (
          <button className="btn sm" onClick={() => onChange({ include: true })}>
            Yes, this one
          </button>
        )}
      </div>
    </div>
  );
}
