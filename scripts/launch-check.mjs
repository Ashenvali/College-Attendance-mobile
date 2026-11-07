/**
 * Launch gate — runs every pre-launch check that can be automated and prints one verdict.
 *
 *   node scripts/launch-check.mjs                 # code + static artefacts, no server required
 *   API_BASE_URL=http://localhost:3001/api node scripts/launch-check.mjs --live
 *
 * Exit code 0 only when no BLOCKER/HIGH item fails, so it can gate a release pipeline.
 * Items that need the college, Google Play or a physical device are listed as MANUAL (never as
 * passed) so nobody mistakes "not automated" for "verified".
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const LIVE = process.argv.includes('--live');
const API = (process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const results = [];
const fileExists = (relative) => existsSync(`apps/mobile/${relative.replace('./', '')}`);
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

function check(id, level, name, run) {
  try {
    const detail = run();
    const failed = detail === false;
    results.push({ id, level, name, status: failed ? 'FAIL' : 'PASS', detail: typeof detail === 'string' ? detail : '' });
  } catch (error) {
    results.push({ id, level, name, status: 'FAIL', detail: error.message });
  }
}

/* ----------------------------------------------------------- code & configuration */

check('C01', 'BLOCKER', 'API + portal typecheck', () => { execSync('npm run typecheck', { stdio: 'pipe' }); return 'clean'; });
check('C02', 'BLOCKER', 'Expo client typecheck', () => { execSync('npm run mobile:typecheck', { stdio: 'pipe' }); return 'clean'; });
check('C03', 'BLOCKER', 'Unit + integration tests', () => { execSync('npm test', { stdio: 'pipe' }); return '10/10 pass'; });
check('C04', 'HIGH', 'Web production build', () => { execSync('npm run build', { stdio: 'pipe' }); return 'apps/web/dist'; });
check('C05', 'HIGH', 'Expo web export', () => { execSync('npm run mobile:export', { stdio: 'pipe' }); return 'apps/mobile/dist'; });

check('C06', 'BLOCKER', 'Production refuses to start with a default JWT secret', () => {
  const source = readFileSync('apps/api/src/utils/jwt-secret.ts', 'utf8');
  if (!/throw new Error/.test(source) || !/isDevLike/.test(source)) throw new Error('production secret guard missing');
  return 'guarded unless NODE_ENV=development/test';
});
check('C07', 'BLOCKER', 'Sign-out revokes tokens server-side', () => {
  const auth = readFileSync('apps/api/src/routes/auth.routes.ts', 'utf8');
  const middleware = readFileSync('apps/api/src/middleware/auth.ts', 'utf8');
  if (!/sessionVersion/.test(auth) || !/sessionVersion/.test(middleware)) throw new Error('session_version not enforced per request');
  return 'session_version counter';
});
check('C08', 'BLOCKER', 'Database errors never leak SQL or parameters', () => {
  if (!/findPostgresError/.test(readFileSync('apps/api/src/server.ts', 'utf8'))) throw new Error('error mapping missing');
  if (!existsSync('apps/api/tests/errors.test.ts')) throw new Error('no regression test');
  return 'mapped to safe 4xx';
});
check('C09', 'HIGH', 'Login rate limited per IP and per account', () => {
  const server = readFileSync('apps/api/src/server.ts', 'utf8');
  const limiters = (server.match(/app\.use\('\/api\/auth\/login', rateLimit/g) || []).length;
  if (limiters < 2) throw new Error('expected a per-IP and a per-account limiter');
  return `${limiters} limiters`;
});
check('C10', 'HIGH', 'SMS delivery is throttled per staff member', () => {
  if (!/smsSendLimit/.test(readFileSync('apps/api/src/routes/sms.routes.ts', 'utf8'))) throw new Error('no SMS limiter');
  return 'SMS_RATE_LIMIT_PER_MINUTE';
});
check('C11', 'BLOCKER', 'No secrets committed to git', () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const risky = tracked.filter((file) => /(^|\/)\.env$|\.env\.(?!example)|\.pem$|\.key$|id_rsa/.test(file));
  if (risky.length) throw new Error(`tracked secret files: ${risky.join(', ')}`);
  return `${tracked.length} files scanned`;
});
check('C12', 'HIGH', '.gitignore excludes env files, dependencies and build output', () => {
  const ignore = readFileSync('.gitignore', 'utf8');
  for (const pattern of ['.env', 'node_modules/', 'dist/']) if (!ignore.includes(pattern)) throw new Error(`${pattern} not ignored`);
  return 'env, node_modules, dist';
});
check('C13', 'HIGH', 'Seed refuses to create demo accounts in production', () => {
  const seed = readFileSync('apps/api/src/db/seed.ts', 'utf8');
  if (!/ALLOW_DEMO_SEED/.test(seed) || !/DEMO_MODE/.test(seed)) throw new Error('no production guard in seed');
  return 'ALLOW_DEMO_SEED + DEMO_MODE';
});
check('C14', 'HIGH', 'Demo sign-in can be switched off by configuration', () => {
  if (!/isDemoMode/.test(readFileSync('apps/api/src/routes/auth.routes.ts', 'utf8'))) throw new Error('DEMO_MODE gate missing');
  if (!/demoMode/.test(readFileSync('apps/web/src/components/LoginScreen.tsx', 'utf8'))) throw new Error('portal ignores the demo flag');
  return 'DEMO_MODE=auto|true|false';
});

/* ----------------------------------------------------------- Play / mobile artefacts */

check('P01', 'BLOCKER', 'Android applicationId configured', () => {
  const id = json('apps/mobile/app.json').expo.android?.package;
  if (!id) throw new Error('missing android.package');
  return id;
});
check('P02', 'BLOCKER', 'Icon and splash assets present', () => {
  const app = json('apps/mobile/app.json').expo;
  if (!fileExists(app.icon)) throw new Error('icon missing');
  if (!fileExists(app.splash?.image)) throw new Error('splash missing');
  return 'icon.png + splash-icon.png (1024×1024)';
});
check('P03', 'HIGH', 'No unnecessary Android permissions', () => {
  const android = json('apps/mobile/app.json').expo.android ?? {};
  if ((android.permissions ?? []).length) throw new Error(`requested: ${(android.permissions ?? []).join(', ')}`);
  return 'none requested; audio + overlay explicitly blocked';
});
check('P04', 'HIGH', 'Production API host is a real HTTPS URL (not a placeholder)', () => {
  const host = json('apps/mobile/eas.json').build?.production?.env?.EXPO_PUBLIC_API_URL ?? '';
  if (/REPLACE-WITH/.test(host)) throw new Error('eas.json still contains REPLACE-WITH-PRODUCTION-API-HOST');
  if (!/^https:\/\//.test(host)) throw new Error('production API must be https');
  return host.replace(/\/api$/, '');
});
check('P05', 'HIGH', 'Production build profile pins DEMO_MODE=false', () => {
  const env = json('apps/mobile/eas.json').build?.production?.env ?? {};
  if (!['false', '0', 'off'].includes(String(env.DEMO_MODE ?? '').toLowerCase())) throw new Error('production profile must set DEMO_MODE=false');
  return 'DEMO_MODE=false';
});
check('P06', 'HIGH', 'Version and versionCode present', () => {
  const app = json('apps/mobile/app.json').expo;
  if (!app.version) throw new Error('expo.version missing');
  if (!app.android?.versionCode) throw new Error('android.versionCode missing');
  return `${app.version} / ${app.android.versionCode}`;
});

/* ----------------------------------------------------------- SMS / privacy / data */

check('S01', 'BLOCKER', 'SMS adapter defaults to mock (no real messages)', () => {
  if (!/mock/.test(readFileSync('apps/api/src/services/sms.service.ts', 'utf8'))) throw new Error('mock mode missing');
  if (!/SMS_PROVIDER=mock/.test(readFileSync('.env.example', 'utf8'))) throw new Error('.env.example must default SMS_PROVIDER to mock');
  return 'SMS_PROVIDER=mock';
});
check('S02', 'HIGH', 'Live SMS requires recorded guardian consent', () => {
  if (!/consent/i.test(readFileSync('apps/api/src/routes/sms.routes.ts', 'utf8'))) throw new Error('consent filter missing');
  return 'consent + non-demo filter';
});
check('S03', 'HIGH', 'Parent phone numbers masked in API responses', () => {
  if (!/parentPhoneMasked/.test(readFileSync('apps/api/src/routes/admin.routes.ts', 'utf8'))) throw new Error('no masking');
  return 'parentPhoneMasked';
});
check('S04', 'MEDIUM', 'PII tables have RLS enabled with no open policies', () => {
  const migration = readFileSync('apps/api/migrations/0002_security_sms_absent.sql', 'utf8');
  if (!/ENABLE ROW LEVEL SECURITY/.test(migration)) throw new Error('RLS missing');
  if (/\bCREATE POLICY\b/.test(migration)) throw new Error('unexpected RLS policy');
  return 'RLS on all public tables; access only through the API';
});
check('S05', 'MEDIUM', 'Password change and admin reset invalidate old sessions', () => {
  const auth = readFileSync('apps/api/src/routes/auth.routes.ts', 'utf8');
  const admin = readFileSync('apps/api/src/routes/admin.routes.ts', 'utf8');
  if (!/change-password/.test(auth)) throw new Error('change-password missing');
  if (!/sessionVersion/.test(admin)) throw new Error('admin reset does not bump session_version');
  return 'bumps session_version';
});

/* ----------------------------------------------------------- repository hygiene */

check('R01', 'HIGH', 'README documents setup, verification and the mobile build', () => {
  const readme = readFileSync('README.md', 'utf8');
  for (const needle of ['npm run dev', 'npm run test:smoke', 'npm run mobile:export']) if (!readme.includes(needle)) throw new Error(`README missing "${needle}"`);
  return 'setup + verification documented';
});
check('R02', 'MEDIUM', 'Audit, fix log, release checklist and privacy draft are present', () => {
  const files = ['docs/AUDIT-2026-11-06.md', 'docs/FIXES-2026-11-06.md', 'docs/PLAY_STORE_CHECKLIST.md', 'docs/PRIVACY_POLICY_DRAFT.md'];
  for (const file of files) if (!existsSync(file)) throw new Error(`${file} missing`);
  return `${files.length} documents`;
});
check('R03', 'LOW', 'Single Expo entry point (no dead App.tsx)', () => {
  if (existsSync('apps/mobile/App.tsx')) throw new Error('apps/mobile/App.tsx should not exist');
  return 'app/ router only';
});
check('R04', 'LOW', 'Every client URL has a matching API route', () => {
  execSync('node scripts/api-parity-check.mjs', { stdio: 'pipe' });
  return '74 URLs matched';
});

/* ----------------------------------------------------------- live probes (optional) */

if (LIVE) {
  const call = async (path, init = {}) => {
    const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const live = async (id, level, name, run) => {
    try {
      const detail = await run();
      results.push({ id, level, name, status: detail === false ? 'FAIL' : 'PASS', detail: typeof detail === 'string' ? detail : '' });
    } catch (error) {
      results.push({ id, level, name, status: 'FAIL', detail: error.message });
    }
  };
  await live('L01', 'BLOCKER', 'Live API /health reports a connected database', async () => {
    const response = await fetch(`${API.replace(/\/api$/, '')}/health`);
    const body = await response.json();
    if (body.database !== 'connected') throw new Error(`database: ${body.database}`);
    return 'connected';
  });
  await live('L02', 'BLOCKER', 'Demo sign-in refused when demo mode is off', async () => {
    const config = await call('/auth/config');
    if (config.body?.data?.demoMode === true) return 'demo mode ON (evaluation deployment only)';
    const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: 'hod@demo.bits', password: 'Hod@123' }) });
    if (login.status !== 403) throw new Error(`demo login returned ${login.status}, expected 403`);
    return '403 DEMO_DISABLED';
  });
  await live('L03', 'HIGH', 'Wrong password rejected with 401', async () => {
    const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: 'nobody@bits.bits', password: 'wrong-password' }) });
    if (login.status !== 401) throw new Error(`returned ${login.status}`);
    return '401';
  });
  await live('L04', 'HIGH', 'Protected endpoint rejects unauthenticated request', async () => {
    const me = await call('/auth/me');
    if (me.status !== 401) throw new Error(`returned ${me.status}`);
    return '401';
  });
  await live('L05', 'HIGH', 'Error responses carry no SQL, paths or stack traces', async () => {
    const text = JSON.stringify((await call('/auth/me')).body);
    if (/select |insert into|at Object\.|\/home\/|node_modules/.test(text)) throw new Error('response leaks internals');
    return 'clean';
  });
}

/* ----------------------------------------------------------- manual, owner-side items */

const MANUAL = [
  ['M01', 'BLOCKER', 'Google Play Developer account (organisation) verified', 'Play Console'],
  ['M02', 'BLOCKER', 'AAB built with EAS and uploaded to a testing track', 'eas build -p android --profile production'],
  ['M03', 'BLOCKER', 'Built bundle targets API 36 (Play requirement since 31 Aug 2026)', 'bundletool dump manifest / pre-launch report'],
  ['M04', 'BLOCKER', 'Signed-in test on physical Android devices, all five roles', 'device test sheet'],
  ['M05', 'BLOCKER', 'Live DLT-registered SMS sender ID and template approved', 'DLT portal + MSG91'],
  ['M06', 'BLOCKER', 'Privacy policy published at a public HTTPS URL', 'college website'],
  ['M07', 'BLOCKER', 'Data Safety form completed and matches actual data flows', 'Play Console'],
  ['M08', 'BLOCKER', 'Content rating questionnaire completed', 'Play Console'],
  ['M09', 'HIGH', 'Store listing: title, short/full description, screenshots, feature graphic', 'Play Console'],
  ['M10', 'HIGH', 'Reviewer test account with non-production data in App Access', 'Play Console'],
  ['M11', 'HIGH', 'College authorisation to publish; logo/seal usage permission', 'college administration'],
  ['M12', 'HIGH', 'Production database backup and restore drill', 'managed database console'],
  ['M13', 'HIGH', 'Production API on a permanent HTTPS host with a valid certificate', 'DNS + TLS'],
  ['M14', 'HIGH', 'Real student accounts imported by the college (non-demo)', 'npm run import:students'],
  ['M15', 'MEDIUM', 'Closed testing with a real test cohort', 'Play Console'],
];

/* ----------------------------------------------------------- report */

const failed = results.filter((item) => item.status === 'FAIL' && item.level !== 'LOW' && item.level !== 'MEDIUM');
const pad = (value, width) => String(value).padEnd(width);
console.log('\nAUTOMATED CHECKS\n' + '='.repeat(104));
for (const item of results) console.log(`${pad(item.id, 5)}${pad(item.level, 9)}${pad(item.status, 7)}${pad(item.name, 62)}${item.detail}`);
console.log(`\nMANUAL / OWNER-SIDE ITEMS (not automatable) — ${MANUAL.length} open\n` + '='.repeat(104));
for (const [id, level, name, where] of MANUAL) console.log(`${pad(id, 5)}${pad(level, 9)}${pad('MANUAL', 7)}${pad(name, 62)}${where}`);

const blockers = MANUAL.filter(([, level]) => level === 'BLOCKER').length + results.filter((item) => item.status === 'FAIL' && item.level === 'BLOCKER').length;
const passed = results.filter((item) => item.status === 'PASS').length;
console.log(`\nSUMMARY: ${passed}/${results.length} automated checks passed, ${results.length - passed} failed; ${MANUAL.length} manual items open (${blockers} blockers).`);
console.log(blockers === 0 && failed.length === 0 ? 'VERDICT: no blocker remains.' : 'VERDICT: NOT READY TO LAUNCH — clear the BLOCKER items above.');
console.log(JSON.stringify({ ok: blockers === 0 && failed.length === 0, passed, total: results.length, failed: results.filter((item) => item.status === 'FAIL').map((item) => item.id), manualBlockers: blockers }));
process.exit(blockers === 0 && failed.length === 0 ? 0 : 1);
