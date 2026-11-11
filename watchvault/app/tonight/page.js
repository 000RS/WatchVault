'use client';

import { useEffect, useState } from 'react';
import { COMPANY, DOING, TIMES, kindWord, rouletteCandidates, tonightPicks } from '@/lib/tonight';
import { MOODS } from '@/components/HomeExtras';
import { useEntries, viewMemory } from '@/lib/store';
import { CATEGORY_SHORT } from '@/lib/categories';
import Poster from '@/components/Poster';
import { DetailSheet } from '@/components/Tiles';
import AskPanel, { useAiEnabled } from '@/components/Ask';

export default function TonightPage() {
  const { entries, profile } = useEntries();
  const saved = viewMemory.get('tonight') || {};
  const [o, setO] = useState({ mood: saved.mood || '', minutes: saved.minutes || 0, doing: saved.doing || 'any', company: saved.company || 'solo', cheap: saved.cheap || false, mine: saved.mine ?? true });
  const [picks, setPicks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [spin, setSpin] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const ai = useAiEnabled();

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('mood')) setO((x) => ({ ...x, mood: sp.get('mood') }));
    if (sp.get('surprise')) setTimeout(() => document.getElementById('roulette')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);
  useEffect(() => {
    viewMemory.set('tonight', o);
  }, [o]);

  async function go() {
    setBusy(true);
    try {
      setPicks(await tonightPicks({ ...o, services: o.mine ? profile?.services || [] : [] }, 6));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (entries && o.mood) go();
  }, [entries ? 1 : 0, o.mood]); // eslint-disable-line react-hooks/exhaustive-deps

  function roulette() {
    const list = rouletteCandidates(o);
    if (!list.length) return setSpin({ none: true });
    let n = 0;
    const steps = 14 + Math.floor(Math.random() * 6);
    const t = setInterval(() => {
      n++;
      setSpin({ pick: list[Math.floor(Math.random() * list.length)], rolling: n < steps });
      if (n >= steps) clearInterval(t);
    }, 70 + n * 6);
  }

  const chip = (k, v, label) => (
    <button key={String(v)} className={`chip ${o[k] === v ? 'on' : ''}`} onClick={() => setO({ ...o, [k]: o[k] === v && k === 'mood' ? '' : v })}>
      {label}
    </button>
  );
  const prompt = `Tonight I want something ${o.mood || 'good'}${o.minutes ? `, about ${o.minutes} minutes` : ''}${o.doing !== 'any' ? `, to ${DOING.find((d) => d[0] === o.doing)[1].toLowerCase()}` : ''}${o.company !== 'solo' ? `, with ${COMPANY.find((c) => c[0] === o.company)[1].toLowerCase()}` : ''}${o.cheap ? ', free or cheap' : ''}. What do you suggest?`;

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Tonight</h1>
          <p className="muted">Tell us the vibe. You get a few strong picks instead of endless scrolling: your own saved things first, then something new.</p>
        </div>
      </header>

      <section className="panel stack" style={{ padding: 20 }}>
        <div className="stack-sm">
          <span className="field-label">Mood</span>
          <div className="chips wrap">{MOODS.map(([id, label]) => chip('mood', id, label))}</div>
        </div>
        <div className="tonight-grid">
          <div className="stack-sm">
            <span className="field-label">I want to</span>
            <div className="chips wrap">{DOING.map(([id, label]) => chip('doing', id, label))}</div>
          </div>
          <div className="stack-sm">
            <span className="field-label">Time I have</span>
            <div className="chips wrap">
              {chip('minutes', 0, 'Any')}
              {TIMES.map(([m, label]) => chip('minutes', m, label))}
            </div>
          </div>
          <div className="stack-sm">
            <span className="field-label">With</span>
            <div className="chips wrap">{COMPANY.map(([id, label]) => chip('company', id, label))}</div>
          </div>
        </div>
        <div className="toolbar">
          <label className="row small">
            <span className="toggle">
              <input type="checkbox" checked={o.cheap} onChange={(e) => setO({ ...o, cheap: e.target.checked })} />
              <span />
            </span>
            Free or cheap only
          </label>
          {profile?.services?.length > 0 && (
            <label className="row small">
              <span className="toggle">
                <input type="checkbox" checked={o.mine} onChange={(e) => setO({ ...o, mine: e.target.checked })} />
                <span />
              </span>
              On my streaming services
            </label>
          )}
          <button className="btn primary" onClick={go} disabled={busy}>
            {busy ? 'Picking…' : picks ? 'Pick again' : 'Pick for me'}
          </button>
        </div>
      </section>

      {picks && (
        <section className="section">
          <h2 className="h-section">Your picks</h2>
          {!picks.length && <p className="muted">Nothing fits all of that. Loosen one choice, or save a few things first.</p>}
          <div className="pick-cards">
            {picks.map((p, idx) => (
              <button key={`${p.item.source}${p.item.sourceId}`} className={`pick-card as-button ${idx === 0 ? 'top' : ''}`} onClick={() => setOpen(p)}>
                <Poster src={p.item.poster} title={p.item.title} />
                <span className="pick-text">
                  <span className="kicker">
                    {idx === 0 ? 'Top pick · ' : ''}
                    {kindWord(p.item)}
                  </span>
                  <b>{p.item.title}</b>
                  <span className="muted small">{[p.item.year, CATEGORY_SHORT[p.item.category]].filter(Boolean).join(' · ')}</span>
                  {p.why && <span className="small why">{p.why}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section id="roulette" className="panel roulette">
        <div className="stack-sm">
          <p className="kicker">Vault roulette</p>
          <h2 className="h-section">Can&apos;t choose from what you&apos;ve saved?</h2>
          <p className="muted">Spin, and it picks one thing from your vault that fits the choices above.</p>
        </div>
        <div className={`roulette-slot ${spin?.rolling ? 'rolling' : spin?.pick ? 'landed' : ''}`}>
          {spin?.pick ? (
            <button className="as-button roulette-pick" onClick={() => !spin.rolling && setOpen(spin.pick)}>
              <Poster src={spin.pick.item.poster} title={spin.pick.item.title} size="sm" />
              <span>
                <b>{spin.pick.item.title}</b>
                {!spin.rolling && <span className="muted small">{spin.pick.why || 'From your vault'}</span>}
              </span>
            </button>
          ) : spin?.none ? (
            <span className="muted">Nothing saved fits these choices yet. Save a few things with ♥ in Swipe.</span>
          ) : (
            <span className="roulette-dice" aria-hidden="true">
              🎲
            </span>
          )}
        </div>
        <button className="btn primary" onClick={roulette} disabled={spin?.rolling}>
          {spin?.pick ? 'Spin again' : 'Spin'}
        </button>
      </section>

      {ai && (
        <section className="section">
          {!askOpen ? (
            <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setAskOpen(true)}>
              Let the guide decide, in conversation
            </button>
          ) : (
            <AskPanel starter={prompt} />
          )}
        </section>
      )}
      {open && (open.entry ? <DetailSheet entry={open.entry} open onClose={() => setOpen(null)} /> : <DetailSheet item={open.item} open onClose={() => setOpen(null)} />)}
    </>
  );
}
