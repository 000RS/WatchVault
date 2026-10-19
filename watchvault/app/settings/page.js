'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { removeEntries, saveProfile, updateEntry, useEntries } from '@/lib/store';
import { CATEGORIES } from '@/lib/categories';
import { keyOfEntry, keyOfTitle, progressFor, snapshotFromTitle, toCsv } from '@/lib/list';
import { DEFAULT_SECTIONS, HOME_SECTIONS } from '@/components/Vault';
import { Icon } from '@/components/Icons';
import { toast } from '@/lib/toast';

export default function SettingsPage() {
  const { entries, profile } = useEntries();
  const [form, setForm] = useState({ username: '', display_name: '', bio: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) setForm({ username: profile.username || '', display_name: profile.display_name || '', bio: profile.bio || '' });
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch, msg = 'Saved') => {
    try {
      await saveProfile(patch);
      toast(msg);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };

  if (!profile)
    return (
      <div className="settings">
        <h1 className="h-page">Settings</h1>
        <p className="notice">
          Profiles need the v2 database upgrade. Run <b>supabase/upgrade_v2.sql</b> in Supabase, then reload this page.
        </p>
        <DataTools entries={entries || []} />
      </div>
    );

  const hidden = new Set(profile.hidden_categories || []);
  const sections = profile.home_sections || DEFAULT_SECTIONS;
  const link = profile.username && typeof window !== 'undefined' ? `${window.location.origin}/u/${profile.username}` : null;

  return (
    <div className="settings">
      <h1 className="h-page">Settings</h1>

      <section>
        <h2 className="group-title">Profile</h2>
        <form
          className="group"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await save({ username: form.username.trim().toLowerCase() || null, display_name: form.display_name.trim() || null, bio: form.bio.trim() || null }, 'Profile saved');
            setBusy(false);
          }}
        >
          <div className="group-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Username</span>
              <input id="set-username" className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24).toLowerCase() })} placeholder="3 to 24 letters, numbers or _" />
            </label>
          </div>
          <div className="group-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Name</span>
              <input id="set-name" className="input" maxLength={40} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </label>
          </div>
          <div className="group-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Bio</span>
              <textarea id="set-bio" className="textarea" maxLength={200} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="One line about your taste" />
            </label>
          </div>
          <div className="group-row">
            <span className="muted small">Your profile shows your showcase, top lists, history and taste. Private notes never appear.</span>
            <button className="btn primary sm" disabled={busy}>
              Save profile
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="group-title">Sharing</h2>
        <div className="group">
          <div className="group-row">
            <div>
              <b>Public profile</b>
              <span className="muted small">Anyone with the link can view your vault. When off, only friends can.</span>
            </div>
            <span className="toggle">
              <input id="set-public" type="checkbox" checked={profile.is_public} onChange={(e) => save({ is_public: e.target.checked }, e.target.checked ? 'Your vault is public' : 'Only friends can see your vault')} aria-label="Public profile" />
              <span />
            </span>
          </div>
          {link && (
            <div className="group-row">
              <div>
                <b>Your link</b>
                <span className="muted small" style={{ overflowWrap: 'anywhere' }}>
                  {link}
                </span>
              </div>
              <button className="btn sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied')).catch(() => toast(link))}>
                <Icon.Link width={16} height={16} /> Copy
              </button>
            </div>
          )}
          <div className="group-row">
            <div>
              <b>Showcase size</b>
              <span className="muted small">How many titles each top list shows on your vault.</span>
            </div>
            <div className="tabs">
              {[3, 5, 10].map((n) => (
                <button key={n} className={`tab-btn ${profile.showcase_size === n ? 'on' : ''}`} onClick={() => save({ showcase_size: n })}>
                  Top {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="group-title">Your feed</h2>
        <div className="group">
          <div className="group-row">
            <span className="muted small">Turn off what you don&apos;t watch. It disappears from Home, Explore and your profile. Titles already in your list stay in My List.</span>
          </div>
          {CATEGORIES.filter((c) => c.id !== 'other').map((c) => (
            <div key={c.id} className="group-row">
              <b>{c.label}</b>
              <span className="toggle">
                <input
                  id={`show-${c.id}`}
                  type="checkbox"
                  checked={!hidden.has(c.id)}
                  aria-label={`Show ${c.label}`}
                  onChange={(e) => {
                    const next = new Set(hidden);
                    e.target.checked ? next.delete(c.id) : next.add(c.id);
                    save({ hidden_categories: [...next] }, e.target.checked ? `${c.label} is back in your feed` : `${c.label} hidden from your feed`);
                  }}
                />
                <span />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="group-title">Home page</h2>
        <div className="group">
          {sections.map((s, i) => {
            const meta = HOME_SECTIONS.find((h) => h.id === s.id);
            if (!meta) return null;
            const move = (d) => {
              const next = [...sections];
              [next[i], next[i + d]] = [next[i + d], next[i]];
              save({ home_sections: next });
            };
            return (
              <div key={s.id} className="group-row">
                <b>{meta.label}</b>
                <div className="row">
                  <button className="icon-btn" disabled={i === 0} onClick={() => move(-1)} aria-label={`Move ${meta.label} up`}>
                    <Icon.Up width={16} height={16} />
                  </button>
                  <button className="icon-btn" disabled={i === sections.length - 1} onClick={() => move(1)} aria-label={`Move ${meta.label} down`}>
                    <Icon.Down width={16} height={16} />
                  </button>
                  <span className="toggle">
                    <input id={`sec-${s.id}`} type="checkbox" checked={s.on} aria-label={`Show ${meta.label}`} onChange={(e) => save({ home_sections: sections.map((x) => (x.id === s.id ? { ...x, on: e.target.checked } : x)) })} />
                    <span />
                  </span>
                </div>
              </div>
            );
          })}
          <div className="group-row">
            <span className="muted small">The titles at the top of Home come from your overall top list.</span>
            <Link href="/top" className="btn sm">
              Edit top lists
            </Link>
          </div>
        </div>
      </section>

      <DataTools entries={entries || []} />

      <section>
        <h2 className="group-title">Account</h2>
        <div className="group">
          <div className="group-row">
            <span className="muted small">Signed in</span>
            <button className="btn sm" onClick={() => getSupabase()?.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="group-title">About</h2>
        <div className="group">
          <div className="group-row">
            <span className="muted small">
              Title information and images come from TMDB and AniList. This product uses the TMDB API but is not endorsed or certified by TMDB.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

const RANK = { completed: 5, watching: 4, on_hold: 3, dropped: 2, plan: 1 };

function DataTools({ entries }) {
  const [linking, setLinking] = useState(null);
  const ani = entries.filter((e) => e.source === 'anilist');

  async function linkAnime() {
    setLinking({ done: 0, total: ani.length });
    const byKey = new Map(entries.filter((e) => e.source === 'tmdb').map((e) => [keyOfEntry(e), e]));
    let linked = 0;
    let kept = 0;
    try {
      for (let i = 0; i < ani.length; i += 40) {
        const chunk = ani.slice(i, i + 40);
        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk.map((e) => ({ id: e.id, q: e.title, year: e.year, kind: 'anime' })) }),
        }).then((r) => r.json());
        for (const r of res.results || []) {
          const e = chunk.find((x) => x.id === r.id);
          if (!e || !r.best || r.best.source !== 'tmdb' || r.confidence < 0.8) {
            kept++;
            continue;
          }
          const key = keyOfTitle(r.best);
          const row = {
            ...snapshotFromTitle(r.best),
            category: 'anime',
            ...progressFor(r.best, { status: e.status, episodes: e.episodes_watched }),
          };
          const existing = byKey.get(key);
          if (existing) {
            // Several AniList seasons can be one TMDB show: keep the furthest progress.
            if ((RANK[row.status] || 0) > (RANK[existing.status] || 0) || (row.episodes_watched || 0) > (existing.episodes_watched || 0)) {
              await updateEntry(existing.id, { status: row.status, current_season: row.current_season, current_episode: row.current_episode, episodes_watched: row.episodes_watched }, { delay: 0 });
            }
            await removeEntries([e.id]);
          } else {
            const saved = await updateEntry(e.id, row, { delay: 0 });
            byKey.set(key, saved || { ...e, ...row });
          }
          linked++;
        }
        setLinking({ done: Math.min(i + 40, ani.length), total: ani.length });
      }
      toast(`Linked ${linked} anime to TMDB${kept ? `. ${kept} stay on AniList` : ''}.`);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setLinking(null);
    }
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(entries)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `watchvault-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section>
      <h2 className="group-title">Your data</h2>
      <div className="group">
        {ani.length > 0 && (
          <div className="group-row">
            <div>
              <b>Link {ani.length} anime to TMDB</b>
              <span className="muted small">Gives them full seasons and counts them in rankings. Progress, ratings and notes are kept. Titles TMDB doesn&apos;t have stay as they are.</span>
              {linking && (
                <div className="progressbar" style={{ marginTop: 8 }}>
                  <i style={{ width: `${(linking.done / linking.total) * 100}%` }} />
                </div>
              )}
            </div>
            <button className="btn sm" disabled={Boolean(linking)} onClick={linkAnime}>
              {linking ? 'Linking…' : 'Link now'}
            </button>
          </div>
        )}
        <div className="group-row">
          <div>
            <b>Download your list</b>
            <span className="muted small">A CSV file that opens in Excel or Google Sheets.</span>
          </div>
          <button className="btn sm" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
        <div className="group-row">
          <div>
            <b>Import more</b>
            <span className="muted small">Excel, CSV, Word, text, Letterboxd, IMDb or MyAnimeList.</span>
          </div>
          <Link href="/import" className="btn sm">
            Import
          </Link>
        </div>
      </div>
    </section>
  );
}
