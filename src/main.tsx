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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Ohne Service Worker funktioniert die App weiterhin. */
    });
  });
}
