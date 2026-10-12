import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { notifications } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get('/', async (req, res, next) => { try { const rows = await db.select().from(notifications).where(eq(notifications.recipientId, req.user!.id)).orderBy(desc(notifications.createdAt)).limit(100); return ok(res, rows); } catch (e) { next(e); } });
notificationsRouter.patch('/read-all', async (req, res, next) => { try { await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.recipientId, req.user!.id), isNull(notifications.readAt))); return ok(res, { read: true }, 'All notifications marked as read'); } catch (e) { next(e); } });
notificationsRouter.patch('/:id/read', async (req, res, next) => { try { const [row] = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, req.params.id), eq(notifications.recipientId, req.user!.id))).returning(); if (!row) return fail(res, 404, 'Notification not found'); return ok(res, row); } catch (e) { next(e); } });
