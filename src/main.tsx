import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { installApiAuthFetch } from './lib/installApiAuthFetch';
import { initSentry } from './lib/sentry';
import { checkFrontendEnv } from './lib/env';

// --- ENV validation with clear message before any other logic ---
const envCheck = checkFrontendEnv();
if (!envCheck.isValid) {
  // Clear console error
  console.error(
    `[RAFD ENV FATAL] Missing required env vars: ${envCheck.missing.join(', ')}\n` +
    `Crie .env.local from .env.example or set Vercel/GitHub Variables.\n` +
    `Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY\n` +
    `See docs/SETUP.md`
  );

  // In development, show visible overlay with missing vars
  if (import.meta.env.DEV) {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="font-family: sans-serif; padding: 24px; max-width: 640px; margin: 40px auto; border: 2px solid #dc2626; border-radius: 12px; background: #fef2f2; color: #991b1b; direction: ltr;">
          <h1 style="font-size: 20px; margin: 0 0 12px;">RAFD - Missing Environment Variables</h1>
          <p style="margin: 0 0 12px;">The app cannot start because required Supabase env vars are missing:</p>
          <ul style="margin: 0 0 12px 20px; font-family: monospace; background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #fecaca;">
            ${envCheck.missing.map(k => `<li><strong>${k}</strong> is missing or empty</li>`).join('')}
          </ul>
          <p style="margin: 0 0 8px;"><strong>Fix:</strong></p>
          <ol style="margin: 0 0 12px 20px;">
            <li>Copy <code>.env.example</code> to <code>.env.local</code>: <code>cp .env.example .env.local</code></li>
            <li>Fill <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from Supabase Dashboard → Settings → API</li>
            <li>Also set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> for api/*</li>
            <li>Restart dev server: <code>npm run dev</code></li>
          </ol>
          <p style="margin:0;font-size: 12px; opacity: 0.8;">Docs: .env.example, docs/SETUP.md, supabase/README.md<br/>This overlay only shows in development (import.meta.env.DEV).</p>
        </div>
      `;
    }
    // Do not proceed to render App, fail fast with clear message
    throw new Error(`[RAFD] Missing env vars: ${envCheck.missing.join(', ')}`);
  }
}

installApiAuthFetch();
initSentry();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
