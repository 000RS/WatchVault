'use client';

import Link from 'next/link';

/** Where to stream, rent or buy in your country. */
export function WhereToWatch({ providers, compact = false }) {
  if (!providers) return <p className="muted small">Not streaming in your country right now, as far as we know.</p>;
  const groups = [
    ['Stream', providers.stream],
    ['Rent', providers.rent],
    ['Buy', providers.buy],
  ].filter(([, l]) => l?.length);
  if (!groups.length) return <p className="muted small">Not streaming in your country right now, as far as we know.</p>;
  return (
    <div className="stack-sm">
      {groups.slice(0, compact ? 2 : 3).map(([label, list]) => (
        <div key={label} className="providers">
          <span className="field-label">{label}</span>
          <div className="provider-row">
            {list.slice(0, compact ? 6 : 12).map((p) => (
              <a key={p.id} href={providers.link} target="_blank" rel="noreferrer" className="provider" title={p.name}>
                {p.logo ? <img src={p.logo} alt={p.name} /> : <span>{p.name}</span>}
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="hint">Streaming info from JustWatch. Tap a logo to see the options.</p>
    </div>
  );
}

/** Cast, creators, studios and franchise, each linking to its own page. */
export function Credits({ full, onNavigate }) {
  if (!full) return null;
  const { cast = [], crew = [], companies = [], networks = [], collection } = full;
  return (
    <div className="stack">
      {collection && (
        <Link href={`/collection/${collection.id}`} className="franchise" onClick={onNavigate}>
          <span className="field-label">Part of</span>
          <b>{collection.name}</b>
          <span className="link small">See the watch order</span>
        </Link>
      )}
      {crew.length > 0 && (
        <div className="credit-line">
          {crew.map((c) => (
            <Link key={`${c.id}${c.job}`} href={`/person/${c.id}`} className="credit" onClick={onNavigate}>
              <span className="field-label">{c.job}</span>
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      )}
      {cast.length > 0 && (
        <div className="stack-sm">
          <span className="field-label">Cast</span>
          <div className="cast-row">
            {cast.map((p) => (
              <Link key={p.id} href={`/person/${p.id}`} className="cast" onClick={onNavigate}>
                <span className="cast-photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span>{p.name[0]}</span>}</span>
                <span className="cast-name">{p.name}</span>
                {p.character && <span className="cast-role">{p.character}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
      {companies.length + networks.length > 0 && (
        <div className="chips wrap">
          {[...networks, ...companies].map((c) => (
            <Link key={c.id} href={`/studio/${c.id}`} className="chip" onClick={onNavigate}>
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
