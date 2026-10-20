'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { feedbackInbox, setFeedbackStatus } from '@/lib/social4';
import { useProfile } from '@/lib/store';
import { displayName } from '@/lib/social';
import { toast } from '@/lib/toast';

const STATUSES = [
  ['new', 'New'],
  ['seen', 'Read'],
  ['planned', 'Planned'],
  ['done', 'Done'],
];
const KIND = { bug: 'Bug', idea: 'Feature', other: 'Other' };

export default function FeedbackInbox() {
  const profile = useProfile();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('open');

  useEffect(() => {
    if (!profile?.is_admin) return;
    feedbackInbox().then(setRows).catch((e) => setError(e.message));
  }, [profile?.is_admin]);

  if (profile && !profile.is_admin)
    return (
      <div className="empty">
        <p className="lede">This inbox is only for the site owner.</p>
        <Link className="btn" href="/feedback">
          Send feedback instead
        </Link>
      </div>
    );

  async function move(f, s) {
    setRows((r) => r.map((x) => (x.id === f.id ? { ...x, status: s } : x)));
    try {
      await setFeedbackStatus(f.id, s);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }

  const shown = (rows || []).filter((f) => (kind === 'all' || f.kind === kind) && (status === 'all' ? true : status === 'open' ? f.status !== 'done' : f.status === status));
  const count = (s) => (rows || []).filter((f) => f.status === s).length;

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Feedback inbox</h1>
          <p className="muted">{rows ? `${count('new')} new · ${count('planned')} planned · ${count('done')} done` : 'Loading…'}</p>
        </div>
      </header>
      <div className="toolbar">
        <div className="chips">
          {[['all', 'Everything'], ['bug', 'Bugs'], ['idea', 'Features'], ['other', 'Other']].map(([v, l]) => (
            <button key={v} className={`chip ${kind === v ? 'on' : ''}`} onClick={() => setKind(v)}>
              {l}
            </button>
          ))}
        </div>
        <select id="fb-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Not done yet</option>
          <option value="all">All</option>
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="notice error">{error}</p>}
      {rows && !shown.length && <p className="muted">Nothing here.</p>}
      <div className="stack">
        {shown.map((f) => (
          <article key={f.id} className="panel stack-sm" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="row">
                <span className={`pill kind-${f.kind}`}>{KIND[f.kind]}</span>
                <b>{f.profile ? displayName(f.profile) : 'Someone'}</b>
                <span className="muted small">{new Date(f.created_at).toLocaleString()}</span>
              </span>
              <select className="select inline" value={f.status} onChange={(e) => move(f, e.target.value)} aria-label="Status">
                {STATUSES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <p className="pre-wrap">{f.message}</p>
            <p className="muted small">{[f.page && `Page: ${f.page}`, f.contact && `Contact: ${f.contact}`, f.device].filter(Boolean).join(' · ')}</p>
          </article>
        ))}
      </div>
    </>
  );
}
