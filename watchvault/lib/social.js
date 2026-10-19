// Profiles, friends, top lists and activity history.

import { getSupabase } from './supabase';

const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('The database is not connected.');
  return c;
};

async function me() {
  const { data } = await sb().auth.getSession();
  return data.session?.user?.id || null;
}

function check(error) {
  if (!error) return;
  if (/relation .* does not exist|schema cache/i.test(error.message)) throw new Error('The database needs the v2 upgrade. Run supabase/upgrade_v2.sql in Supabase (see README).');
  throw new Error(error.message);
}

export async function profileByUsername(username) {
  const { data, error } = await sb().from('profiles').select('*').eq('username', String(username).toLowerCase()).maybeSingle();
  check(error);
  return data;
}

export async function profilesByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await sb().from('profiles').select('id, username, display_name, bio, is_public').in('id', ids);
  check(error);
  return data;
}

export async function searchProfiles(q) {
  const term = String(q || '').replace(/[^a-zA-Z0-9_ ]/g, '').trim();
  if (term.length < 2) return [];
  const { data, error } = await sb()
    .from('profiles')
    .select('id, username, display_name, is_public')
    .not('username', 'is', null)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(12);
  check(error);
  const uid = await me();
  return data.filter((p) => p.id !== uid);
}

/** { friends, incoming, outgoing } with each person's profile attached. */
export async function friendships() {
  const uid = await me();
  const { data, error } = await sb().from('friendships').select('*');
  check(error);
  const otherIds = [...new Set(data.map((f) => (f.requester === uid ? f.addressee : f.requester)))];
  const profiles = Object.fromEntries((await profilesByIds(otherIds)).map((p) => [p.id, p]));
  const withProfile = (f) => {
    const other = f.requester === uid ? f.addressee : f.requester;
    return { ...f, other, profile: profiles[other] || { id: other } };
  };
  return {
    friends: data.filter((f) => f.status === 'accepted').map(withProfile),
    incoming: data.filter((f) => f.status === 'pending' && f.addressee === uid).map(withProfile),
    outgoing: data.filter((f) => f.status === 'pending' && f.requester === uid).map(withProfile),
  };
}

export async function sendFriendRequest(otherId) {
  const uid = await me();
  // If they already asked you, accept instead of creating a second request.
  const { data: theirs } = await sb().from('friendships').select('*').eq('requester', otherId).eq('addressee', uid).maybeSingle();
  if (theirs) return acceptFriendRequest(otherId);
  const { error } = await sb().from('friendships').insert({ requester: uid, addressee: otherId });
  if (error && !/duplicate/i.test(error.message)) check(error);
}

export async function acceptFriendRequest(requesterId) {
  const uid = await me();
  const { error } = await sb().from('friendships').update({ status: 'accepted' }).eq('requester', requesterId).eq('addressee', uid);
  check(error);
}

export async function removeFriend(otherId) {
  const uid = await me();
  const { error } = await sb()
    .from('friendships')
    .delete()
    .or(`and(requester.eq.${uid},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${uid})`);
  check(error);
}

export async function relationTo(otherId) {
  const uid = await me();
  if (!uid) return 'signed-out';
  if (uid === otherId) return 'self';
  const { data } = await sb()
    .from('friendships')
    .select('*')
    .or(`and(requester.eq.${uid},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${uid})`)
    .maybeSingle();
  if (!data) return 'none';
  if (data.status === 'accepted') return 'friends';
  return data.requester === uid ? 'requested' : 'incoming';
}

export async function fetchActivity(userIds, { before = null, limit = 40 } = {}) {
  if (!userIds.length) return [];
  let q = sb().from('activity').select('*').in('user_id', userIds).order('updated_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('updated_at', before);
  const { data, error } = await q;
  check(error);
  return data;
}

export async function fetchTopLists(userId) {
  const { data, error } = await sb().from('top_lists').select('*').eq('user_id', userId);
  check(error);
  return Object.fromEntries(data.map((r) => [r.list_key, r.entry_ids || []]));
}

export async function saveTopList(key, entryIds) {
  const uid = await me();
  const { error } = await sb().from('top_lists').upsert({ user_id: uid, list_key: key, entry_ids: entryIds, updated_at: new Date().toISOString() });
  check(error);
}

/** Someone else's list as you're allowed to see it (never includes their private notes). */
export async function sharedEntries(userId) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from('shared_entries').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).range(from, from + 999);
    check(error);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export function displayName(p) {
  return p?.display_name || (p?.username ? `@${p.username}` : 'Someone');
}
