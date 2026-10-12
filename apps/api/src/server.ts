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
import { fail } from './utils/http';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/health', async (_req, res) => { try { await pool.query('select 1'); res.json({ success: true, service: 'BITS Kurnool API', database: 'connected' }); } catch { res.status(503).json({ success: false, message: 'Database unavailable' }); } });
app.get('/api/openapi.json', (_req, res) => res.sendFile(path.resolve(process.cwd(), 'docs/openapi.json')));
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/modules', resourcesRouter);
app.use('/api/marks', marksRouter);
app.use('/api/sms', smsRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, res) => fail(res, 404, 'API route not found', 'NOT_FOUND'));

const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof ZodError) return fail(res, 400, error.issues[0]?.message || 'Invalid request', 'VALIDATION_ERROR');
  return fail(res, 500, process.env.NODE_ENV === 'production' ? 'Unexpected server error' : error instanceof Error ? error.message : 'Unexpected server error', 'INTERNAL_ERROR');
});
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '0.0.0.0', () => console.log(`BITS Kurnool API listening on http://0.0.0.0:${port}`));
const shutdown = async () => { server.close(); await pool.end(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
