export default function manifest() {
  return {
    name: 'WatchVault',
    short_name: 'WatchVault',
    description: 'Your anime, movies, series and dramas in one list.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1118',
    theme_color: '#c2185b',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
