import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Lazy stations are separate chunks with build-specific names. After a deploy an already-open tab
// asks the server for names that no longer exist, which would leave a blank bench; reload instead.
let reloaded = false;
window.addEventListener('vite:preloadError', () => {
  if (reloaded) return;
  reloaded = true;
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
