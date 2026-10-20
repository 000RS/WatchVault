'use client';

import Link from 'next/link';
import { secondaryFor } from '@/components/AppShell';
import { useProfile } from '@/lib/store';

export default function MorePage() {
  const profile = useProfile();
  return (
    <>
      <h1 className="h-page">You</h1>
      {profile?.username && (
        <Link href={`/u/${profile.username}`} className="person panel">
          <span className="avatar md">{(profile.display_name || profile.username)[0].toUpperCase()}</span>
          <span className="person-name">
            <b>{profile.display_name || `@${profile.username}`}</b>
            <span className="muted small">View your profile</span>
          </span>
        </Link>
      )}
      <nav className="group">
        {secondaryFor(profile).map((l) => (
          <Link key={l.href} href={l.href} className="group-row">
            <span className="row">
              <l.icon />
              <b>{l.label}</b>
            </span>
          </Link>
        ))}
      </nav>
    </>
  );
}
