import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { examinations, facultyProfiles, facultySubjects, marks, results, sections, studentProfiles, subjects, users } from '../db/schema';
import { allowRoles, requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { writeAudit } from '../services/audit.service';

export const marksRouter = Router(); marksRouter.use(requireAuth);
marksRouter.get('/', async (req, res, next) => {
  try {
    const [student] = req.user!.role === 'STUDENT' ? await db.select({ id: studentProfiles.id }).from(studentProfiles).where(eq(studentProfiles.userId, req.user!.id)).limit(1) : [];
    const [faculty] = req.user!.role === 'FACULTY' ? await db.select({ id: facultyProfiles.id }).from(facultyProfiles).where(eq(facultyProfiles.userId, req.user!.id)).limit(1) : [];
    const rows = await db.select({ id: marks.id, studentId: marks.studentId, student: users.fullName, rollNumber: studentProfiles.rollNumber, departmentId: users.departmentId, sectionId: studentProfiles.sectionId, examinationId: marks.examinationId, examination: examinations.name, subjectId: marks.subjectId, subject: subjects.name, internal: marks.internal, external: marks.external, maxMarks: marks.maxMarks, grade: marks.grade, result: marks.result, reviewedAt: marks.reviewedAt, published: results.published })
      .from(marks).innerJoin(studentProfiles, eq(marks.studentId, studentProfiles.id)).innerJoin(users, eq(studentProfiles.userId, users.id)).innerJoin(examinations, eq(marks.examinationId, examinations.id)).innerJoin(subjects, eq(marks.subjectId, subjects.id)).leftJoin(results, and(eq(results.studentId, marks.studentId), eq(results.examinationId, marks.examinationId)))
      .where(student ? and(eq(marks.studentId, student.id), eq(results.published, true)) : undefined).limit(500);
    const assignments = faculty ? await db.select({ subjectId: facultySubjects.subjectId, sectionId: facultySubjects.sectionId }).from(facultySubjects).where(eq(facultySubjects.facultyId, faculty.id)) : [];
    const taught = new Set(assignments.map((a) => `${a.subjectId}:${a.sectionId}`));
    const visible = rows.filter((r) => req.user!.role === 'HOD' && req.user!.departmentId ? r.departmentId === req.user!.departmentId : req.user!.role === 'FACULTY' ? taught.has(`${r.subjectId}:${r.sectionId}`) : true).map(({ departmentId: _departmentId, sectionId: _sectionId, ...record }) => record);
    return ok(res, visible);
  } catch (e) { next(e); }
});
const inputSchema = z.object({ examinationId: z.string().uuid(), subjectId: z.string().uuid(), studentId: z.string().uuid(), internal: z.number().min(0).max(30), external: z.number().min(0).max(70), maxMarks: z.number().positive().max(100).default(100) });
marksRouter.post('/', allowRoles('FACULTY', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const v = inputSchema.safeParse(req.body); if (!v.success) return fail(res, 400, v.error.issues[0]?.message || 'Invalid marks');
    const { examinationId, subjectId, studentId, internal, external, maxMarks } = v.data;
    if (internal + external > maxMarks) return fail(res, 400, 'Combined marks cannot exceed the maximum marks');
    const [student] = await db.select({ sectionId: studentProfiles.sectionId, departmentId: studentProfiles.departmentId }).from(studentProfiles).where(eq(studentProfiles.id, studentId)).limit(1);
    const [faculty] = req.user!.role === 'FACULTY' ? await db.select({ id: facultyProfiles.id }).from(facultyProfiles).where(eq(facultyProfiles.userId, req.user!.id)).limit(1) : [];
    if (!student) return fail(res, 404, 'Student not found');
    if (faculty && !(await db.select({ id: facultySubjects.id }).from(facultySubjects).where(and(eq(facultySubjects.facultyId, faculty.id), eq(facultySubjects.subjectId, subjectId), eq(facultySubjects.sectionId, student.sectionId))).limit(1)).length) return fail(res, 403, 'You can only enter marks for your assigned class');
    const total = internal + external; const grade = total >= 90 ? 'A+' : total >= 80 ? 'A' : total >= 70 ? 'B' : total >= 60 ? 'C' : total >= 50 ? 'D' : 'F';
    const [row] = await db.insert(marks).values({ examinationId, subjectId, studentId, internal: String(internal), external: String(external), maxMarks: String(maxMarks), grade, result: total >= maxMarks * 0.4 ? 'PASS' : 'FAIL', enteredBy: req.user!.id }).onConflictDoUpdate({ target: [marks.examinationId, marks.subjectId, marks.studentId], set: { internal: String(internal), external: String(external), maxMarks: String(maxMarks), grade, result: total >= maxMarks * 0.4 ? 'PASS' : 'FAIL', enteredBy: req.user!.id, updatedAt: new Date() } }).returning();
    await writeAudit({ actorId: req.user!.id, action: 'MARKS_ENTERED', module: 'RESULTS', recordId: row.id, newValue: { total, grade }, ip: req.ip }); return ok(res, row, 'Marks saved', 201);
  } catch (e) { next(e); }
});
marksRouter.patch('/:id/review', allowRoles('HOD', 'PRINCIPAL', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try { const [scope] = await db.select({ id: marks.id, departmentId: users.departmentId }).from(marks).innerJoin(studentProfiles, eq(marks.studentId, studentProfiles.id)).innerJoin(users, eq(studentProfiles.userId, users.id)).where(eq(marks.id, req.params.id)).limit(1); if (!scope) return fail(res, 404, 'Marks record not found'); if (req.user!.role === 'HOD' && scope.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only review marks in their department'); const [row] = await db.update(marks).set({ reviewedAt: new Date(), updatedAt: new Date() }).where(eq(marks.id, req.params.id)).returning(); await writeAudit({ actorId: req.user!.id, action: 'RESULT_REVIEWED', module: 'RESULTS', recordId: row.id, ip: req.ip }); return ok(res, row, 'Marks reviewed'); } catch (e) { next(e); }
});
marksRouter.patch('/:id/publish', allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const [mark] = await db.select().from(marks).where(eq(marks.id, req.params.id)).limit(1); if (!mark) return fail(res, 404, 'Marks record not found'); if (!mark.reviewedAt) return fail(res, 409, 'HOD review is required before publishing this result', 'REVIEW_REQUIRED');
    const [existing] = await db.select().from(results).where(and(eq(results.studentId, mark.studentId), eq(results.examinationId, mark.examinationId))).limit(1);
    if (existing) await db.update(results).set({ published: true, publishedAt: new Date(), updatedAt: new Date() }).where(eq(results.id, existing.id));
    else await db.insert(results).values({ studentId: mark.studentId, examinationId: mark.examinationId, published: true, publishedAt: new Date() });
    const [student] = await db.select({ userId: studentProfiles.userId }).from(studentProfiles).where(eq(studentProfiles.id, mark.studentId)).limit(1);
    if (student) await db.insert((await import('../db/schema')).notifications).values({ recipientId: student.userId, title: 'Results published', message: 'Your examination result is now available in the BITS Kurnool student portal.', type: 'RESULT_PUBLISHED' });
    await writeAudit({ actorId: req.user!.id, action: 'RESULT_PUBLISHED', module: 'RESULTS', recordId: mark.id, ip: req.ip }); return ok(res, { published: true }, 'Result published');
  } catch (e) { next(e); }
});
