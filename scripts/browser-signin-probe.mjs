/**
 * Browser-level reproduction of the portal sign-in flow.
 *
 * Loads the real React app in jsdom (the DOM the browser uses), types into the sign-in form,
 * clicks "Sign in", and reports whether the app shell (dashboard) replaced the login form — or
 * whether an exception / error message appeared instead.
 *
 *   node scripts/browser-signin-probe.mjs
 *   API_BASE=http://127.0.0.1:3001/api node scripts/browser-signin-probe.mjs hod@demo.bits Hod@123
 */
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3001/api';
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const identifier = positional[0] || 'hod@demo.bits';
const password = positional[1] || 'Hod@123';

const BLOCK_STORAGE = process.argv.includes('--block-storage');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:3000/', pretendToBeVisual: true });
const { window } = dom;
if (BLOCK_STORAGE) {
  const deny = () => { throw new window.DOMException('The operation is insecure.', 'SecurityError'); };
  for (const store of ['sessionStorage', 'localStorage']) {
    Object.defineProperty(window, store, { configurable: true, get: () => ({ getItem: deny, setItem: deny, removeItem: deny, clear: deny, key: deny, length: 0 }) });
  }
  console.log('MODE: storage blocked (sandboxed iframe / privacy mode simulation)');
}
const globals = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'sessionStorage', 'localStorage', 'MutationObserver', 'SVGElement'];
for (const key of globals) {
  try { globalThis[key] = window[key]; } catch { Object.defineProperty(globalThis, key, { value: window[key], configurable: true }); }
}
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* keep node's navigator */ }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one. Browsers provide it.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = globalThis.ResizeObserver;
}

const errors = [];
window.addEventListener('error', (event) => errors.push(`window error: ${event.message}`));
const originalError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); };

// The app calls relative /api URLs; point them at the API server.
const nativeFetch = globalThis.fetch;
const fetchProxy = (input, init) => {
  const url = String(input);
  if (url.startsWith('/api')) return nativeFetch(`${API_BASE.replace(/\/api$/, '')}${url}`, init);
  return nativeFetch(url, init);
};
globalThis.fetch = fetchProxy;
window.fetch = fetchProxy;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => window.document.body.textContent ?? '';

const vite = await createServer({ root: 'apps/web', configFile: 'apps/web/vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { createRoot } = await import('react-dom/client');
  const { createElement, StrictMode } = await import('react');
  const { AuthProvider } = await vite.ssrLoadModule('/src/contexts/AuthContext.tsx');
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx');

  const root = createRoot(window.document.getElementById('root'));
  root.render(createElement(StrictMode, null, createElement(AuthProvider, null, createElement(App))));
  await wait(600);

  const signInButton = [...window.document.querySelectorAll('button')].find((b) => /sign in/i.test(b.textContent ?? ''));
  if (!signInButton) throw new Error('no "Sign in" button found on the login screen');
  console.log('login screen reached:', /Sign in to your portal/i.test(text()));

  const inputs = [...window.document.querySelectorAll('input')];
  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  setValue(inputs[0], identifier);
  setValue(inputs[1], password);
  await wait(50);

  signInButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(2500);

  const body = text();
  const reachedDashboard = /Dashboard/i.test(body) && !/Sign in to your portal/i.test(body);
  console.log('post-click: url =', window.location.href);
  console.log('post-click: login form still visible =', /Sign in to your portal/i.test(body));
  console.log('post-click: dashboard heading present =', /Breadcrumbs|Dashboard|Good (morning|afternoon|evening)/i.test(body));
  let tokenPersisted = false;
  try { tokenPersisted = Boolean(window.sessionStorage.getItem('bits-token')); } catch { tokenPersisted = false; }
  console.log('token stored in sessionStorage =', tokenPersisted, BLOCK_STORAGE ? '(expected false: storage blocked)' : '');
  console.log('visible excerpt:', body.replace(/\s+/g, ' ').slice(0, 220));
  if (errors.length) { console.log('\n--- console errors / exceptions ---'); for (const error of [...new Set(errors)]) console.log(error.slice(0, 400)); }
  console.log(`\nRESULT: ${reachedDashboard ? 'REACHED DASHBOARD' : 'STUCK ON LOGIN'}`);
  console.error = originalError;
  process.exit(reachedDashboard ? 0 : 1);
} finally {
  await vite.close();
}
