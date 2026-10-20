'use client';

import { useEffect, useState } from 'react';
import { myFeedback, sendFeedback } from '@/lib/social4';
import { toast } from '@/lib/toast';

const KINDS = [
  { id: 'bug', label: 'Something’s broken', hint: 'What did you tap, what happened, and what did you expect?' },
  { id: 'idea', label: 'I want a feature', hint: 'Describe the feature and how you’d use it.' },
  { id: 'other', label: 'Something else', hint: 'Anything you’d like to say.' },
];
const STATUS = { new: 'Sent', seen: 'Read', planned: 'Planned', done: 'Done' };

export default function FeedbackPage() {
  const [kind, setKind] = useState('idea');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(null);

  const load = () => myFeedback().then(setMine).catch(() => setMine([]));
  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await sendFeedback({ kind, message, contact, page: document.referrer ? new URL(document.referrer).pathname : null });
      setMessage('');
      toast('Sent. Thank you!');
      load();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const k = KINDS.find((x) => x.id === kind);
  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Feedback</h1>
          <p className="muted">Found a bug or want something added? It goes straight to the person who builds WatchVault.</p>
        </div>
      </header>

      <form className="panel stack" style={{ padding: 22 }} onSubmit={submit}>
        <div className="seg" role="radiogroup" aria-label="Type">
          {KINDS.map((x) => (
            <button type="button" key={x.id} role="radio" aria-checked={kind === x.id} className={`seg-btn ${kind === x.id ? 'on' : ''}`} onClick={() => setKind(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>{k.hint}</span>
          <textarea id="fb-message" className="textarea" style={{ minHeight: 150 }} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} required />
        </label>
        <label className="field">
          <span>How can we reach you? (optional)</span>
          <input id="fb-contact" className="input" placeholder="Email, Instagram, anything" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
        </label>
        <div className="row">
          <button className="btn primary" disabled={busy || !message.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
          <span className="hint">Your username and device type are included so problems can be reproduced.</span>
        </div>
      </form>

      {mine?.length > 0 && (
        <section className="section">
          <h2 className="h-section">What you&apos;ve sent</h2>
          <div className="group">
            {mine.map((f) => (
              <div key={f.id} className="group-row" style={{ alignItems: 'flex-start' }}>
                <span className="stack-sm" style={{ minWidth: 0 }}>
                  <b>{KINDS.find((x) => x.id === f.kind)?.label}</b>
                  <span className="muted small pre-wrap">{f.message}</span>
                </span>
                <span className={`pill fb-${f.status}`}>{STATUS[f.status]}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
