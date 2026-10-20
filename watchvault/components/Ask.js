'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getStoreEntries, useProfile, viewMemory } from '@/lib/store';
import { STATUS_LABEL } from '@/lib/categories';
import { TitleTile } from './Tiles';

let enabled = null;
let probe = null;

/** Whether the free AI guide is set up on this site (GEMINI_API_KEY present). */
export function useAiEnabled() {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    if (enabled !== null) return;
    probe ||= fetch('/api/ai')
      .then((r) => r.json())
      .then((d) => (enabled = Boolean(d.enabled)))
      .catch(() => (enabled = false));
    probe.then(setOn);
  }, []);
  return Boolean(on);
}

export async function askGuide(payload) {
  const { data } = (await getSupabase()?.auth.getSession()) || { data: {} };
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(data?.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'The guide is unavailable right now.');
  return d;
}

/** Your list as short lines the guide can read. */
function listSummary() {
  return getStoreEntries()
    .slice(0, 400)
    .map((e) => `${e.title}${e.year ? ` (${e.year})` : ''} – ${STATUS_LABEL[e.status] || e.status}${e.rating != null ? `, ${Number(e.rating)}/10` : ''}`)
    .join('\n');
}

const SUGGESTIONS = [
  "I've got 90 minutes. Pick me one film for tonight",
  'Something light I can have on while I eat',
  'Surprise me with something on my streaming services',
  'Something like what I rate highest, but from a country I rarely watch',
  "How should I watch Star Wars? I've never seen any",
  'A short series I can finish this weekend',
  'I want to cry. A drama that will wreck me',
];

/** A chat with the guide. Picks appear as cards you can tick straight away. */
export default function AskPanel({ starter = '' }) {
  const profile = useProfile();
  const memKey = `ask:${starter || 'main'}`;
  const [messages, setMessages] = useState(() => viewMemory.get(memKey) || []);
  const [text, setText] = useState(starter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const end = useRef(null);
  const services = useRef([]);
  useEffect(() => {
    if (!profile?.services?.length) return;
    import('@/lib/catalog').then(({ streamingServices }) =>
      Promise.all([streamingServices('movie'), streamingServices('tv')])
        .then(([a, b]) => (services.current = [...new Set([...a, ...b].filter((x) => profile.services.includes(x.id)).map((x) => x.name))]))
        .catch(() => {})
    );
  }, [profile?.services]);

  useEffect(() => {
    viewMemory.set(memKey, messages);
    if (messages.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, memKey]);

  async function send(e, preset) {
    e?.preventDefault();
    const msg = (preset ?? text).trim();
    if (!msg || busy) return;
    const next = [...messages, { role: 'user', text: msg }];
    setMessages(next);
    setText('');
    setBusy(true);
    setError(null);
    try {
      const d = await askGuide({ messages: next.map(({ role, text }) => ({ role, text })), list: listSummary(), hidden: profile?.hidden_categories || [], services: services.current });
      setMessages([...next, { role: 'assistant', text: d.reply, cards: d.cards || [] }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ask panel">
      {!messages.length && (
        <div className="stack-sm">
          <h2 className="h-section">Ask the guide</h2>
          <p className="muted">It knows your list, asks what you&apos;re in the mood for, and only suggests real titles you can tick right away.</p>
          {!starter && (
            <div className="chips wrap">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(null, s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ask-log">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <p>{m.text}</p>
            {m.cards?.length > 0 && (
              <div className="ask-cards">
                {m.cards.map((c, j) => (
                  <div key={`${c.mediaType}${c.sourceId}`} className="ask-card">
                    {m.cards.length > 1 && <span className="order-num">{j + 1}</span>}
                    <TitleTile item={c} />
                    {c.note && <p className="small muted">{c.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="bubble assistant typing" aria-label="The guide is thinking">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>

      {error && <p className="notice error">{error}</p>}

      <form className="ask-input" onSubmit={send}>
        <textarea
          id="ask-text"
          className="textarea"
          rows={2}
          placeholder="What are you in the mood for?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
        />
        <div className="row">
          <button className="btn primary" disabled={busy || !text.trim()}>
            Send
          </button>
          {messages.length > 0 && (
            <button type="button" className="btn ghost" onClick={() => setMessages([])}>
              Start over
            </button>
          )}
        </div>
      </form>
      <p className="hint">Powered by Google&apos;s free Gemini tier. Your list titles are sent to it to personalise answers.</p>
    </section>
  );
}
