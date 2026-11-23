/**
 * API contract sanity check (static analysis, no server needed).
 *
 * Collects every URL the web portal and the Expo client call, and every router path + mount
 * prefix the API declares, then reports client URLs that no router can serve. This catches the
 * classic "screen calls an endpoint that does not exist" defect without a browser.
 *
 *   node scripts/api-parity-check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

const clientFiles = [
  ...walk('apps/web/src'),
  ...walk('apps/mobile/app'),
  ...walk('apps/mobile/src'),
].filter((file) => /\.(ts|tsx)$/.test(file));

const RESOURCES = ['auth', 'dashboard', 'attendance', 'notices', 'notifications', 'modules', 'marks', 'sms', 'admin'];
const calls = new Map();
for (const file of clientFiles) {
  for (const match of readFileSync(file, 'utf8').matchAll(/['"`](\/[a-z][a-z0-9-]*(?:\/[^'"`$\s]*)?)/g)) {
    const url = match[1];
    if (!RESOURCES.includes(url.split('/')[1])) continue;
    calls.set(`${file} -> ${url}`, url);
  }
}

// Declared routes, with the prefix each router is mounted on (see apps/api/src/server.ts).
const mounts = { auth: '/api/auth', dashboard: '/api/dashboard', attendance: '/api/attendance', notices: '/api/notices',
  notifications: '/api/notifications', modules: '/api/modules', marks: '/api/marks', sms: '/api/sms', admin: '/api/admin' };
const routes = new Set();
// resources.routes.ts is mounted at /api/modules and serves every ?resource name via /:resource.
const mountName = (file) => (path.basename(file) === 'resources.routes.ts' ? 'modules' : path.basename(file).replace('.routes.ts', ''));
for (const file of walk('apps/api/src/routes')) {
  const resource = mountName(file);
  if (!mounts[resource]) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]*)/g)) {
    const declared = match[2];
    const suffix = declared === '/' ? '' : declared;
    routes.add(`${mounts[resource]}${suffix}`.replace(/\/$/, ''));
  }
}

/**
 * Segment-wise match. A client URL matches when every static segment of a declared route lines up
 * with the same position (params match anything, and the client URL may stop early because template
 * literals like `/sms/campaigns/${id}/send` are captured only up to the first `${`).
 */
const segmentsOf = (route) => route.replace(/\?.*$/, '').split('/').filter(Boolean);
const matches = (declared, requested) => {
  const routeSegments = segmentsOf(declared).filter((segment) => segment !== 'api');
  const urlSegments = segmentsOf(requested);
  let index = 0;
  for (const segment of routeSegments) {
    if (index >= urlSegments.length) return true;
    if (segment.startsWith(':')) { index += 1; continue; }
    if (segment !== urlSegments[index]) return false;
    index += 1;
  }
  return true;
};

const unmatched = [];
for (const [entry, url] of calls) {
  if (![...routes].some((route) => matches(route, url))) unmatched.push(entry);
}

console.log(JSON.stringify({ ok: unmatched.length === 0, clientCalls: calls.size, apiRoutes: routes.size, unmatched: unmatched.sort() }, null, 2));
if (unmatched.length) process.exit(1);
