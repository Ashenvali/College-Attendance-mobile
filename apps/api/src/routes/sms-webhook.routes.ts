import { Router } from 'express';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { smsRecipients } from '../db/schema';
import { fail, ok } from '../utils/http';

/**
 * Provider delivery-report (DLR) callback. NOT YET VERIFIED against live MSG91 payloads:
 * confirm field names/status codes in the MSG91 dashboard before enabling in production.
 * Authenticated with SMS_WEBHOOK_SECRET (header x-webhook-secret or ?secret=). Disabled when unset.
 */
export const smsWebhookRouter = Router();
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

smsWebhookRouter.post('/msg91', async (req, res, next) => {
  try {
    const secret = process.env.SMS_WEBHOOK_SECRET;
    const given = String(req.headers['x-webhook-secret'] ?? req.query.secret ?? '');
    if (!secret || secret.length < 16 || !safeEqual(secret, given)) return fail(res, 401, 'Unauthorized', 'UNAUTHENTICATED');
    const events: Array<Record<string, unknown>> = Array.isArray(req.body) ? req.body : [req.body ?? {}];
    let updated = 0;
    for (const ev of events.slice(0, 200)) {
      const id = String(ev.requestId ?? ev.request_id ?? ev.requestID ?? '').slice(0, 100);
      const raw = String(ev.status ?? ev.deliveryStatus ?? '').toLowerCase();
      if (!id) continue;
      const status = ['1', 'delivered', 'delivrd'].includes(raw) ? 'DELIVERED' : ['2', '3', 'failed', 'rejected', 'undeliv'].includes(raw) ? 'FAILED' : null;
      if (!status) continue;
      const rows = await db.update(smsRecipients).set({ status, errorDetail: status === 'FAILED' ? 'Provider reported delivery failure' : null }).where(eq(smsRecipients.providerId, id)).returning({ id: smsRecipients.id });
      updated += rows.length;
    }
    return ok(res, { updated });
  } catch (e) { next(e); }
});
