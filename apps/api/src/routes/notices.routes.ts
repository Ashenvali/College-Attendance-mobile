import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { facultyProfiles, facultySubjects, notices, notifications, sections, studentProfiles, users } from '../db/schema';
import { allowRoles, requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { writeAudit } from '../services/audit.service';

export const noticesRouter = Router();
noticesRouter.use(requireAuth);
noticesRouter.get('/', async (req, res, next) => {
  try {
    let rows = await db.select().from(notices).where(eq(notices.published, true)).orderBy(desc(notices.publishedAt)).limit(100);
    if (req.user!.role === 'STUDENT') {
      const [student] = await db.select({ departmentId: studentProfiles.departmentId, year: studentProfiles.year, sectionId: studentProfiles.sectionId }).from(studentProfiles).where(eq(studentProfiles.userId, req.user!.id)).limit(1);
      if (!student) return fail(res, 404, 'Student profile not found');
      rows = rows.filter((n) => n.audience === 'ALL_STUDENTS' || (n.audience === 'DEPARTMENT' && n.departmentId === student.departmentId) || (n.audience === 'YEAR' && n.departmentId === student.departmentId && n.year === student.year) || (n.audience === 'SECTION' && n.sectionId === student.sectionId));
    } else if (req.user!.role === 'HOD') {
      rows = rows.filter((n) => n.audience === 'ALL_STUDENTS' || n.departmentId === req.user!.departmentId);
    } else if (req.user!.role === 'FACULTY') {
      const [profile] = await db.select({ id: facultyProfiles.id }).from(facultyProfiles).where(eq(facultyProfiles.userId, req.user!.id)).limit(1);
      const assigned = profile ? await db.select({ sectionId: facultySubjects.sectionId }).from(facultySubjects).where(eq(facultySubjects.facultyId, profile.id)) : [];
      const sectionIds = new Set(assigned.map((r) => r.sectionId));
      rows = rows.filter((n) => n.audience === 'ALL_STUDENTS' || (n.audience === 'SECTION' && n.sectionId && sectionIds.has(n.sectionId)));
    }
    return ok(res, rows);
  } catch (e) { next(e); }
});
const createSchema = z.object({ title: z.string().min(3).max(180), body: z.string().min(4).max(5000), audience: z.enum(['ALL_STUDENTS', 'DEPARTMENT', 'YEAR', 'SECTION', 'FACULTY']), departmentId: z.string().uuid().optional(), year: z.number().int().min(1).max(4).optional(), sectionId: z.string().uuid().optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'), expiresAt: z.string().optional() });
noticesRouter.post('/', allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid notice', 'VALIDATION_ERROR');
    const input = parsed.data, role = req.user!.role;
    if ((role === 'HOD' || role === 'FACULTY') && input.audience === 'ALL_STUDENTS') return fail(res, 403, 'Department and faculty accounts cannot publish college-wide notices');
    if ((role === 'HOD' || role === 'FACULTY') && input.audience === 'FACULTY') return fail(res, 403, 'Department and faculty accounts cannot target the entire faculty body');
    if ((input.audience === 'DEPARTMENT' || input.audience === 'YEAR') && role !== 'HOD' && role !== 'FACULTY' && !input.departmentId) return fail(res, 400, 'Select a department for this audience');
    if (input.audience === 'YEAR' && input.year === undefined) return fail(res, 400, 'Select an academic year');
    if (input.audience === 'SECTION' && !input.sectionId) return fail(res, 400, 'Select a class section');
    const departmentId = role === 'HOD' || role === 'FACULTY' ? req.user!.departmentId ?? undefined : input.departmentId;
    if ((role === 'HOD' || role === 'FACULTY') && !departmentId) return fail(res, 403, 'No department is assigned to this account');
    if (role === 'FACULTY' && input.audience !== 'SECTION') return fail(res, 403, 'Faculty can publish to an assigned class section only');
    if (input.sectionId) {
      const [target] = await db.select({ departmentId: sections.departmentId }).from(sections).where(eq(sections.id, input.sectionId)).limit(1);
      if (!target) return fail(res, 404, 'Target section not found');
      if ((role === 'HOD' || role === 'FACULTY') && target.departmentId !== departmentId) return fail(res, 403, 'You can only publish within your department');
      if (role === 'FACULTY') {
        const [profile] = await db.select({ id: facultyProfiles.id }).from(facultyProfiles).where(eq(facultyProfiles.userId, req.user!.id)).limit(1);
        const assigned = profile ? await db.select({ id: facultySubjects.id }).from(facultySubjects).where(and(eq(facultySubjects.facultyId, profile.id), eq(facultySubjects.sectionId, input.sectionId))).limit(1) : [];
        if (!assigned.length) return fail(res, 403, 'You can only publish notices to a section assigned to you');
      }
    }
    if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) return fail(res, 400, 'Enter a valid notice expiry date');
    const [notice] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(notices).values({ title: input.title, body: input.body, audience: input.audience, departmentId: departmentId ?? null, year: input.year ?? null, sectionId: input.sectionId ?? null, priority: input.priority, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, createdBy: req.user!.id, published: true }).returning();
      let recipients = await tx.select({ userId: studentProfiles.userId }).from(studentProfiles).where(input.audience === 'ALL_STUDENTS' ? undefined : input.audience === 'DEPARTMENT' ? eq(studentProfiles.departmentId, departmentId!) : input.audience === 'YEAR' ? and(eq(studentProfiles.departmentId, departmentId!), eq(studentProfiles.year, input.year!)) : input.audience === 'SECTION' ? eq(studentProfiles.sectionId, input.sectionId!) : undefined);
      if (input.audience === 'FACULTY') recipients = await tx.select({ userId: users.id }).from(users).where(and(eq(users.role, 'FACULTY'), input.departmentId ? eq(users.departmentId, input.departmentId) : undefined));
      if (recipients.length) await tx.insert(notifications).values(recipients.map((r) => ({ recipientId: r.userId, title: input.title, message: input.body, type: 'NOTICE', status: 'IN_APP', metadata: { noticeId: created.id, priority: input.priority } })));
      return [created];
    });
    await writeAudit({ actorId: req.user!.id, action: 'NOTICE_PUBLISHED', module: 'NOTICES', recordId: notice.id, newValue: { title: notice.title, audience: notice.audience }, ip: req.ip });
    return ok(res, notice, 'Notice published and in-app notifications created', 201);
  } catch (e) { next(e); }
});
noticesRouter.patch('/:id', allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const [existing] = await db.select().from(notices).where(eq(notices.id, req.params.id)).limit(1);
    if (!existing) return fail(res, 404, 'Notice not found');
    if (req.user!.role === 'HOD' && existing.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only manage notices in their department');
    if (typeof req.body.published !== 'boolean') return fail(res, 400, 'Published must be true or false');
    const [row] = await db.update(notices).set({ published: req.body.published, updatedAt: new Date() }).where(eq(notices.id, req.params.id)).returning();
    await writeAudit({ actorId: req.user!.id, action: row.published ? 'NOTICE_REPUBLISHED' : 'NOTICE_UNPUBLISHED', module: 'NOTICES', recordId: row.id, ip: req.ip });
    return ok(res, row);
  } catch (e) { next(e); }
});
