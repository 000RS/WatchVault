import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: { default: 'WatchVault', template: '%s · WatchVault' },
  description: 'Everything you have watched: movies, series, anime and dramas from every country, tracked down to the episode.',
  appleWebApp: { capable: true, title: 'WatchVault', statusBarStyle: 'black-translucent' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#111113',
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
