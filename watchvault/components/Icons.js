// Small line icons, drawn to match the system font's stroke weight.

const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const Icon = {
  Home: (p) => (
    <svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></svg>
  ),
  List: (p) => (
    <svg {...base} {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="9" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /></svg>
  ),
  Compass: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
  ),
  Search: (p) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  Chart: (p) => (
    <svg {...base} {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>
  ),
  Trophy: (p) => (
    <svg {...base} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M9 21h6M10 17h4" /></svg>
  ),
  Users: (p) => (
    <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>
  ),
  Clock: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  Upload: (p) => (
    <svg {...base} {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
  ),
  Settings: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>
  ),
  User: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
  ),
  Check: (p) => (
    <svg {...base} strokeWidth={2.4} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
  ),
  More: (p) => (
    <svg {...base} {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
  ),
  Plus: (p) => (
    <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
  ),
  Minus: (p) => (
    <svg {...base} {...p}><path d="M5 12h14" /></svg>
  ),
  Back: (p) => (
    <svg {...base} {...p}><path d="M15 5 8 12l7 7" /></svg>
  ),
  Close: (p) => (
    <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
  ),
  Up: (p) => (
    <svg {...base} {...p}><path d="m6 15 6-6 6 6" /></svg>
  ),
  Down: (p) => (
    <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
  ),
  Star: (p) => (
    <svg {...base} {...p}><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" /></svg>
  ),
  Grid: (p) => (
    <svg {...base} {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
  ),
  Rows: (p) => (
    <svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
  ),
  Select: (p) => (
    <svg {...base} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
  ),
  Refresh: (p) => (
    <svg {...base} {...p}><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 21v-5h-5" /></svg>
  ),
  Link: (p) => (
    <svg {...base} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
  ),
  Calendar: (p) => (
    <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
  ),
  Book: (p) => (
    <svg {...base} {...p}><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z" /><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20" /></svg>
  ),
  Spark: (p) => (
    <svg {...base} {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>
  ),
  Stack: (p) => (
    <svg {...base} {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>
  ),
  Blend: (p) => (
    <svg {...base} {...p}><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></svg>
  ),
  Message: (p) => (
    <svg {...base} {...p}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
  ),
  Inbox: (p) => (
    <svg {...base} {...p}><path d="M3 13 5.5 5h13L21 13v6H3z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></svg>
  ),
  Download: (p) => (
    <svg {...base} {...p}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 19h16" /></svg>
  ),
  Share: (p) => (
    <svg {...base} {...p}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 12v8h14v-8" /></svg>
  ),
  Heart: (p) => (
    <svg {...base} {...p}><path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 9-2 4.6 4.6 0 0 1 9 2c-2 4.6-9 9-9 9z" /></svg>
  ),
};
