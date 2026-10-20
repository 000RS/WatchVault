// Saves a bug report or feature idea to the feedback inbox and, if FEEDBACK_WEBHOOK_URL is set
// (a free Discord or Slack incoming webhook), pings the site owner right away.

export const dynamic = 'force-dynamic';

const base = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
const anon = () => String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const KIND = { bug: 'Bug', idea: 'Feature idea', other: 'Feedback' };

export async function POST(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !base() || !anon()) return Response.json({ error: 'Sign in to send feedback.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || '').trim().slice(0, 5000);
  if (!message) return Response.json({ error: 'Write a few words first.' }, { status: 400 });
  const kind = ['bug', 'idea', 'other'].includes(body.kind) ? body.kind : 'other';

  const who = await fetch(`${base()}/auth/v1/user`, { headers: { apikey: anon(), Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!who?.ok) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
  const user = await who.json();

  const row = {
    user_id: user.id,
    kind,
    message,
    page: String(body.page || '').slice(0, 200) || null,
    device: String(body.device || '').slice(0, 200) || null,
    contact: String(body.contact || '').trim().slice(0, 200) || null,
  };
  const ins = await fetch(`${base()}/rest/v1/feedback`, {
    method: 'POST',
    headers: { apikey: anon(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!ins.ok) {
    const t = await ins.text();
    if (/does not exist|schema cache/i.test(t)) return Response.json({ error: 'Feedback needs the version 4 database upgrade (supabase/upgrade_v4.sql).' }, { status: 500 });
    return Response.json({ error: "Couldn't save that. Try again in a moment." }, { status: 500 });
  }

  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    const text = `**${KIND[kind]}** from ${user.email || 'a user'}${row.page ? ` on ${row.page}` : ''}\n${message.slice(0, 1800)}${row.contact ? `\nReply to: ${row.contact}` : ''}`;
    // Discord reads `content`, Slack reads `text`; sending both works for either.
    await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, text }) }).catch(() => {});
  }
  return Response.json({ ok: true });
}
