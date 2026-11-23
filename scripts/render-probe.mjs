/**
 * Headless reproduction of "clicking Sign in does not reach the dashboard".
 *
 * Runs the real portal code (App + LoginScreen + Dashboard) through React's server renderer with a
 * real session token, so a render-time exception surfaces here instead of only in the browser.
 *
 *   node scripts/render-probe.mjs <role>      # role: student | faculty | hod | principal | admin
 */
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const role = process.argv[2] ?? 'hod';
const credentials = {
  student: ['student@demo.bits', 'Student@123'],
  faculty: ['faculty@demo.bits', 'Faculty@123'],
  hod: ['hod@demo.bits', 'Hod@123'],
  principal: ['principal@demo.bits', 'Principal@123'],
  admin: ['admin@demo.bits', 'Admin@123'],
}[role];
if (!credentials) { console.error('unknown role'); process.exit(2); }

const API = 'http://127.0.0.1:3001/api';
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials[0], password: credentials[1] }) });
const { data } = await login.json();
if (!data?.token) { console.error('login failed'); process.exit(1); }

const vite = await createServer({ root: 'apps/web', configFile: 'apps/web/vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  // Pre-populate the token the way the browser does, so AuthProvider's bootstrap path runs.
  const store = new Map([['bits-token', data.token]]);
  globalThis.sessionStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.window = { sessionStorage: globalThis.sessionStorage, addEventListener() {}, removeEventListener() {}, scrollTo() {}, dispatchEvent() {} };
  globalThis.fetch = (input, init) => fetch(String(input).startsWith('/api') ? `http://127.0.0.1:3001${input}` : input, init);

  const { AuthProvider } = await vite.ssrLoadModule('/src/contexts/AuthContext.tsx');
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
  const { LoginScreen } = await vite.ssrLoadModule('/src/components/LoginScreen.tsx');
  const { Dashboard } = await vite.ssrLoadModule('/src/components/Dashboard.tsx');

  // 1. The sign-in screen itself must render.
  const loginHtml = renderToString(createElement(AuthProvider, null, createElement(LoginScreen)));
  console.log(`LoginScreen rendered: ${loginHtml.length} bytes`);

  // 2. The dashboard must render for this role (the post-login destination).
  const user = data.user;
  const dashboardHtml = renderToString(createElement(Dashboard, { user, onNavigate() {} }));
  console.log(`Dashboard rendered: ${dashboardHtml.length} bytes`);

  // 3. The whole app with a session present must render the shell, not the login form.
  const appHtml = renderToString(createElement(AuthProvider, null, createElement(App)));
  console.log(`App (initial, loading) rendered: ${appHtml.length} bytes`);
  console.log('OK — no render exception');
} finally {
  await vite.close();
}
