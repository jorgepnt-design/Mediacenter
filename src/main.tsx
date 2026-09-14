import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Wurzelelement nicht gefunden.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: Service Worker registrieren (rein lokaler Cache, keine Datenuebertragung).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    const buildId = new URL(import.meta.url).pathname.split('/').pop() ?? 'current';
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(buildId)}`, { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {
        /* Ohne Service Worker funktioniert die App weiterhin. */
      });
  });
}
