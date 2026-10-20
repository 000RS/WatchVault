'use client';

// One JSON file with everything you've put into WatchVault.

import { getSupabase } from './supabase';
import { getStoreEntries } from './store';

export async function exportJson() {
  const sb = getSupabase();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user?.id;
  const grab = async (table, col = 'user_id') => {
    const { data, error } = await sb.from(table).select('*').eq(col, uid);
    return error ? [] : data;
  };
  const [profile, diary, lists, top_lists] = await Promise.all([grab('profiles', 'id'), grab('diary'), grab('lists'), grab('top_lists')]);
  const out = { app: 'WatchVault', version: 4, exported_at: new Date().toISOString(), profile: profile[0] || null, entries: getStoreEntries(), diary, lists, top_lists };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `watchvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
