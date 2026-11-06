import { Router, type Response } from 'express';
import { and, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { departments, facultyProfiles, facultySubjects, sections, smsCampaigns, smsRecipients, studentProfiles, subjects, users } from '../db/schema';
import { allowRoles, requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { maskPhone, normalizePhone, smsDeliveryMode, smsProvider } from '../services/sms.service';
import { writeAudit } from '../services/audit.service';
import type { AuthUser } from '../types/auth';
import { absentStatus, canAccessSession, loadSession, previewAbsent, processAbsentSms } from '../services/absent-sms.service';
import { absentSmsMode } from '../services/sms.service';

export const smsRouter = Router();
smsRouter.use(requireAuth);
const leadership = allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL');
const facultyOrHod = allowRoles('FACULTY', 'HOD');

const parentScopeFields = z.object({ scopeType: z.enum(['SECTION', 'DEPARTMENT']), sectionId: z.string().uuid().optional() });
function refineParentScope(v: { scopeType: 'SECTION' | 'DEPARTMENT'; sectionId?: string }, ctx: z.RefinementCtx) {
  if (v.scopeType === 'SECTION' && !v.sectionId) ctx.addIssue({ code: 'custom', path: ['sectionId'], message: 'Select an assigned section' });
  if (v.scopeType === 'DEPARTMENT' && v.sectionId) ctx.addIssue({ code: 'custom', path: ['sectionId'], message: 'A department-wide campaign cannot also specify a section' });
}
const parentScopeSchema = parentScopeFields.superRefine(refineParentScope);

type ParentScope = { scopeType: 'SECTION' | 'DEPARTMENT'; departmentId: string; sectionId: string | null; label: string };
type ParentStudent = { studentId: string; userId: string; rollNumber: string; parentPhone: string | null; parentSmsConsent: boolean; isDemo: boolean };

async function resolveParentScope(user: AuthUser, input: z.infer<typeof parentScopeFields>, res: Response): Promise<ParentScope | null> {
  if (!user.departmentId) { fail(res, 403, 'Your account is not assigned to a department'); return null; }
  if (input.scopeType === 'DEPARTMENT') {
    if (user.role !== 'HOD') { fail(res, 403, 'Only an HOD can target the whole department'); return null; }
    const [department] = await db.select({ id: departments.id, code: departments.code, name: departments.name }).from(departments).where(eq(departments.id, user.departmentId)).limit(1);
    if (!department) { fail(res, 403, 'Department scope is unavailable'); return null; }
    return { scopeType: 'DEPARTMENT', departmentId: department.id, sectionId: null, label: `${department.code} · ${department.name}` };
  }
  const [section] = await db.select({ id: sections.id, name: sections.name, year: sections.year, departmentId: departments.id, departmentCode: departments.code, departmentName: departments.name })
    .from(sections).innerJoin(departments, eq(sections.departmentId, departments.id)).where(and(eq(sections.id, input.sectionId!), eq(sections.active, true))).limit(1);
  if (!section) { fail(res, 404, 'Section not found or inactive'); return null; }
  if (section.departmentId !== user.departmentId) { fail(res, 403, 'You can only message parents in your department'); return null; }
  if (user.role === 'FACULTY') {
    const [assignment] = await db.select({ id: facultySubjects.id }).from(facultySubjects)
      .innerJoin(facultyProfiles, eq(facultySubjects.facultyId, facultyProfiles.id))
      .where(and(eq(facultyProfiles.userId, user.id), eq(facultySubjects.sectionId, section.id))).limit(1);
    if (!assignment) { fail(res, 403, 'Faculty can only message parents in assigned sections'); return null; }
  } else if (user.role !== 'HOD') { fail(res, 403, 'Parent SMS is available only to Faculty and HOD'); return null; }
  return { scopeType: 'SECTION', departmentId: section.departmentId, sectionId: section.id, label: `${section.departmentCode} · Year ${section.year} · Section ${section.name}` };
}

async function loadParentStudents(scope: ParentScope): Promise<ParentStudent[]> {
  const where = scope.sectionId
    ? and(eq(studentProfiles.departmentId, scope.departmentId), eq(studentProfiles.sectionId, scope.sectionId), eq(studentProfiles.active, true), eq(users.active, true))
    : and(eq(studentProfiles.departmentId, scope.departmentId), eq(studentProfiles.active, true), eq(users.active, true));
  return db.select({ studentId: studentProfiles.id, userId: users.id, rollNumber: studentProfiles.rollNumber, parentPhone: studentProfiles.parentPhone,
    parentSmsConsent: studentProfiles.parentSmsConsent, isDemo: users.isDemo })
    .from(studentProfiles).innerJoin(users, eq(studentProfiles.userId, users.id)).where(where).orderBy(studentProfiles.rollNumber).limit(2000);
}

function deliveryPlan(rows: ParentStudent[], mode: 'mock' | 'gateway') {
  const valid = rows.flatMap((student) => {
    const phone = normalizePhone(student.parentPhone);
    return phone ? [{ ...student, phone }] : [];
  });
  const eligible = mode === 'gateway' ? valid.filter((student) => !student.isDemo && student.parentSmsConsent) : valid;
  const grouped = new Map<string, typeof eligible>();
  for (const student of eligible) grouped.set(student.phone, [...(grouped.get(student.phone) ?? []), student]);
  return {
    eligible,
    grouped,
    counts: {
      studentsInScope: rows.length,
      eligibleStudents: eligible.length,
      uniqueRecipients: grouped.size,
      missingParentPhone: rows.filter((student) => !student.parentPhone?.trim()).length,
      invalidParentPhone: rows.filter((student) => Boolean(student.parentPhone?.trim()) && !normalizePhone(student.parentPhone)).length,
      excludedDemo: mode === 'gateway' ? valid.filter((student) => student.isDemo).length : 0,
      excludedNoConsent: mode === 'gateway' ? valid.filter((student) => !student.isDemo && !student.parentSmsConsent).length : 0,
    },
  };
}

smsRouter.get('/parents/scopes', facultyOrHod, async (req, res, next) => {
  try {
    const user = req.user!;
    if (!user.departmentId) return fail(res, 403, 'Your account is not assigned to a department');
    const scopes: Array<{ scopeType: 'SECTION' | 'DEPARTMENT'; departmentId: string; sectionId: string | null; label: string }> = [];
    if (user.role === 'HOD') {
      const [department] = await db.select({ id: departments.id, code: departments.code, name: departments.name }).from(departments).where(eq(departments.id, user.departmentId)).limit(1);
      if (department) scopes.push({ scopeType: 'DEPARTMENT', departmentId: department.id, sectionId: null, label: `${department.code} · Entire department` });
      const rows = await db.select({ sectionId: sections.id, year: sections.year, section: sections.name, departmentId: departments.id, department: departments.code })
        .from(sections).innerJoin(departments, eq(sections.departmentId, departments.id)).where(and(eq(sections.departmentId, user.departmentId), eq(sections.active, true))).orderBy(sections.year, sections.name).limit(500);
      for (const row of rows) scopes.push({ scopeType: 'SECTION', departmentId: row.departmentId, sectionId: row.sectionId, label: `${row.department} · Year ${row.year} · Section ${row.section}` });
    } else {
      const rows = await db.select({ sectionId: sections.id, year: sections.year, section: sections.name, departmentId: departments.id, department: departments.code })
        .from(facultySubjects).innerJoin(facultyProfiles, eq(facultySubjects.facultyId, facultyProfiles.id))
        .innerJoin(sections, eq(facultySubjects.sectionId, sections.id)).innerJoin(departments, eq(sections.departmentId, departments.id))
        .where(and(eq(facultyProfiles.userId, user.id), eq(sections.active, true))).orderBy(sections.year, sections.name).limit(500);
      const seen = new Set<string>();
      for (const row of rows) if (!seen.has(row.sectionId)) {
        seen.add(row.sectionId);
        scopes.push({ scopeType: 'SECTION', departmentId: row.departmentId, sectionId: row.sectionId, label: `${row.department} · Year ${row.year} · Section ${row.section}` });
      }
    }
    return ok(res, { scopes, mode: smsDeliveryMode() });
  } catch (error) { next(error); }
});

smsRouter.post('/parents/preview', facultyOrHod, async (req, res, next) => {
  try {
    const parsed = parentScopeSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Select a valid audience');
    const scope = await resolveParentScope(req.user!, parsed.data, res);
    if (!scope) return;
    const mode = smsDeliveryMode();
    const plan = deliveryPlan(await loadParentStudents(scope), mode);
    return ok(res, { scope: scope.label, mode, counts: plan.counts, canSend: plan.counts.uniqueRecipients > 0,
      warning: mode === 'mock' ? 'Mock mode only: no SMS is transmitted. Fictional contacts may be previewed.' : 'Live mode sends only to non-demo students whose parent/guardian consent is recorded.' });
  } catch (error) { next(error); }
});

smsRouter.get('/parents/campaigns', facultyOrHod, async (req, res, next) => {
  try {
    const parentAudience = or(eq(smsCampaigns.audience, 'PARENT_SECTION'), eq(smsCampaigns.audience, 'PARENT_DEPARTMENT'))!;
    const visibility = req.user!.role === 'HOD' && req.user!.departmentId
      ? and(parentAudience, or(eq(smsCampaigns.createdBy, req.user!.id), eq(smsCampaigns.targetDepartmentId, req.user!.departmentId)))
      : and(parentAudience, eq(smsCampaigns.createdBy, req.user!.id));
    const rows = await db.select({ id: smsCampaigns.id, name: smsCampaigns.name, message: smsCampaigns.message, audience: smsCampaigns.audience,
      status: smsCampaigns.status, targetDepartmentId: smsCampaigns.targetDepartmentId, targetSectionId: smsCampaigns.targetSectionId,
      createdAt: smsCampaigns.createdAt, updatedAt: smsCampaigns.updatedAt })
      .from(smsCampaigns).where(visibility).orderBy(desc(smsCampaigns.createdAt)).limit(50);
    const data = await Promise.all(rows.map(async (campaign) => {
      const recipients = await db.select({ status: smsRecipients.status }).from(smsRecipients).where(eq(smsRecipients.campaignId, campaign.id)).limit(2000);
      return { ...campaign, studentsCovered: recipients.length, sent: recipients.filter((row) => row.status === 'SENT').length,
        mocked: recipients.filter((row) => row.status === 'MOCKED').length, failed: recipients.filter((row) => row.status === 'FAILED').length };
    }));
    return ok(res, data);
  } catch (error) { next(error); }
});

smsRouter.post('/parents/campaigns', facultyOrHod, async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(3).max(160), message: z.string().trim().min(1).max(1000), ...parentScopeFields.shape }).superRefine(refineParentScope).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Enter a campaign name, message, and valid audience');
    const scope = await resolveParentScope(req.user!, parsed.data, res);
    if (!scope) return;
    const mode = smsDeliveryMode();
    const plan = deliveryPlan(await loadParentStudents(scope), mode);
    if (!plan.counts.uniqueRecipients) return fail(res, 409, mode === 'gateway' ? 'No eligible parent contacts. Live SMS requires a valid number, non-demo student, and recorded guardian consent.' : 'No valid parent phone numbers are available in this audience');
    const [campaign] = await db.insert(smsCampaigns).values({ name: parsed.data.name, message: parsed.data.message,
      audience: scope.scopeType === 'SECTION' ? 'PARENT_SECTION' : 'PARENT_DEPARTMENT', status: 'DRAFT', createdBy: req.user!.id,
      targetDepartmentId: scope.departmentId, targetSectionId: scope.sectionId }).returning({ id: smsCampaigns.id, name: smsCampaigns.name, status: smsCampaigns.status });
    await writeAudit({ actorId: req.user!.id, action: 'PARENT_SMS_CAMPAIGN_CREATED', module: 'PARENT_SMS', recordId: campaign.id,
      newValue: { audience: scope.scopeType, departmentId: scope.departmentId, sectionId: scope.sectionId, students: plan.counts.eligibleStudents, mode }, ip: req.ip });
    return ok(res, campaign, 'Parent SMS campaign created', 201);
  } catch (error) { next(error); }
});

smsRouter.post('/parents/campaigns/:id/send', facultyOrHod, async (req, res, next) => {
  try {
    const [campaign] = await db.select().from(smsCampaigns).where(and(eq(smsCampaigns.id, req.params.id),
      or(eq(smsCampaigns.audience, 'PARENT_SECTION'), eq(smsCampaigns.audience, 'PARENT_DEPARTMENT'))!)).limit(1);
    if (!campaign) return fail(res, 404, 'Parent SMS campaign not found');
    if (req.user!.role === 'FACULTY' && campaign.createdBy !== req.user!.id) return fail(res, 403, 'Faculty can only send their own campaigns');
    if (req.user!.role === 'HOD' && campaign.targetDepartmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only send campaigns within their department');
    if (campaign.status !== 'DRAFT') return fail(res, 409, 'This campaign has already been processed');
    const scopeInput = { scopeType: campaign.audience === 'PARENT_DEPARTMENT' ? 'DEPARTMENT' as const : 'SECTION' as const,
      ...(campaign.targetSectionId ? { sectionId: campaign.targetSectionId } : {}) };
    const scope = await resolveParentScope(req.user!, scopeInput, res);
    if (!scope) return;
    const mode = smsDeliveryMode();
    const plan = deliveryPlan(await loadParentStudents(scope), mode);
    if (!plan.counts.uniqueRecipients) return fail(res, 409, mode === 'gateway' ? 'No eligible parent contacts. Consent or contact status may have changed since preview.' : 'No valid parent phone numbers remain for this audience');
    const claimed = await db.transaction(async (tx) => {
      const [updated] = await tx.update(smsCampaigns).set({ status: 'PROCESSING', updatedAt: new Date() })
        .where(and(eq(smsCampaigns.id, campaign.id), eq(smsCampaigns.status, 'DRAFT'))).returning({ id: smsCampaigns.id });
      if (!updated) return false;
      await tx.insert(smsRecipients).values(plan.eligible.map((student) => ({ campaignId: campaign.id, userId: student.userId, studentId: student.studentId,
        phone: maskPhone(student.phone), status: 'PENDING' })));
      return true;
    });
    if (!claimed) return fail(res, 409, 'This campaign has already been processed');
    const provider = smsProvider();
    let sent = 0, failed = 0, mocked = 0;
    for (const [phone, students] of plan.grouped) {
      const result = await provider.send({ phone, message: campaign.message });
      if (result.status === 'SENT') sent += 1;
      else if (result.status === 'MOCKED') mocked += 1;
      else failed += 1;
      const ids = students.map((student) => student.studentId);
      await db.update(smsRecipients).set({ status: result.status, providerId: result.providerId ? `delivery-${result.providerId}`.slice(0, 100) : null })
        .where(and(eq(smsRecipients.campaignId, campaign.id), inArray(smsRecipients.studentId, ids)));
    }
    const status = mode === 'mock' ? 'MOCKED' : failed === plan.grouped.size ? 'FAILED' : failed ? 'PARTIAL' : 'SENT';
    const [updated] = await db.update(smsCampaigns).set({ status, updatedAt: new Date() }).where(eq(smsCampaigns.id, campaign.id)).returning({ id: smsCampaigns.id, status: smsCampaigns.status });
    await writeAudit({ actorId: req.user!.id, action: 'PARENT_SMS_CAMPAIGN_SEND', module: 'PARENT_SMS', recordId: campaign.id,
      newValue: { studentsCovered: plan.counts.eligibleStudents, uniqueRecipients: plan.counts.uniqueRecipients, mode, status, sent, mocked, failed }, ip: req.ip });
    return ok(res, { campaign: updated, studentsCovered: plan.counts.eligibleStudents, recipients: plan.counts.uniqueRecipients, mode,
      sent, mocked, failed, warning: mode === 'mock' ? 'Mock mode only: no SMS was transmitted.' : undefined }, 'Parent SMS campaign processed');
  } catch (error) { next(error); }
});

smsRouter.get('/campaigns', leadership, async (_req, res, next) => {
  try { return ok(res, await db.select().from(smsCampaigns).orderBy(desc(smsCampaigns.createdAt)).limit(100)); }
  catch (error) { next(error); }
});

smsRouter.post('/campaigns', leadership, async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().min(3).max(160), message: z.string().min(1).max(1000),
      audience: z.enum(['ALL_STUDENTS', 'FACULTY', 'DEPARTMENT']).default('ALL_STUDENTS'), scheduledAt: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid campaign');
    const [campaign] = await db.insert(smsCampaigns).values({ ...parsed.data, scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      createdBy: req.user!.id, status: parsed.data.scheduledAt ? 'QUEUED' : 'DRAFT' }).returning();
    await writeAudit({ actorId: req.user!.id, action: 'SMS_CAMPAIGN_CREATED', module: 'SMS', recordId: campaign.id, ip: req.ip });
    return ok(res, campaign, 'Campaign created', 201);
  } catch (error) { next(error); }
});

smsRouter.post('/campaigns/:id/send', leadership, async (req, res, next) => {
  try {
    const [campaign] = await db.select().from(smsCampaigns).where(eq(smsCampaigns.id, req.params.id)).limit(1);
    if (!campaign) return fail(res, 404, 'Campaign not found');
    if (['SENT', 'MOCKED', 'PROCESSING'].includes(campaign.status)) return fail(res, 409, 'This campaign has already been processed');
    const claim = await db.update(smsCampaigns).set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(and(eq(smsCampaigns.id, campaign.id), inArray(smsCampaigns.status, ['DRAFT', 'QUEUED', 'FAILED']))).returning({ id: smsCampaigns.id });
    if (!claim.length) return fail(res, 409, 'This campaign has already been processed');
    const mode = smsDeliveryMode();
    const filters = [eq(users.role, campaign.audience === 'FACULTY' ? 'FACULTY' : 'STUDENT'), eq(users.active, true)];
    if (mode === 'gateway') filters.push(eq(users.isDemo, false));
    const rows = await db.select({ id: users.id, phone: users.phone }).from(users).where(and(...filters)).limit(2000);
    const grouped = new Map<string, Array<{ id: string; phone: string }>>();
    for (const row of rows) { const phone = normalizePhone(row.phone); if (phone) grouped.set(phone, [...(grouped.get(phone) ?? []), { id: row.id, phone }]); }
    const provider = smsProvider();
    const results: Array<{ userId: string; phone: string; status: 'SENT' | 'MOCKED' | 'FAILED'; providerId: string }> = [];
    for (const [phone, group] of grouped) {
      const result = await provider.send({ phone, message: campaign.message });
      const providerId = `delivery-${result.providerId ?? 'none'}`.slice(0, 100);
      results.push(...group.map((recipient) => ({ userId: recipient.id, phone: recipient.phone, status: result.status, providerId })));
    }
    if (results.length) await db.insert(smsRecipients).values(results.map((result) => ({ campaignId: campaign.id, userId: result.userId, phone: maskPhone(result.phone), status: result.status, providerId: result.providerId })));
    const failed = results.filter((result) => result.status === 'FAILED').length;
    const succeeded = results.filter((result) => result.status === 'SENT').length;
    const status = mode === 'mock' ? 'MOCKED' : results.length === 0 || succeeded === 0 ? 'FAILED' : failed ? 'PARTIAL' : 'SENT';
    const [updated] = await db.update(smsCampaigns).set({ status, updatedAt: new Date() }).where(eq(smsCampaigns.id, campaign.id)).returning();
    await writeAudit({ actorId: req.user!.id, action: 'SMS_CAMPAIGN_SEND', module: 'SMS', recordId: campaign.id,
      newValue: { recipients: grouped.size, studentsCovered: results.length, providerMode: mode, status }, ip: req.ip });
    return ok(res, { campaign: updated, recipients: grouped.size, studentsCovered: results.length, mode,
      warning: mode === 'mock' ? 'Mock mode only: no SMS was transmitted.' : undefined }, 'Campaign processed');
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------------------------
// Absent-student parent SMS (attendance-linked). Staff roles only; scope enforced per session.
// ---------------------------------------------------------------------------------------------
const absentRoles = allowRoles('FACULTY', 'HOD', 'ADMIN', 'SUPER_ADMIN');
const sessionIdSchema = z.string().uuid();

async function sessionFor(req: { params: { sessionId?: string }; user?: AuthUser }, res: Response) {
  const id = sessionIdSchema.safeParse(req.params.sessionId);
  if (!id.success) { fail(res, 400, 'Invalid attendance session', 'VALIDATION_ERROR'); return null; }
  const session = await loadSession(id.data);
  if (!session) { fail(res, 404, 'Attendance session not found'); return null; }
  if (!(await canAccessSession(req.user!, session))) { fail(res, 403, 'You do not have access to this attendance session', 'FORBIDDEN'); return null; }
  return session;
}

smsRouter.get('/absent/:sessionId/preview', absentRoles, async (req, res, next) => {
  try { const s = await sessionFor(req, res); if (!s) return; return ok(res, { ...(await previewAbsent(s)), policy: absentSmsMode() }); } catch (e) { next(e); }
});
smsRouter.post('/absent/:sessionId/send', absentRoles, async (req, res, next) => {
  try {
    if (absentSmsMode() === 'off') return fail(res, 403, 'Absent-student SMS is disabled by the administrator', 'SMS_DISABLED');
    const body = z.object({ studentIds: z.array(z.string().uuid()).max(500).optional() }).safeParse(req.body ?? {});
    if (!body.success) return fail(res, 400, 'Invalid student selection', 'VALIDATION_ERROR');
    const s = await sessionFor(req, res); if (!s) return;
    return ok(res, await processAbsentSms(s, { id: req.user!.id, ip: req.ip }, { studentIds: body.data.studentIds }), 'Absent-student SMS processed');
  } catch (e) { next(e); }
});
smsRouter.post('/absent/:sessionId/retry', absentRoles, async (req, res, next) => {
  try {
    if (absentSmsMode() === 'off') return fail(res, 403, 'Absent-student SMS is disabled by the administrator', 'SMS_DISABLED');
    const s = await sessionFor(req, res); if (!s) return;
    return ok(res, await processAbsentSms(s, { id: req.user!.id, ip: req.ip }, { retry: true }), 'Failed SMS retried');
  } catch (e) { next(e); }
});
smsRouter.get('/absent/:sessionId/status', absentRoles, async (req, res, next) => {
  try { const s = await sessionFor(req, res); if (!s) return; return ok(res, await absentStatus(s.id)); } catch (e) { next(e); }
});

// SMS management dashboard: totals + per-recipient log with masked numbers.
smsRouter.get('/dashboard', allowRoles('HOD', 'ADMIN', 'SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const q = z.object({ departmentId: z.string().uuid().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['PENDING', 'SENDING', 'SENT', 'DELIVERED', 'MOCKED', 'FAILED']).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }).safeParse(req.query);
    if (!q.success) return fail(res, 400, 'Invalid filter', 'VALIDATION_ERROR');
    const user = req.user!;
    const departmentId = user.role === 'HOD' ? user.departmentId : q.data.departmentId;
    if (user.role === 'HOD' && !departmentId) return fail(res, 403, 'Your account is not assigned to a department');
    const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
    const scope = [departmentId ? eq(smsCampaigns.targetDepartmentId, departmentId) : undefined,
      q.data.date ? and(gte(smsRecipients.createdAt, istStart(q.data.date)), lt(smsRecipients.createdAt, new Date(istStart(q.data.date).getTime() + 86_400_000))) : undefined];
    const pageSize = 25;
    const rows = await db.select({ id: smsRecipients.id, status: smsRecipients.status, phone: smsRecipients.phone, message: smsRecipients.message, campaignMessage: smsCampaigns.message,
      errorDetail: smsRecipients.errorDetail, attempts: smsRecipients.attempts, sentAt: smsRecipients.sentAt, createdAt: smsRecipients.createdAt,
      studentName: users.fullName, rollNumber: studentProfiles.rollNumber, department: departments.code })
      .from(smsRecipients).innerJoin(smsCampaigns, eq(smsRecipients.campaignId, smsCampaigns.id)).leftJoin(users, eq(smsRecipients.userId, users.id))
      .leftJoin(studentProfiles, eq(smsRecipients.studentId, studentProfiles.id)).leftJoin(departments, eq(smsCampaigns.targetDepartmentId, departments.id))
      .where(and(...scope, q.data.status ? eq(smsRecipients.status, q.data.status) : undefined)).orderBy(desc(smsRecipients.createdAt)).limit(pageSize + 1).offset((q.data.page - 1) * pageSize);
    const counts = await db.select({ status: smsRecipients.status, n: sql<number>`count(*)::int` }).from(smsRecipients).innerJoin(smsCampaigns, eq(smsRecipients.campaignId, smsCampaigns.id))
      .where(and(...scope)).groupBy(smsRecipients.status);
    const n = (...st: string[]) => counts.filter((c) => st.includes(c.status)).reduce((a, c) => a + c.n, 0);
    const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const [today] = await db.select({ n: sql<number>`count(*)::int` }).from(smsRecipients).innerJoin(smsCampaigns, eq(smsRecipients.campaignId, smsCampaigns.id))
      .where(and(departmentId ? eq(smsCampaigns.targetDepartmentId, departmentId) : undefined, gte(smsRecipients.createdAt, istStart(todayIst))));
    return ok(res, { stats: { total: counts.reduce((a, c) => a + c.n, 0), successful: n('SENT', 'DELIVERED'), testMode: n('MOCKED'), failed: n('FAILED'), pending: n('PENDING', 'SENDING'), today: today?.n ?? 0 },
      rows: rows.slice(0, pageSize).map((r) => ({ ...r, message: r.message ?? r.campaignMessage })), hasMore: rows.length > pageSize, page: q.data.page });
  } catch (e) { next(e); }
});
