/**
 * Bakes the API base URL into an Expo export.
 *
 * The mobile client reads EXPO_PUBLIC_API_URL and has no built-in fallback host (a release build
 * must never silently talk to an unknown server). For the same-origin browser demo we export with
 * API_BASE_URL=/api, then Express serves that export at /mobile and proxies /api to the API.
 *
 * Usage:  node scripts/mobile-export.mjs [--api-base http://host:3001/api] [--out apps/mobile/dist]
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const apiBase = option('--api-base', process.env.EXPO_PUBLIC_API_URL || '/api');
const outDir = option('--out', 'apps/mobile/dist');

if (!existsSync(path.resolve('apps/mobile/app.json'))) {
  console.error('Run this script from the repository root.');
  process.exit(1);
}
if (!/^https:\/\//.test(apiBase) && apiBase !== '/api') {
  console.warn(`[mobile-export] Warning: ${apiBase} is not an https URL. Use https for device/release builds.`);
}

console.log(`[mobile-export] EXPO_PUBLIC_API_URL=${apiBase}  ->  ${outDir}`);
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', path.resolve(outDir), '--clear'], {
  cwd: path.resolve('apps/mobile'),
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_API_URL: apiBase, NODE_ENV: process.env.NODE_ENV || 'production' },
});
if (result.status !== 0) {
  console.error('[mobile-export] Export failed.');
  process.exit(result.status ?? 1);
}
console.log('[mobile-export] Done. Serve the output with `npm run dev` and open /mobile/');
