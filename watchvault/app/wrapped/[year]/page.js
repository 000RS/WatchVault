'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEntries } from '@/lib/store';
import { diaryForYear, yearSummary } from '@/lib/yearly';
import { CATEGORY_LABEL } from '@/lib/categories';
import { computeStats } from '@/lib/stats';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const region = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
  } catch {
    return code;
  }
};
const tmdbImg = (p) => (p ? `https://image.tmdb.org/t/p/w185${p}` : null);

export default function WrappedPage() {
  const { year: y } = useParams();
  const router = useRouter();
  const year = Number(y) || new Date().getFullYear();
  const { entries, profile } = useEntries();
  const [rows, setRows] = useState(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    diaryForYear(year).then(setRows);
  }, [year]);
  const s = useMemo(() => (entries && rows ? yearSummary(entries, rows, year) : null), [entries, rows, year]);
  const now = new Date();
  const partial = year === now.getFullYear() && now.getMonth() < 11;
  const slides = useMemo(() => (s ? buildSlides(s, { year, partial, name: profile?.display_name || profile?.username }) : []), [s, year, partial, profile]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setI((x) => Math.min(x + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
      if (e.key === 'Escape') router.push('/stats');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [slides.length, router]);

  if (!s) return <div className="skeleton" style={{ height: 480, aspectRatio: 'auto' }} />;
  if (!s.titlesTouched)
    return (
      <div className="empty">
        <h1 className="h-page">Nothing for {year} yet</h1>
        <p className="lede">Wrapped is built from what you watched during the year: episodes you tick, titles you finish and watch dates.</p>
        <p className="muted">Mark things as “Watched today”, tick episodes in Up next, or add watch dates to titles in your list.</p>
        <div className="row">
          <Link href="/" className="btn primary">
            Go to Home
          </Link>
          {year === now.getFullYear() && (
            <Link href={`/wrapped/${year - 1}`} className="btn">
              See {year - 1}
            </Link>
          )}
        </div>
      </div>
    );

  const slide = slides[i];
  return (
    <div className="wrapped">
      <div className="wrapped-bars" aria-hidden="true">
        {slides.map((_, k) => (
          <i key={k} className={k < i ? 'done' : k === i ? 'now' : ''} />
        ))}
      </div>
      <div className="wrapped-top">
        <span className="kicker">
          {year} Wrapped{partial ? ' · so far' : ''}
        </span>
        <Link href="/stats" className="icon-btn" aria-label="Close">
          <Icon.Close width={16} height={16} />
        </Link>
      </div>
      <div className={`wrapped-slide tone-${slide.tone || 1}`} key={i}>
        {slide.render()}
      </div>
      <div className="wrapped-nav">
        <button className="btn" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous">
          <Icon.Back width={16} height={16} />
        </button>
        <span className="muted small">
          {i + 1} / {slides.length}
        </span>
        {i < slides.length - 1 ? (
          <button className="btn primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <button className="btn primary" onClick={() => shareCard(s, { year, partial, name: profile?.display_name || profile?.username })}>
            <Icon.Share width={16} height={16} /> Share
          </button>
        )}
      </div>
      <button className="wrapped-tap left" aria-label="Previous" onClick={() => setI(Math.max(0, i - 1))} />
      <button className="wrapped-tap right" aria-label="Next" onClick={() => setI(Math.min(slides.length - 1, i + 1))} />
    </div>
  );
}

function Big({ children }) {
  return <p className="wrapped-big">{children}</p>;
}

function buildSlides(s, { year, partial, name }) {
  const out = [];
  const topTitle = s.titles[0]?.entry;
  const persona = computeStats(s.titles.map((t) => t.entry)).personality;
  out.push({
    tone: 1,
    render: () => (
      <>
        <p className="wrapped-kicker">{name ? `${name}, ` : ''}this was your</p>
        <Big>{year}</Big>
        <p className="wrapped-line">{partial ? `on screen so far. ${MONTHS[new Date().getMonth()]} isn’t over, but here’s the story.` : 'on screen. Let’s look back.'}</p>
      </>
    ),
  });
  out.push({
    tone: 2,
    render: () => (
      <>
        <p className="wrapped-kicker">You spent about</p>
        <Big>{s.hours.toLocaleString()} hours</Big>
        <p className="wrapped-line">
          watching{s.hours >= 24 ? `. That’s ${(s.hours / 24).toFixed(1)} whole days` : ''}, across {s.activeDays} different days.
        </p>
      </>
    ),
  });
  out.push({
    tone: 3,
    render: () => (
      <>
        <p className="wrapped-kicker">You finished</p>
        <Big>{s.finished} titles</Big>
        <p className="wrapped-line">
          and got through {s.episodes.toLocaleString()} episodes{s.rewatches ? `, plus ${s.rewatches} rewatch${s.rewatches > 1 ? 'es' : ''} of old favourites` : ''}.
        </p>
      </>
    ),
  });
  if (s.titles.length >= 3)
    out.push({
      tone: 1,
      render: () => (
        <>
          <p className="wrapped-kicker">What you couldn’t stop watching</p>
          <ol className="wrapped-list">
            {s.titles.slice(0, 5).map((t, k) => (
              <li key={t.entry.id}>
                <span className="n">{k + 1}</span>
                {t.entry.poster_url && <img src={t.entry.poster_url} alt="" />}
                <span>
                  <b>{t.entry.title}</b>
                  <span className="muted small">{Math.round(t.minutes / 60)} h</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      ),
    });
  if (s.genres.length)
    out.push({
      tone: 2,
      render: () => (
        <>
          <p className="wrapped-kicker">Your genre of the year</p>
          <Big>{s.genres[0][0]}</Big>
          {s.genres.length > 2 && <p className="wrapped-line">followed by {s.genres.slice(1, 3).map((g) => g[0].toLowerCase()).join(' and ')}.</p>}
        </>
      ),
    });
  const actor = s.actors[0];
  const actress = s.actresses[0];
  if (actor || actress)
    out.push({
      tone: 3,
      render: () => (
        <>
          <p className="wrapped-kicker">The faces of your year</p>
          <div className="wrapped-people">
            {[actor && ['Actor', actor], actress && ['Actress', actress]].filter(Boolean).map(([role, p]) => (
              <div key={role} className="wrapped-person">
                <span className="cast-photo">{p.photo ? <img src={tmdbImg(p.photo)} alt="" /> : <span>{p.name[0]}</span>}</span>
                <b>{p.name}</b>
                <span className="muted small">
                  {role} · {p.titles.length} titles
                </span>
              </div>
            ))}
          </div>
        </>
      ),
    });
  if (s.directors[0] && s.directors[0].titles.length > 1)
    out.push({
      tone: 1,
      render: () => (
        <>
          <p className="wrapped-kicker">The storyteller you trusted most</p>
          <Big>{s.directors[0].name}</Big>
          <p className="wrapped-line">{s.directors[0].titles.slice(0, 3).map((t) => t.title).join(', ')}.</p>
        </>
      ),
    });
  if (s.countries.length > 1 || s.languages.length > 1)
    out.push({
      tone: 2,
      render: () => (
        <>
          <p className="wrapped-kicker">Without leaving the couch you visited</p>
          <Big>{s.countries.length} countries</Big>
          <p className="wrapped-line">
            in {s.languages.length} language{s.languages.length === 1 ? '' : 's'}. Most of all: {s.countries.slice(0, 3).map(([c]) => region(c)).join(', ')}.
          </p>
        </>
      ),
    });
  const busiest = [...s.months].map((m, k) => ({ ...m, k })).sort((a, b) => b.minutes - a.minutes)[0];
  if (busiest?.minutes)
    out.push({
      tone: 3,
      render: () => (
        <>
          <p className="wrapped-kicker">Your biggest month was</p>
          <Big>{MONTHS[busiest.k]}</Big>
          <p className="wrapped-line">
            {Math.round(busiest.minutes / 60)} hours.{s.bingeDay ? ` Your biggest single day: ${new Date(`${s.bingeDay.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}, ${Math.round(s.bingeDay.minutes / 60)} hours.` : ''}
            {s.streak.best > 2 ? ` Longest streak: ${s.streak.best} days in a row.` : ''}
          </p>
        </>
      ),
    });
  if (s.topRated[0])
    out.push({
      tone: 1,
      render: () => (
        <>
          <p className="wrapped-kicker">Your highest rated of the year</p>
          <div className="wrapped-hero">
            {s.topRated[0].poster_url && <img src={s.topRated[0].poster_url} alt="" />}
            <div>
              <Big>{s.topRated[0].title}</Big>
              <p className="wrapped-line">
                {s.topRated[0].rating}/10 · {CATEGORY_LABEL[s.topRated[0].category]}
              </p>
            </div>
          </div>
        </>
      ),
    });
  out.push({
    tone: 2,
    render: () => (
      <>
        <p className="wrapped-kicker">Your {year} viewer personality</p>
        <Big>{persona.name}</Big>
        <p className="wrapped-line">{persona.blurb}</p>
      </>
    ),
  });
  out.push({
    tone: 3,
    render: () => (
      <div className="wrapped-summary">
        <p className="wrapped-kicker">{year}{partial ? ' so far' : ''} in one card</p>
        <div className="wrapped-grid">
          <span>
            <b>{s.hours.toLocaleString()}</b> hours
          </span>
          <span>
            <b>{s.finished}</b> finished
          </span>
          <span>
            <b>{s.episodes.toLocaleString()}</b> episodes
          </span>
          <span>
            <b>{s.countries.length}</b> countries
          </span>
        </div>
        {topTitle && (
          <p className="wrapped-line">
            Most watched: <b>{topTitle.title}</b>
            {s.genres[0] ? ` · Top genre: ${s.genres[0][0]}` : ''}
          </p>
        )}
        <p className="muted small">Tap Share to save this as an image.</p>
      </div>
    ),
  });
  return out;
}

/* A shareable image drawn on a canvas (no extra libraries, nothing uploaded). */
async function shareCard(s, { year, partial, name }) {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a1418');
  g.addColorStop(0.55, '#141215');
  g.addColorStop(1, '#0e0d0f');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const load = (src) =>
    new Promise((res) => {
      if (!src) return res(null);
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  const font = (w, px) => `${w} ${px}px Manrope, system-ui, sans-serif`;
  x.fillStyle = '#e2858d';
  x.font = font(700, 34);
  x.fillText(`WATCHVAULT · ${year} WRAPPED${partial ? ' SO FAR' : ''}`.toUpperCase(), 80, 150);
  x.fillStyle = '#f1ece8';
  x.font = `400 104px "DM Serif Display", Georgia, serif`;
  x.fillText(name ? `${name}’s year` : `My ${year}`, 80, 290);
  const stats = [
    [s.hours.toLocaleString(), 'hours'],
    [String(s.finished), 'titles finished'],
    [s.episodes.toLocaleString(), 'episodes'],
    [String(s.countries.length), 'countries'],
  ];
  stats.forEach(([v, l], k) => {
    const cx = 80 + (k % 2) * 480;
    const cy = 440 + Math.floor(k / 2) * 190;
    x.fillStyle = '#f1ece8';
    x.font = font(800, 96);
    x.fillText(v, cx, cy);
    x.fillStyle = '#a0968f';
    x.font = font(600, 34);
    x.fillText(l, cx, cy + 52);
  });
  x.fillStyle = '#e2858d';
  x.font = font(700, 32);
  x.fillText('MOST WATCHED', 80, 900);
  const top = s.titles.slice(0, 5);
  const imgs = await Promise.all(top.map((t) => load(t.entry.poster_url)));
  top.forEach((t, k) => {
    const y0 = 950 + k * 150;
    const im = imgs[k];
    if (im) {
      try {
        x.drawImage(im, 80, y0, 88, 132);
      } catch {
        /* skip */
      }
    }
    x.fillStyle = '#a0968f';
    x.font = font(700, 40);
    x.fillText(String(k + 1), im ? 196 : 80, y0 + 78);
    x.fillStyle = '#f1ece8';
    x.font = font(700, 44);
    const title = t.entry.title.length > 30 ? `${t.entry.title.slice(0, 29)}…` : t.entry.title;
    x.fillText(title, im ? 250 : 130, y0 + 78);
  });
  x.fillStyle = '#d6cfc9';
  x.font = font(600, 38);
  if (s.genres[0]) x.fillText(`Top genre: ${s.genres[0][0]}`, 80, 1760);
  x.fillStyle = '#7d2430';
  x.fillRect(80, 1800, 920, 4);

  let blob;
  try {
    blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  } catch {
    blob = null;
  }
  if (!blob) return toast("Couldn't make the image on this device.", { kind: 'error' });
  const file = new File([blob], `watchvault-wrapped-${year}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `My ${year} on WatchVault` });
      return;
    } catch {
      /* cancelled: fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}
