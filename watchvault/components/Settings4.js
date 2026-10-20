'use client';

import { useEffect, useState } from 'react';
import { REGION, streamingServices } from '@/lib/catalog';
import { saveProfile } from '@/lib/store';
import { toast } from '@/lib/toast';
import { Icon } from './Icons';

const saveP = (patch, msg = 'Saved') =>
  saveProfile(patch)
    .then(() => toast(msg))
    .catch((e) => toast(/column|schema/i.test(e.message) ? 'This needs the version 4 database upgrade (supabase/upgrade_v4.sql).' : e.message, { kind: 'error' }));

/** Pick the services you pay for; Explore and My List can then show only what's on them. */
export function ServicesPicker({ profile }) {
  const [all, setAll] = useState(null);
  const mine = new Set(profile.services || []);
  useEffect(() => {
    Promise.all([streamingServices('movie'), streamingServices('tv')])
      .then(([a, b]) => {
        const m = new Map();
        for (const s of [...a, ...b]) if (!m.has(s.id)) m.set(s.id, s);
        setAll([...m.values()].slice(0, 36));
      })
      .catch(() => setAll([]));
  }, []);
  const toggle = (id) => {
    const next = new Set(mine);
    next.has(id) ? next.delete(id) : next.add(id);
    saveP({ services: [...next] }, next.has(id) ? 'Service added' : 'Service removed');
  };
  return (
    <section>
      <h2 className="group-title">Your streaming services</h2>
      <div className="group">
        <div className="group-row">
          <span className="muted small">Choose what you subscribe to in {REGION}. Explore then offers “On my services”, and every title shows whether it’s on one of yours.</span>
        </div>
        <div className="group-row">
          <div className="service-grid">
            {!all && <span className="muted small">Loading services…</span>}
            {all?.map((s) => (
              <button key={s.id} className={`service ${mine.has(s.id) ? 'on' : ''}`} onClick={() => toggle(s.id)} aria-pressed={mine.has(s.id)}>
                {s.logo && <img src={s.logo} alt="" loading="lazy" />}
                <span>{s.name}</span>
                {mine.has(s.id) && <Icon.Check width={14} height={14} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Yearly goals shown on Stats and Home. */
export function GoalsEditor({ profile }) {
  const year = new Date().getFullYear();
  const g = profile.goals?.[year] || {};
  const [titles, setTitles] = useState(g.titles || '');
  const [hours, setHours] = useState(g.hours || '');
  const [episodes, setEpisodes] = useState(g.episodes || '');
  const save = () =>
    saveP({ goals: { ...(profile.goals || {}), [year]: { titles: Number(titles) || null, hours: Number(hours) || null, episodes: Number(episodes) || null } } }, 'Goals saved');
  return (
    <section>
      <h2 className="group-title">{year} goals</h2>
      <form
        className="group"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="group-row">
          <span className="muted small">Set a target and Stats tracks how you’re doing. Leave a box empty to skip it.</span>
        </div>
        <div className="group-row goal-row">
          <label className="field">
            <span>Titles finished</span>
            <input id="goal-titles" className="input" inputMode="numeric" value={titles} onChange={(e) => setTitles(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 100" />
          </label>
          <label className="field">
            <span>Hours watched</span>
            <input id="goal-hours" className="input" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 500" />
          </label>
          <label className="field">
            <span>Episodes</span>
            <input id="goal-episodes" className="input" inputMode="numeric" value={episodes} onChange={(e) => setEpisodes(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 1000" />
          </label>
        </div>
        <div className="group-row">
          <span />
          <button className="btn sm primary">Save goals</button>
        </div>
      </form>
    </section>
  );
}

/** Add WatchVault to the home screen (installable web app). */
export function InstallApp() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e) => (e.preventDefault(), setPrompt(e));
    window.addEventListener('beforeinstallprompt', onPrompt);
    setInstalled(window.matchMedia?.('(display-mode: standalone)').matches);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div className="group-row">
      <div>
        <b>Install the app</b>
        <span className="muted small">
          {installed
            ? 'Installed. It opens full screen from your home screen.'
            : ios
              ? 'In Safari, tap Share, then “Add to Home Screen”.'
              : prompt
                ? 'Opens full screen and works offline for your list.'
                : 'In your browser menu, choose “Install app” or “Add to Home screen”.'}
        </span>
      </div>
      {prompt && !installed && (
        <button className="btn sm" onClick={() => prompt.prompt().then(() => setPrompt(null))}>
          Install
        </button>
      )}
    </div>
  );
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** Daily new-episode notifications. Only shown when the site owner has set up push keys. */
export function NotifyToggle() {
  const [on, setOn] = useState(null);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && VAPID;
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setOn(Boolean(s))).catch(() => setOn(false));
  }, [supported]);
  if (!supported) return null;
  async function toggle(next) {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    try {
      const reg = await navigator.serviceWorker.ready;
      if (next) {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return toast('Notifications are blocked for this site in your browser settings.', { kind: 'error' });
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
        const j = sub.toJSON();
        const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, keys: j.keys });
        if (error) throw new Error(error.message);
        setOn(true);
        toast('You’ll get a note on days your shows have a new episode');
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
        }
        setOn(false);
        toast('Notifications off');
      }
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }
  return (
    <div className="group-row">
      <div>
        <b>New episode alerts</b>
        <span className="muted small">A notification on days a show you’re watching or planning has a new episode. On iPhone, install the app first.</span>
      </div>
      <span className="toggle">
        <input id="set-push" type="checkbox" checked={Boolean(on)} disabled={on === null} onChange={(e) => toggle(e.target.checked)} aria-label="New episode alerts" />
        <span />
      </span>
    </div>
  );
}
