import { db } from '../db/client';
import { auditLogs } from '../db/schema';

export async function writeAudit(input: {
  actorId?: string | null; action: string; module: string; recordId?: string | null;
  oldValue?: unknown; newValue?: unknown; ip?: string | null;
}) {
  await db.insert(auditLogs).values({
    actorId: input.actorId ?? null, action: input.action, module: input.module,
    recordId: input.recordId ?? null, oldValue: input.oldValue ?? null, newValue: input.newValue ?? null, ip: input.ip ?? null,
  });
}
