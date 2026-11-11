'use client';

import { useEffect, useRef, useState } from 'react';

// Leaflet + OpenStreetMap tiles, loaded only when a map is shown. Free, no key.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let loading = null;
function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.L) return Promise.resolve(window.L);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${LEAFLET}leaflet.css`;
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = `${LEAFLET}leaflet.js`;
      s.async = true;
      s.onload = () => resolve(window.L);
      s.onerror = () => {
        loading = null;
        reject(new Error('Map unavailable'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** points: [{ key, lat, lon, label, sub, done }] */
export default function MapView({ points, onPick, height = 420 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadLeaflet()
      .then((L) => {
        if (!live || !el.current || map.current) return;
        map.current = L.map(el.current, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([20, 10], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        draw(L);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function draw(L) {
    if (!layer.current) return;
    layer.current.clearLayers();
    const ll = [];
    for (const p of points) {
      if (p.lat == null || p.lon == null) continue;
      const m = L.circleMarker([p.lat, p.lon], { radius: 7, weight: 2, color: '#fbf4f1', fillColor: p.done ? '#7fae8e' : '#c9545f', fillOpacity: 0.95 });
      m.bindTooltip(`<b>${escapeHtml(p.label)}</b>${p.sub ? `<br>${escapeHtml(p.sub)}` : ''}`);
      if (onPick) m.on('click', () => onPick(p));
      m.addTo(layer.current);
      ll.push([p.lat, p.lon]);
    }
    if (ll.length === 1) map.current.setView(ll[0], 13);
    else if (ll.length > 1) map.current.fitBounds(ll, { padding: [30, 30], maxZoom: 12 });
  }

  useEffect(() => {
    if (window.L && map.current) draw(window.L);
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="hint">The map couldn&apos;t load right now. Everything is listed below.</p>;
  return <div ref={el} className="map-view" style={{ height }} role="region" aria-label="Map" />;
}

const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
