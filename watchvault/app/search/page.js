'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Search now lives at the top of Explore.
export default function SearchRedirect() {
  const router = useRouter();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') || '';
    router.replace(`/explore${q ? `?q=${encodeURIComponent(q)}` : '?search=1'}`);
  }, [router]);
  return null;
}
