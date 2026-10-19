'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchActivity } from '@/lib/social';
import { useAuth } from '@/components/AppShell';
import { ActivityList } from '@/components/ActivityList';

const PAGE = 50;

export default function ActivityPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (before) => {
      try {
        const r = await fetchActivity([user.id], { before, limit: PAGE });
        setRows((prev) => (before ? [...(prev || []), ...r] : r));
        setMore(r.length === PAGE);
      } catch (e) {
        setError(e.message);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) load(null);
  }, [user, load]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="h-page">History</h1>
          <p className="muted">Everything you added and changed, newest first.</p>
        </div>
      </header>
      {error && <p className="notice error">{error}</p>}
      {rows && rows.length === 0 && (
        <div className="empty">
          <p className="lede">Nothing yet. Changes you make from now on appear here.</p>
          <Link href="/explore" className="btn primary">
            Explore titles
          </Link>
        </div>
      )}
      {rows === null && !error && <div className="skeleton" style={{ height: 240, aspectRatio: 'auto' }} />}
      {rows && rows.length > 0 && <ActivityList rows={rows} />}
      {rows && more && rows.length > 0 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => load(rows[rows.length - 1].updated_at)}>
            Show older
          </button>
        </div>
      )}
    </>
  );
}
