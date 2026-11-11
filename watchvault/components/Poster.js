'use client';

import { useState } from 'react';

/** Poster art with a typographic fallback when there is no image. */
export default function Poster({ src, title, size = 'md', icon, children }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`poster poster-${size}`}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="poster-fallback">
          {icon && <i className="poster-icon" aria-hidden="true">{icon}</i>}
          <span>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}
