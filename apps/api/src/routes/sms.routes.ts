import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { smsCampaigns, smsRecipients, users } from '../db/schema';
import { allowRoles, requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { smsProvider } from '../services/sms.service';
import { writeAudit } from '../services/audit.service';

export const smsRouter = Router(); smsRouter.use(requireAuth); smsRouter.use(allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL'));
smsRouter.get('/campaigns', async (_req, res, next) => { try { return ok(res, await db.select().from(smsCampaigns).orderBy(desc(smsCampaigns.createdAt)).limit(100)); } catch (e) { next(e); } });
smsRouter.post('/campaigns', async (req, res, next) => {
  try { const v = z.object({ name: z.string().min(3).max(160), message: z.string().min(1).max(1000), audience: z.enum(['ALL_STUDENTS', 'FACULTY', 'DEPARTMENT']).default('ALL_STUDENTS'), scheduledAt: z.string().optional() }).safeParse(req.body); if (!v.success) return fail(res, 400, v.error.issues[0]?.message || 'Invalid campaign');
    const [campaign] = await db.insert(smsCampaigns).values({ ...v.data, scheduledAt: v.data.scheduledAt ? new Date(v.data.scheduledAt) : null, createdBy: req.user!.id, status: v.data.scheduledAt ? 'QUEUED' : 'DRAFT' }).returning();
    await writeAudit({ actorId: req.user!.id, action: 'SMS_CAMPAIGN_CREATED', module: 'SMS', recordId: campaign.id, ip: req.ip }); return ok(res, campaign, 'Campaign created', 201);
  } catch (e) { next(e); }
});
smsRouter.post('/campaigns/:id/send', async (req, res, next) => {
  try { const [campaign] = await db.select().from(smsCampaigns).where(eq(smsCampaigns.id, req.params.id)).limit(1); if (!campaign) return fail(res, 404, 'Campaign not found');
    const recipients = await db.select({ id: users.id, phone: users.phone }).from(users).where(eq(users.role, campaign.audience === 'FACULTY' ? 'FACULTY' : 'STUDENT'));
    const provider = smsProvider(); const results = await Promise.all(recipients.filter((r) => r.phone).map(async (r) => ({ userId: r.id, phone: r.phone!, ...(await provider.send({ phone: r.phone!, message: campaign.message })) })));
    await db.insert(smsRecipients).values(results.map((r) => ({ campaignId: campaign.id, userId: r.userId, phone: r.phone, status: r.status === 'MOCKED' ? 'PENDING' : r.status, providerId: r.providerId ?? null })));
    const status = process.env.SMS_PROVIDER === 'http' ? (results.some((r) => r.status === 'FAILED') ? 'PARTIAL' : 'SENT') : 'SENT';
    const [updated] = await db.update(smsCampaigns).set({ status, updatedAt: new Date() }).where(eq(smsCampaigns.id, campaign.id)).returning();
    await writeAudit({ actorId: req.user!.id, action: 'SMS_CAMPAIGN_SEND', module: 'SMS', recordId: campaign.id, newValue: { recipients: results.length, providerMode: process.env.SMS_PROVIDER || 'mock' }, ip: req.ip });
    return ok(res, { campaign: updated, recipients: results.length, mode: process.env.SMS_PROVIDER === 'http' ? 'gateway' : 'mock', warning: process.env.SMS_PROVIDER === 'http' ? undefined : 'Mock mode only: no SMS was transmitted.' }, 'Campaign processed');
  } catch (e) { next(e); }
});
