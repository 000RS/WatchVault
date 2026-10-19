'use client';

import { useSyncExternalStore } from 'react';

let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

/** Show a short message at the bottom of the screen. Optional action: { label, run }. */
export function toast(text, { kind = 'info', action = null, ms = 3200 } = {}) {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts.slice(-2), { id, text, kind, action }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
    () => []
  );
}
