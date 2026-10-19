import { createClient } from '@supabase/supabase-js';

let client = null;

/** The Supabase address the site is actually using (shown on the sign-in page to help with setup). */
export function supabaseUrl() {
  return cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function cleanUrl(raw) {
  // Accept the URL even if it was pasted with a trailing "/", "/rest/v1" or quotes.
  return String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/(rest|auth)\/v1\/?$/, '')
    .replace(/\/+$/, '');
}

export function getSupabase() {
  if (client) return client;
  const url = supabaseUrl();
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
