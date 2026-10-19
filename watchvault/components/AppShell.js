'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSupabase, supabaseUrl } from '@/lib/supabase';
import { clearStore, initStore, useProfile } from '@/lib/store';
import { Icon } from './Icons';
import Toaster from './Toaster';

const AuthContext = createContext({ session: null, user: null });

function Ambient() {
  return (
    <>
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="wv-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e2b0" />
          <stop offset="0.45" stopColor="#d9b46c" />
          <stop offset="1" stopColor="#a9803f" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#wv-gold)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="url(#wv-gold)" strokeWidth="0.6" opacity="0.6" />
      <path d="M9 11.5 12.2 21l3.8-7.6 3.8 7.6L23 11.5" fill="none" stroke="url(#wv-gold)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
export const useAuth = () => useContext(AuthContext);

const PRIMARY = [
  { href: '/', label: 'Home', icon: Icon.Home },
  { href: '/list', label: 'My List', icon: Icon.List },
  { href: '/explore', label: 'Explore', icon: Icon.Compass },
  { href: '/search', label: 'Search', icon: Icon.Search },
];
const SECONDARY = [
  { href: '/top', label: 'Top lists', icon: Icon.Trophy },
  { href: '/stats', label: 'Stats', icon: Icon.Chart },
  { href: '/friends', label: 'Friends', icon: Icon.Users },
  { href: '/activity', label: 'History', icon: Icon.Clock },
  { href: '/import', label: 'Import', icon: Icon.Upload },
  { href: '/settings', label: 'Settings', icon: Icon.Settings },
];

export default function AppShell({ children }) {
  const sb = getSupabase();
  const path = usePathname();
  const isPublic = path.startsWith('/u/');
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (session?.user?.id) initStore(session.user.id);
    if (session === null) clearStore();
  }, [session]);

  if (!sb)
    return (
      <>
        <Ambient />
        <SetupNeeded />
      </>
    );

  if (isPublic) {
    return (
      <AuthContext.Provider value={{ session: session || null, user: session?.user || null }}>
        <Ambient />
        {session ? (
          <Frame>{children}</Frame>
        ) : (
          <>
            <header className="public-bar">
              <Link href="/" className="brand">
                <BrandMark />
                WatchVault
              </Link>
              <Link href="/" className="btn sm">
                Sign in
              </Link>
            </header>
            <main className="main">
              <div className="page-enter">{children}</div>
            </main>
          </>
        )}
        <Toaster />
      </AuthContext.Provider>
    );
  }

  if (session === undefined) return <div className="boot" aria-label="Loading" />;
  if (!session)
    return (
      <>
        <Ambient />
        <SignIn sb={sb} />
      </>
    );

  return (
    <AuthContext.Provider value={{ session, user: session.user }}>
      <Ambient />
      <Frame>{children}</Frame>
      <Toaster />
    </AuthContext.Provider>
  );
}

function Frame({ children }) {
  const path = usePathname();
  const profile = useProfile();
  const active = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  const moreActive = SECONDARY.some((l) => active(l.href)) || path === '/more';

  return (
    <div className="frame">
      <aside className="sidebar" aria-label="Main">
        <Link href="/" className="brand">
          <BrandMark />
          WatchVault
        </Link>
        <nav className="side-nav">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} className={`side-link ${active(l.href) ? 'on' : ''}`}>
              <l.icon />
              <span>{l.label}</span>
            </Link>
          ))}
          <div className="side-gap" />
          {SECONDARY.map((l) => (
            <Link key={l.href} href={l.href} className={`side-link ${active(l.href) ? 'on' : ''}`}>
              <l.icon />
              <span>{l.label}</span>
            </Link>
          ))}
        </nav>
        {profile?.username && (
          <Link href={`/u/${profile.username}`} className="side-profile">
            <span className="avatar sm">{(profile.display_name || profile.username)[0].toUpperCase()}</span>
            <span className="side-profile-name">{profile.display_name || `@${profile.username}`}</span>
          </Link>
        )}
      </aside>

      <main className="main">
        <div className="page-enter" key={path}>
          {children}
        </div>
      </main>

      <nav className="tabbar" aria-label="Main">
        {PRIMARY.map((l) => (
          <Link key={l.href} href={l.href} className={`tab ${active(l.href) ? 'on' : ''}`}>
            <l.icon />
            <span>{l.label}</span>
          </Link>
        ))}
        <Link href="/more" className={`tab ${moreActive ? 'on' : ''}`}>
          <Icon.User />
          <span>You</span>
        </Link>
      </nav>
    </div>
  );
}

export { SECONDARY };

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
    const { data, error } = await fn.call(sb.auth, { email: email.trim(), password });
    setBusy(false);
    if (error) return setMessage({ kind: 'error', text: error.message });
    if (mode === 'signup' && !data.session) {
      setMessage({ kind: 'ok', text: 'Account created. Open the confirmation email, then sign in here.' });
      setMode('signin');
    }
  }

  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <p className="auth-kicker">
            <BrandMark /> WatchVault
          </p>
          <p className="auth-line">Every story you&apos;ve ever loved, kept beautifully.</p>
        </div>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h1 className="h-page">{mode === 'signin' ? 'Sign in' : 'Create your vault'}</h1>
        <p className="muted">Movies, series, anime and dramas from every country, tracked down to the episode.</p>
        <label className="field">
          <span>Email</span>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input id="password" className="input" type="password" minLength={6} required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {message && <div className={`notice ${message.kind}`}>{message.text}</div>}
        {message?.kind === 'error' && /path|fetch|network/i.test(message.text) && (
          <p className="hint">Database address in use: {supabaseUrl()}. It should look like https://xxxx.supabase.co with nothing after it.</p>
        )}
        <button className="btn primary full" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="btn ghost full" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="center-page">
      <div className="card narrow">
        <h1 className="h-page">Almost there</h1>
        <p>
          The database isn&apos;t connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables, then redeploy.
        </p>
      </div>
    </div>
  );
}
