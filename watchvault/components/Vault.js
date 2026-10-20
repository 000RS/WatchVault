'use client';

import Link from 'next/link';
import Poster from './Poster';
import { CATEGORIES, CATEGORY_LABEL, STATUS_LABEL, countLabel } from '@/lib/categories';
import { computeStats, isWatched } from '@/lib/stats';
import { entryHref } from '@/lib/actions';

export const HOME_SECTIONS = [
  { id: 'upnext', label: 'Up next' },
  { id: 'goals', label: 'Goals & Wrapped' },
  { id: 'continue', label: 'Continue watching' },
  { id: 'tops', label: 'Top lists' },
  { id: 'recent', label: 'Recently watched' },
  { id: 'friends', label: 'Friends activity' },
  { id: 'taste', label: 'Your taste' },
];
export const DEFAULT_SECTIONS = HOME_SECTIONS.map((s) => ({ id: s.id, on: true }));
/** Saved layouts from older versions get the new sections added at the top. */
export function withDefaults(saved) {
  if (!saved?.length) return DEFAULT_SECTIONS;
  const have = new Set(saved.map((s) => s.id));
  return [...HOME_SECTIONS.filter((h) => !have.has(h.id)).map((h) => ({ id: h.id, on: true })), ...saved.filter((s) => HOME_SECTIONS.some((h) => h.id === s.id))];
}

/** The titles that lead your vault: your overall top list, else your best-known highest-rated ones. */
export function showcaseFor(entries, topLists, size = 5) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const picked = (topLists?.overall || []).map((id) => byId.get(id)).filter(Boolean);
  if (picked.length >= Math.min(size, 3)) return picked.slice(0, size);
  const rest = entries
    .filter((e) => isWatched(e) && e.poster_url && !picked.includes(e))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0));
  return picked.concat(rest).slice(0, size);
}

export function VaultHero({ profile, entries, topLists, actions, isSelf }) {
  const s = computeStats(entries);
  const wall = showcaseFor(entries, topLists, 5);
  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : null);
  const heading = isSelf ? (name ? `${firstWord(name)}'s Vault` : 'Your Vault') : `${firstWord(name || 'Their')}'s Vault`;

  return (
    <section className="vault-hero">
      <div className="stack">
        {profile?.username && (
          <div className="vault-meta">
            <span className="avatar md">{(profile.display_name || profile.username)[0].toUpperCase()}</span>
            <span className="muted">@{profile.username}</span>
          </div>
        )}
        <h1 className="h-display">{heading}</h1>
        {profile?.bio && <p className="lede">{profile.bio}</p>}
        <div className="vault-facts">
          <span>
            <b>{s.watchedCount.toLocaleString()}</b> watched
          </span>
          <span>
            <b>{Math.round(s.hours).toLocaleString()}</b> hours
          </span>
          <span>
            <b>{s.episodes.toLocaleString()}</b> episodes
          </span>
          {s.countries.length > 0 && (
            <span>
              <b>{s.countries.length}</b> {s.countries.length === 1 ? 'country' : 'countries'}
            </span>
          )}
        </div>
        {s.byCategory.length > 0 && (
          <p className="muted">
            {s.byCategory
              .sort((a, b) => b.count - a.count)
              .slice(0, 4)
              .map(countLabel)
              .join(', ')}
            .
          </p>
        )}
        {actions && <div className="row">{actions}</div>}
      </div>
      {wall.length > 0 && (
        <div
          className="wall"
          aria-label="Showcase"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty('--mx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
            e.currentTarget.style.setProperty('--my', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.setProperty('--mx', '0');
            e.currentTarget.style.setProperty('--my', '0');
          }}
        >
          {wall.map((e, i) => {
            const rank = i + 1; // first child sits in the centre, the rest fan out
            return (
              <Link key={e.id} href={entryHref(e)} className="wall-item" title={e.title}>
                <span className="float">
                  <Poster src={e.poster_url} title={e.title}>
                    {(topLists?.overall || []).includes(e.id) && <span className="wall-rank">{rank}</span>}
                  </Poster>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

const firstWord = (n) => String(n).replace(/^@/, '').split(' ')[0];

export function TopPodiums({ entries, topLists, size = 5, hidden = new Set(), editable = false }) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const lists = ['overall', ...CATEGORIES.map((c) => c.id)]
    .filter((k) => !hidden.has(k))
    .map((k) => ({ key: k, items: (topLists?.[k] || []).map((id) => byId.get(id)).filter(Boolean).slice(0, size) }))
    .filter((l) => l.items.length);
  if (!lists.length) {
    return editable ? (
      <section className="section">
        <h2 className="h-section">Top lists</h2>
        <p className="muted">
          Rank your favourites: an overall top {size}, plus one for each shelf. <Link href="/top" className="link">Make your first top list</Link>
        </p>
      </section>
    ) : null;
  }
  return (
    <section className="section">
      <div className="shelf-head">
        <h2 className="h-section">Top lists</h2>
        {editable && (
          <Link href="/top" className="link small">
            Edit
          </Link>
        )}
      </div>
      <div className="top-grid">
        {lists.map((l) => (
          <div key={l.key} className="panel">
            <h3 className="h-sub">{l.key === 'overall' ? `Top ${size} overall` : `Top ${CATEGORY_LABEL[l.key]}`}</h3>
            <div className="podium">
              {l.items.map((e, i) => (
                <Link key={e.id} href={entryHref(e)} className="tile">
                  <Poster src={e.poster_url} title={e.title}>
                    <span className="podium-num">{i + 1}</span>
                  </Poster>
                  <span className="tile-title">{e.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EntryRow({ title, entries, href, empty }) {
  if (!entries.length) return empty || null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2 className="h-section">{title}</h2>
        {href && (
          <Link href={href} className="link small">
            See all
          </Link>
        )}
      </div>
      <div className="shelf-track">
        {entries.slice(0, 20).map((e) => (
          <Link key={e.id} href={entryHref(e)} className="tile">
            <Poster src={e.poster_url} title={e.title} />
            <span className="tile-title">{e.title}</span>
            <span className="tile-sub">
              <span className={`dot st-${e.status}`} />
              {STATUS_LABEL[e.status]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TasteCard({ entries, isSelf = true }) {
  const s = computeStats(entries);
  if (!s.taste) return null;
  return (
    <section className="panel persona">
      <h3>{s.personality.name}</h3>
      <p className="lede">{s.taste}</p>
      {isSelf && (
        <Link href="/stats" className="link small">
          See all stats
        </Link>
      )}
    </section>
  );
}
