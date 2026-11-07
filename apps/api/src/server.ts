import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { pool } from './db/client';
import { authRouter } from './routes/auth.routes';
import { attendanceRouter } from './routes/attendance.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { noticesRouter } from './routes/notices.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { resourcesRouter } from './routes/resources.routes';
import { marksRouter } from './routes/marks.routes';
import { smsRouter } from './routes/sms.routes';
import { adminRouter } from './routes/admin.routes';
import { smsWebhookRouter } from './routes/sms-webhook.routes';
import { duplicateMessage, fail } from './utils/http';
import { assertProductionJwtSecret } from './utils/jwt-secret';

if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');
  assertProductionJwtSecret();
}

const app = express();
app.disable('x-powered-by');
// Set TRUST_PROXY to the number of reverse-proxy hops in front of the API (e.g. 1) so per-IP limits see the real client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false, xFrameOptions: false }));
const allowedOrigins = (process.env.WEB_ORIGIN ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));
app.use(express.json({ limit: '2mb' }));
// Two limiters: per client IP (stops password spraying across accounts) and per IP+account (a victim cannot be locked out from other IPs).
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `ip:${req.ip ?? 'unknown'}` }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `acct:${req.ip ?? 'unknown'}:${String(req.body?.identifier ?? '').trim().toLowerCase() || 'missing'}` }));
app.get('/health', async (_req, res) => { try { await pool.query('select 1'); res.json({ success: true, service: 'BITS Kurnool API', database: 'connected' }); } catch { res.status(503).json({ success: false, message: 'Database unavailable' }); } });
app.get('/api/openapi.json', (_req, res) => res.sendFile(path.resolve(process.cwd(), 'docs/openapi.json')));
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/modules', resourcesRouter);
app.use('/api/marks', marksRouter);
app.use('/api/sms-webhook', smsWebhookRouter);
app.use('/api/sms', smsRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, res) => fail(res, 404, 'API route not found', 'NOT_FOUND'));

/**
 * Static front ends served by this process.
 *  - apps/mobile/dist  (Expo web export) at /mobile  — the same client code as the Android/iOS build
 *  - apps/web/dist     (React portal)      at /        — always registered last (SPA fallback)
 * Both talk to the API at the same origin, so no EXPO_PUBLIC_API_URL host is baked in.
 */
const mobileDist = path.resolve(__dirname, '../../mobile/dist');
const webDist = path.resolve(__dirname, '../../web/dist');

if (fs.existsSync(mobileDist)) {
  // Express matches '/mobile' and '/mobile/' with the same pattern, so guard on the exact path.
  app.get('/mobile', (req, res) => (req.path === '/mobile' ? res.redirect(301, '/mobile/') : res.sendFile(path.join(mobileDist, 'index.html'))));
  app.use('/mobile', express.static(mobileDist, { index: 'index.html', maxAge: '1h' }));
  // Expo static export emits <route>.html files; deep links (e.g. /mobile/login) resolve to them.
  app.get('/mobile/{*splat}', (req, res) => {
    const relative = req.path.replace(/^\/mobile\/?/, '').replace(/\/$/, '');
    const candidate = path.join(mobileDist, `${relative}.html`);
    if (relative && fs.existsSync(candidate)) return res.sendFile(candidate);
    return res.sendFile(path.join(mobileDist, 'index.html'));
  });
}

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return fail(res, 400, error.issues[0]?.message || 'Invalid request', 'VALIDATION_ERROR');
  // Never echo raw SQL or parameter values back to clients: they can contain hashes or personal data.
  console.error('[api-error]', error instanceof Error ? error.message : String(error));
  // Drizzle wraps driver errors (DrizzleQueryError.cause), so walk the chain for a PG error code.
  const pgError = findPostgresError(error);
  if (pgError?.code === '23505') return fail(res, 409, duplicateMessage(pgError.constraint), 'DUPLICATE_RECORD');
  if (pgError?.code === '23503') return fail(res, 409, 'This record is still referenced by other records and cannot be changed.', 'FOREIGN_KEY_VIOLATION');
  if (pgError?.code === '23502') return fail(res, 400, 'A required value is missing.', 'VALIDATION_ERROR');
  if (pgError?.code === '22P02') return fail(res, 400, 'One of the submitted identifiers is not valid.', 'VALIDATION_ERROR');
  return fail(res, 500, process.env.NODE_ENV === 'production' ? 'Unexpected server error' : error instanceof Error ? error.message : 'Unexpected server error', 'INTERNAL_ERROR');
});


/** Drizzle wraps driver errors (DrizzleQueryError.cause), so walk the chain for a PostgreSQL error code. */
function findPostgresError(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return { code: candidate.code, constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined };
    }
    current = candidate.cause;
  }
  return {};
}

const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '0.0.0.0', () => console.log(`BITS Kurnool API listening on http://0.0.0.0:${port}`));
const shutdown = async () => { server.close(); await pool.end(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
