'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { entryKey, fetchList } from '@/lib/list';

/** Loads your whole list once and gives quick "is this already in my list?" lookups. */
export function useList() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setError(null);
    return fetchList()
      .then(setEntries)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const index = useMemo(() => {
    const m = new Map();
    for (const e of entries || []) m.set(entryKey(e.source, e.media_type, e.source_id), e);
    return m;
  }, [entries]);

  const lookup = useCallback((item) => index.get(entryKey(item.source, item.mediaType, item.sourceId)), [index]);

  return { entries, setEntries, error, reload, lookup, index };
}
