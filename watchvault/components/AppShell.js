'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const LINKS = [
  { href: '/', label: 'My List' },
  { href: '/stats', label: 'Stats' },
  { href: '/discover', label: 'New' },
  { href: '/search', label: 'Search' },
  { href: '/import', label: 'Import' },
];

export default function AppShell({ children }) {
  const sb = getSupabase();
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  if (!sb) return <SetupNeeded />;
  if (session === undefined) return <div className="center muted">Loading…</div>;
  if (!session) return <SignIn sb={sb} />;

  return (
    <AuthContext.Provider value={{ session, user: session.user }}>
      <TopBar onSignOut={() => sb.auth.signOut()} />
      <main className="wrap">
        {children}
        <footer className="small muted" style={{ paddingTop: 24 }}>
          Movie and TV data from TMDB; anime data from AniList. This product uses the TMDB API but is not endorsed or
          certified by TMDB.
        </footer>
      </main>
    </AuthContext.Provider>
  );
}

function TopBar({ onSignOut }) {
  const path = usePathname();
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          Watch<span>Vault</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={active(l.href) ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
        </nav>
        <button className="btn ghost sm signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}

function SignIn({ sb }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const fn = mode === 'signin' ? sb.auth.signInWithPassword : sb.auth.signUp;
    const { data, error } = await fn.call(sb.auth, { email, password });
    setBusy(false);
    if (error) return setMessage({ kind: 'error', text: error.message });
    if (mode === 'signup' && !data.session) {
      setMessage({ kind: 'ok', text: 'Account created. Check your email for the confirmation link, then sign in.' });
      setMode('signin');
    }
  }

  return (
    <div className="center">
      <form className="panel" style={{ width: 'min(400px, 100%)', textAlign: 'left' }} onSubmit={submit}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="brand" style={{ fontSize: '1.6rem' }}>
            Watch<span>Vault</span>
          </div>
          <p className="muted">Your anime, movies, series and dramas in one place.</p>
        </div>
        <label className="field">
          Email
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && <div className={`notice ${message.kind}`}>{message.text}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'First time here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="center">
      <div className="panel" style={{ maxWidth: 520, textAlign: 'left' }}>
        <h2>Almost there</h2>
        <p>
          The database isn&apos;t connected yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your environment variables (see README, step 1), then redeploy.
        </p>
      </div>
    </div>
  );
}
