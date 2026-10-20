// Version 4 data: custom lists, diary, follows, reactions, blends and feedback.

import { getSupabase } from './supabase';
import { profilesByIds } from './social';

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
  if (/relation .* does not exist|schema cache|column .* does not exist|function .* does not exist/i.test(error.message))
    throw new Error('This needs the version 4 database upgrade. Run supabase/upgrade_v4.sql in Supabase (see README).');
  throw new Error(error.message);
}

export const itemOf = (t) => ({
  source: t.source,
  media_type: t.mediaType || t.media_type,
  source_id: String(t.sourceId || t.source_id),
  title: t.title,
  poster_url: t.poster || t.poster_url || null,
  year: t.year || null,
});
export const sameItem = (a, b) => a.source === b.source && a.media_type === b.media_type && String(a.source_id) === String(b.source_id);

/* ---------------- Custom lists ---------------- */

let listsCache = null;
export async function myLists({ fresh = false } = {}) {
  if (listsCache && !fresh) return listsCache;
  const uid = await me();
  const { data, error } = await sb().from('lists').select('*').eq('user_id', uid).order('updated_at', { ascending: false });
  check(error);
  listsCache = data;
  return data;
}
export async function listsOf(userId) {
  const { data, error } = await sb().from('lists').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  check(error);
  return data;
}
export async function getList(id) {
  const { data, error } = await sb().from('lists').select('*').eq('id', id).maybeSingle();
  check(error);
  return data;
}
export async function saveList(list) {
  const row = { name: list.name, description: list.description || null, ranked: Boolean(list.ranked), is_public: list.is_public !== false, items: list.items || [] };
  const q = list.id ? sb().from('lists').update(row).eq('id', list.id) : sb().from('lists').insert(row);
  const { data, error } = await q.select().single();
  check(error);
  listsCache = null;
  return data;
}
export async function deleteList(id) {
  const { error } = await sb().from('lists').delete().eq('id', id);
  check(error);
  listsCache = null;
}
export async function toggleInList(list, title) {
  const it = itemOf(title);
  const has = (list.items || []).some((x) => sameItem(x, it));
  return saveList({ ...list, items: has ? list.items.filter((x) => !sameItem(x, it)) : [...(list.items || []), it] });
}

/* ---------------- Diary ---------------- */

export async function diary(userId, { from, to } = {}) {
  const uid = userId || (await me());
  const rows = [];
  for (let start = 0; ; start += 1000) {
    let q = sb().from('diary').select('*').eq('user_id', uid).order('watched_on', { ascending: false }).range(start, start + 999);
    if (from) q = q.gte('watched_on', from);
    if (to) q = q.lte('watched_on', to);
    const { data, error } = await q;
    check(error);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
export async function addDiary(row) {
  const { data, error } = await sb().from('diary').insert(row).select().single();
  check(error);
  return data;
}
export async function removeDiary(id) {
  const { error } = await sb().from('diary').delete().eq('id', id);
  check(error);
}

/* ---------------- Follows ---------------- */

export async function following() {
  const uid = await me();
  const { data, error } = await sb().from('follows').select('followee').eq('follower', uid);
  check(error);
  return data.map((r) => r.followee);
}
export async function followerCount(userId) {
  const { count, error } = await sb().from('follows').select('*', { count: 'exact', head: true }).eq('followee', userId);
  if (error) return 0;
  return count || 0;
}
export async function setFollow(userId, on) {
  const uid = await me();
  const q = on ? sb().from('follows').insert({ follower: uid, followee: userId }) : sb().from('follows').delete().eq('follower', uid).eq('followee', userId);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) check(error);
}

/* ---------------- Reactions & comments ---------------- */

export async function reactionsFor(activityIds) {
  if (!activityIds.length) return [];
  const { data, error } = await sb().from('reactions').select('*').in('activity_id', activityIds).order('created_at');
  if (error) return []; // v4 not installed yet: feed still works
  return data;
}
export async function react({ activityId, ownerId, emoji = null, comment = null, spoiler = false }) {
  const { data, error } = await sb().from('reactions').insert({ activity_id: activityId, owner_id: ownerId, emoji, comment, spoiler }).select().single();
  check(error);
  return data;
}
export async function unreact(id) {
  const { error } = await sb().from('reactions').delete().eq('id', id);
  check(error);
}

/* ---------------- Blends ---------------- */

export async function myBlends() {
  const { data, error } = await sb().from('blends').select('*, blend_members(user_id)').order('created_at', { ascending: false });
  check(error);
  const ids = [...new Set(data.flatMap((b) => [b.created_by, ...b.blend_members.map((m) => m.user_id)]))];
  const profiles = Object.fromEntries((await profilesByIds(ids)).map((p) => [p.id, p]));
  return data.map((b) => ({ ...b, members: [...new Set([b.created_by, ...b.blend_members.map((m) => m.user_id)])].map((id) => profiles[id] || { id }) }));
}
export async function createBlend(name, memberIds) {
  const { data, error } = await sb().from('blends').insert({ name }).select().single();
  check(error);
  if (memberIds.length) {
    const { error: e2 } = await sb()
      .from('blend_members')
      .insert(memberIds.map((user_id) => ({ blend_id: data.id, user_id })));
    check(e2);
  }
  return data;
}
export async function blendFull(id) {
  const [{ data: b, error }, { data: items, error: e2 }] = await Promise.all([
    sb().from('blends').select('*, blend_members(user_id)').eq('id', id).maybeSingle(),
    sb().from('blend_items').select('*, blend_votes(user_id, vote)').eq('blend_id', id).order('created_at'),
  ]);
  check(error || e2);
  if (!b) return null;
  const ids = [...new Set([b.created_by, ...b.blend_members.map((m) => m.user_id)])];
  const profiles = await profilesByIds(ids);
  return { ...b, members: ids.map((i) => profiles.find((p) => p.id === i) || { id: i }), items };
}
export async function addBlendItem(blendId, title) {
  const { data, error } = await sb()
    .from('blend_items')
    .insert({ blend_id: blendId, ...itemOf(title) })
    .select('*, blend_votes(user_id, vote)')
    .single();
  if (error && /duplicate/i.test(error.message)) throw new Error('Already in this blend.');
  check(error);
  return data;
}
export async function voteBlendItem(itemId, vote) {
  const uid = await me();
  const q = vote ? sb().from('blend_votes').upsert({ item_id: itemId, user_id: uid, vote }) : sb().from('blend_votes').delete().eq('item_id', itemId).eq('user_id', uid);
  const { error } = await q;
  check(error);
}
export async function setBlendWatched(itemId, watched) {
  const { error } = await sb().from('blend_items').update({ watched }).eq('id', itemId);
  check(error);
}
export async function removeBlendItem(itemId) {
  const { error } = await sb().from('blend_items').delete().eq('id', itemId);
  check(error);
}
export async function leaveBlend(blendId, ownerLeaving) {
  const uid = await me();
  const { error } = ownerLeaving ? await sb().from('blends').delete().eq('id', blendId) : await sb().from('blend_members').delete().eq('blend_id', blendId).eq('user_id', uid);
  check(error);
}

/* ---------------- Feedback ---------------- */

export async function sendFeedback({ kind, message, contact, page }) {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, message, contact, page, device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Couldn't send that. Try again in a moment.");
  return out;
}
export async function myFeedback() {
  const uid = await me();
  const { data, error } = await sb().from('feedback').select('*').eq('user_id', uid).order('created_at', { ascending: false });
  check(error);
  return data;
}
export async function feedbackInbox() {
  const { data, error } = await sb().from('feedback').select('*').order('created_at', { ascending: false }).limit(500);
  check(error);
  const profiles = Object.fromEntries((await profilesByIds([...new Set(data.map((f) => f.user_id).filter(Boolean))])).map((p) => [p.id, p]));
  return data.map((f) => ({ ...f, profile: profiles[f.user_id] || null }));
}
export async function setFeedbackStatus(id, status) {
  const { error } = await sb().from('feedback').update({ status }).eq('id', id);
  check(error);
}
