export default function manifest() {
  return {
    name: 'WatchVault',
    short_name: 'WatchVault',
    description: 'Your anime, movies, series and dramas in one list.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0912',
    theme_color: '#b45cff',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
