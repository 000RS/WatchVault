// Daily: tell people when a show they're watching or planning has a new episode today.
// Optional. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and SUPABASE_SERVICE_ROLE_KEY
// (and CRON_SECRET, which Vercel sends with its scheduled call). See README.

import { tmdbServer } from '@/lib/tmdbServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const base = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');

async function rest(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ skipped: 'Push is not set up (see README).' });

  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails('mailto:noreply@watchvault.app', pub, priv);

  const subs = await rest('push_subscriptions?select=endpoint,user_id,keys');
  const byUser = new Map();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
  const today = new Date().toISOString().slice(0, 10);
  const showCache = new Map();
  const show = async (id) => {
    if (!showCache.has(id)) showCache.set(id, tmdbServer(`tv/${id}`, {}, { revalidate: 3600 }).catch(() => null));
    return showCache.get(id);
  };
  let sent = 0;
  for (const [userId, list] of byUser) {
    const entries = await rest(`entries?select=title,source_id,status&user_id=eq.${userId}&source=eq.tmdb&media_type=eq.tv&status=in.(watching,plan,on_hold)&limit=60`).catch(() => []);
    const airing = [];
    for (const e of entries) {
      const d = await show(e.source_id);
      const ep = [d?.last_episode_to_air, d?.next_episode_to_air].find((x) => x?.air_date === today);
      if (ep) airing.push({ title: e.title, label: `S${ep.season_number} E${ep.episode_number}`, id: e.source_id });
    }
    if (!airing.length) continue;
    const body = airing.length === 1 ? `${airing[0].title} ${airing[0].label} is out today.` : `New today: ${airing.slice(0, 4).map((a) => a.title).join(', ')}${airing.length > 4 ? ` and ${airing.length - 4} more` : ''}.`;
    for (const s of list) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: 'New episodes', body, url: airing.length === 1 ? `/title/tmdb/tv/${airing[0].id}` : '/calendar', tag: `ep-${today}` }));
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  }
  return Response.json({ ok: true, users: byUser.size, sent });
}
