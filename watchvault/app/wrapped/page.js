'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WrappedIndex() {
  const router = useRouter();
  useEffect(() => router.replace(`/wrapped/${new Date().getFullYear()}`), [router]);
  return null;
}
