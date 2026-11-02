import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './studio.css';

const el = document.getElementById('studio-root');
if (!el) throw new Error('Studio root missing');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);
