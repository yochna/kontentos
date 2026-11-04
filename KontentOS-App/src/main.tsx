import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
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
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      <App />
      {/* Outside App on purpose: the toast that reports a station failing to load must not live
          inside the tree that just failed. */}
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);
