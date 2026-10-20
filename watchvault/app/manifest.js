export default function manifest() {
  return {
    name: 'WatchVault',
    short_name: 'WatchVault',
    description: 'Your anime, movies, series and dramas in one list.',
    start_url: '/',
    display: 'standalone',
    background_color: '#111113',
    theme_color: '#111113',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Up next', url: '/' },
      { name: 'Explore', url: '/explore' },
      { name: 'Diary', url: '/diary' },
    ],
  };
}
