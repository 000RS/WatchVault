'use client';

/** Useful links and extras for things beyond the screen: a song preview, a map, tickets, the store page. */
export function ItemLinks({ item }) {
  const m = item?.meta || {};
  const type = item?.mediaType || item?.media_type;
  const links = [];
  if (type === 'book' && item.source === 'openlibrary') links.push(['Open Library', `https://openlibrary.org/works/${item.sourceId || item.source_id}`]);
  if (type === 'manga' && item.source === 'anilist') links.push(['AniList', `https://anilist.co/manga/${item.sourceId || item.source_id}`]);
  if ((type === 'place' || type === 'travel') && m.lat != null) {
    links.push(['Map', `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lon}#map=16/${m.lat}/${m.lon}`]);
    links.push(['Directions', `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}`]);
  }
  if (m.link) links.push([type === 'music' || type === 'podcast' ? 'Apple Music' : type === 'event' ? 'Tickets' : type === 'game' ? 'Store page' : 'Link', m.link]);
  if (type === 'music' && !m.link) links.push(['Search on Spotify', `https://open.spotify.com/search/${encodeURIComponent(`${item.title} ${m.by || ''}`)}`]);
  if (type === 'music') links.push(['YouTube', `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.title} ${m.by || ''}`)}`]);
  return (
    <div className="stack-sm">
      {m.platforms?.length > 0 && <p className="muted small">{m.platforms.join(' · ')}</p>}
      {m.address && <p className="muted small">{m.address}</p>}
      {m.date && (
        <p className="muted small">
          {new Date(`${m.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
          {m.time ? ` · ${m.time.slice(0, 5)}` : ''}
        </p>
      )}
      {m.preview && <audio className="preview-audio" controls preload="none" src={m.preview} aria-label="30-second preview" />}
      {links.length > 0 && (
        <div className="row small" style={{ gap: 14 }}>
          {links.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="link">
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
