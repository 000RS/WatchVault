'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { battlesFor, challengeProgress, createBattle, createChallenge, deleteBattle, leaveChallenge, myChallenges, voteBattle } from '@/lib/social4';
import { displayName, friendships, sharedEntries } from '@/lib/social';
import { useEntries } from '@/lib/store';
import { useAuth } from '@/components/AppShell';
import { CATEGORIES } from '@/lib/categories';
import Poster from '@/components/Poster';
import { toast } from '@/lib/toast';

const asItem = (e) => ({ source: e.source, mediaType: e.media_type, sourceId: e.source_id, title: e.title, poster: e.poster_url, year: e.year, category: e.category });

/** Doing things with friends: battles, challenges, plus doors into Blends and Group Swipe. */
export default function TogetherPage() {
  const { user } = useAuth();
  const { entries, profile } = useEntries();
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    friendships()
      .then((d) => setFriends(d.friends))
      .catch((e) => setError(e.message));
  }, []);
  const names = useMemo(() => Object.fromEntries([...friends.map((f) => [f.other, f.profile]), ...(profile ? [[profile.id, profile]] : [])]), [friends, profile]);

  return (
    <>
      <header className="page-head">
        <div className="head-text">
          <h1 className="h-page">Together</h1>
          <p className="muted">Decide, compete and discover with your friends.</p>
        </div>
      </header>
      {error && <p className="notice">{error}</p>}
      <div className="together-doors">
        <Link href="/swipe?mode=group" className="vault-shelf">
          <span className="vault-icon">🔥</span>
          <b>Group swipe</b>
          <span className="muted small">Everyone swipes, matches pop up</span>
        </Link>
        <Link href="/blends" className="vault-shelf">
          <span className="vault-icon">🫶</span>
          <b>Shared vaults</b>
          <span className="muted small">A joint list with voting, for any shelf</span>
        </Link>
        <Link href="/taste" className="vault-shelf">
          <span className="vault-icon">🧬</span>
          <b>Taste matching</b>
          <span className="muted small">Twins, opposites and hidden gems</span>
        </Link>
      </div>
      <Battles me={user?.id} friends={friends} names={names} entries={entries || []} />
      <Challenges me={user?.id} friends={friends} names={names} entries={entries || []} />
    </>
  );
}

/* ---------------- Battles ---------------- */

function Battles({ me, friends, names, entries }) {
  const [list, setList] = useState(null);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [question, setQuestion] = useState('');
  const options = entries.filter((e) => e.status === 'plan').slice(0, 300);

  useEffect(() => {
    if (!me) return;
    battlesFor([me, ...friends.map((f) => f.other)])
      .then(setList)
      .catch(() => setList([]));
  }, [me, friends.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    const A = options.find((x) => x.id === a);
    const B = options.find((x) => x.id === b);
    if (!A || !B || A.id === B.id) return toast('Pick two different things.');
    try {
      const made = await createBattle(question.trim() || 'Which one first?', asItem(A), asItem(B));
      setList((l) => [made, ...(l || [])]);
      setA('');
      setB('');
      setQuestion('');
      toast('Battle posted. Friends can vote now.');
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  }
  async function vote(bt, pick) {
    setList((l) => l.map((x) => (x.id === bt.id ? { ...x, votes: [...x.votes.filter((v) => v.user_id !== me), { battle_id: bt.id, user_id: me, pick }] } : x)));
    voteBattle(bt.id, pick).catch((err) => toast(err.message, { kind: 'error' }));
  }

  return (
    <section className="section">
      <h2 className="h-section">Recommendation battles</h2>
      <p className="muted small">Can&apos;t pick between two things on your list? Let your friends vote.</p>
      <form className="panel toolbar" style={{ padding: 14 }} onSubmit={create}>
        <select className="select" value={a} onChange={(e) => setA(e.target.value)} aria-label="First option">
          <option value="">First option…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
        <span className="muted">vs</span>
        <select className="select" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second option">
          <option value="">Second option…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Question (optional): which one first?" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} />
        <button className="btn primary" disabled={!a || !b}>
          Start battle
        </button>
      </form>
      {!options.length && <p className="hint">Save a few things to Plan first (♥ in Swipe), then battle them.</p>}
      <div className="battles">
        {list?.map((bt) => {
          const na = bt.votes.filter((v) => v.pick === 'a').length;
          const nb = bt.votes.filter((v) => v.pick === 'b').length;
          const total = na + nb || 1;
          const mine = bt.votes.find((v) => v.user_id === me)?.pick;
          return (
            <article key={bt.id} className="panel battle">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{bt.question}</b>
                <span className="muted small">{bt.user_id === me ? 'Your battle' : displayName(names[bt.user_id])}</span>
              </div>
              <div className="battle-sides">
                {[
                  ['a', bt.a, na],
                  ['b', bt.b, nb],
                ].map(([side, it, n]) => (
                  <button key={side} className={`battle-side as-button ${mine === side ? 'on' : ''}`} onClick={() => vote(bt, side)}>
                    <Poster src={it.poster_url} title={it.title} size="sm" />
                    <span className="stack-sm" style={{ minWidth: 0 }}>
                      <b>{it.title}</b>
                      <span className="meter">
                        <i style={{ width: `${(n / total) * 100}%` }} />
                      </span>
                      <span className="muted small">
                        {n} vote{n === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {bt.user_id === me && (
                <button className="as-text-link small" style={{ justifySelf: 'start' }} onClick={() => deleteBattle(bt.id).then(() => setList((l) => l.filter((x) => x.id !== bt.id)))}>
                  Close this battle
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Challenges ---------------- */

const PRESETS = [
  { title: 'Watch three hidden gems', rule: { shelf: 'screen', count: 3, gems: true }, days: 30 },
  { title: 'Read two books', rule: { shelf: 'books', count: 2 }, days: 30 },
  { title: 'Finish five films', rule: { shelf: 'movies', count: 5 }, days: 14 },
  { title: 'Try four new food spots', rule: { shelf: 'food', count: 4 }, days: 30 },
  { title: 'Beat a game', rule: { shelf: 'games', count: 1 }, days: 30 },
];

function Challenges({ me, friends, names, entries }) {
  const [list, setList] = useState(null);
  const [progress, setProgress] = useState({});
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState({ title: PRESETS[0].title, shelf: 'screen', count: 3, gems: true, days: 30, members: new Set() });

  const load = () =>
    myChallenges()
      .then(setList)
      .catch(() => setList([]));
  useEffect(() => {
    if (me) load();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!list?.length) return;
    const ids = [...new Set(list.flatMap((c) => c.members))];
    Promise.all(ids.map((id) => (id === me ? Promise.resolve(entries) : sharedEntries(id).catch(() => [])))).then((ls) => setProgress(Object.fromEntries(ids.map((id, i) => [id, ls[i]]))));
  }, [list, entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    const ends = new Date(Date.now() + form.days * 86400000).toISOString().slice(0, 10);
    try {
      await createChallenge({ title: form.title.trim() || 'Challenge', rule: { shelf: form.shelf, count: Number(form.count) || 1, gems: form.gems }, ends_on: ends, memberIds: [...form.members] });
      setMaking(false);
      toast('Challenge started');
      load();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  }

  return (
    <section className="section">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="h-section">Friend challenges</h2>
          <p className="muted small">A goal, a deadline and a friendly race. Progress counts itself as you finish things.</p>
        </div>
        <button className="btn sm primary" onClick={() => setMaking(!making)}>
          New challenge
        </button>
      </div>
      {making && (
        <form className="panel stack" style={{ padding: 18 }} onSubmit={create}>
          <div className="chips wrap">
            {PRESETS.map((p) => (
              <button type="button" key={p.title} className={`chip ${form.title === p.title ? 'on' : ''}`} onClick={() => setForm({ ...form, title: p.title, shelf: p.rule.shelf, count: p.rule.count, gems: Boolean(p.rule.gems), days: p.days })}>
                {p.title}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} aria-label="Title" />
            <select className="select" value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} aria-label="Shelf">
              <option value="any">Anything</option>
              <option value="screen">Films & series</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input className="input" style={{ width: 90, flex: 'none' }} inputMode="numeric" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label="How many" />
            <select className="select" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} aria-label="How long">
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
            <label className="row small">
              <input type="checkbox" checked={form.gems} onChange={(e) => setForm({ ...form, gems: e.target.checked })} /> Hidden gems only
            </label>
          </div>
          <span className="field-label">Invite</span>
          <div className="chips wrap">
            {friends.map((f) => (
              <button
                type="button"
                key={f.other}
                className={`chip ${form.members.has(f.other) ? 'on' : ''}`}
                onClick={() => {
                  const n = new Set(form.members);
                  n.has(f.other) ? n.delete(f.other) : n.add(f.other);
                  setForm({ ...form, members: n });
                }}
              >
                {displayName(f.profile)}
              </button>
            ))}
            {!friends.length && <span className="muted small">Add friends to race them. You can also go solo.</span>}
          </div>
          <button className="btn primary" style={{ justifySelf: 'start' }}>
            Start
          </button>
        </form>
      )}
      <div className="challenges">
        {list?.map((c) => {
          const goal = c.rule?.count || 1;
          const rows = c.members.map((id) => ({ id, n: challengeProgress(progress[id] || [], c) })).sort((x, y) => y.n - x.n);
          const left = Math.max(0, Math.ceil((new Date(`${c.ends_on}T23:59:59`) - Date.now()) / 86400000));
          return (
            <article key={c.id} className="panel challenge">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{c.title}</b>
                <span className="muted small">{left ? `${left} days left` : 'Finished'}</span>
              </div>
              {rows.map((r) => (
                <div key={r.id} className="goal">
                  <div className="goal-label">
                    <span>
                      {r.id === me ? 'You' : displayName(names[r.id])}
                      {r.n >= goal ? ' ✓' : ''}
                    </span>
                    <b>
                      {r.n} / {goal}
                    </b>
                  </div>
                  <div className="meter">
                    <i style={{ width: `${Math.min(100, (r.n / goal) * 100)}%` }} />
                  </div>
                </div>
              ))}
              <button className="as-text-link small" style={{ justifySelf: 'start' }} onClick={() => leaveChallenge(c.id, c.created_by === me).then(load)}>
                {c.created_by === me ? 'End challenge' : 'Leave'}
              </button>
            </article>
          );
        })}
        {list && !list.length && !making && <p className="muted">No challenges yet.</p>}
      </div>
    </section>
  );
}
