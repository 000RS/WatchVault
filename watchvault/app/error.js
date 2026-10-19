'use client';

import { useEffect, useState } from 'react';

// Shown instead of a blank screen if a page fails. Keeps the rest of the app usable.
export default function PageError({ error, reset }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    console.error(error);
  }, [error]);
  const details = `${error?.message || 'Unknown error'}\n${(error?.stack || '').split('\n').slice(0, 6).join('\n')}`;
  return (
    <div className="empty">
      <h1 className="h-page">This page hit a problem</h1>
      <p className="lede">Your list is safe. Try again, or go back to Home.</p>
      <pre className="error-details">{error?.message}</pre>
      <div className="row">
        <button className="btn primary" onClick={() => reset()}>
          Try again
        </button>
        <a className="btn" href="/">
          Go to Home
        </a>
        <button
          className="btn ghost"
          onClick={() =>
            navigator.clipboard
              .writeText(details)
              .then(() => setCopied(true))
              .catch(() => {})
          }
        >
          {copied ? 'Copied' : 'Copy error details'}
        </button>
      </div>
    </div>
  );
}
