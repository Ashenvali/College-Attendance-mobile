import crypto from 'node:crypto';
import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/client';
import { courses, departments, examinations, facultyProfiles, facultySubjects, fees, sections, studentProfiles, subjects, users } from '../db/schema';
import { allowRoles, requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { writeAudit } from '../services/audit.service';

export const adminRouter = Router(); adminRouter.use(requireAuth); adminRouter.use(allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL', 'HOD'));
const createStudent = z.object({ loginId: z.string().min(4).max(80), email: z.string().email().max(180), password: z.string().min(8).max(128), fullName: z.string().min(2).max(140), phone: z.string().optional(), rollNumber: z.string().min(4).max(32), departmentId: z.string().uuid(), courseId: z.string().uuid().optional(), sectionId: z.string().uuid(), year: z.number().int().min(1).max(4), parentName: z.string().optional(), parentPhone: z.string().optional(), parentSmsConsent: z.boolean().optional().default(false), admissionYear: z.number().int().optional() });
const createFaculty = z.object({ loginId: z.string().min(4).max(80), email: z.string().email().max(180), password: z.string().min(8).max(128), fullName: z.string().min(2).max(140), phone: z.string().optional(), facultyCode: z.string().min(3).max(32), departmentId: z.string().uuid(), designation: z.string().min(2).max(100), role: z.enum(['FACULTY', 'HOD']).default('FACULTY') });
adminRouter.post('/students', async (req, res, next) => {
  try {
    const v = createStudent.safeParse(req.body); if (!v.success) return fail(res, 400, v.error.issues[0]?.message || 'Invalid student');
    if (req.user!.role === 'HOD' && v.data.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only add students in their department');
    if (v.data.parentSmsConsent && !['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) return fail(res, 403, 'Only Admin may record guardian SMS consent');
    if (v.data.parentSmsConsent && !v.data.parentPhone?.trim()) return fail(res, 400, 'A parent/guardian phone number is required to record SMS consent');
    const [targetSection] = await db.select({ departmentId: sections.departmentId, year: sections.year }).from(sections).where(eq(sections.id, v.data.sectionId)).limit(1); if (!targetSection || targetSection.departmentId !== v.data.departmentId || targetSection.year !== v.data.year) return fail(res, 400, 'Student department, year, and section must match'); if (v.data.courseId) { const [course] = await db.select({ departmentId: courses.departmentId }).from(courses).where(eq(courses.id, v.data.courseId)).limit(1); if (!course || course.departmentId !== v.data.departmentId) return fail(res, 400, 'Student course must belong to the selected department'); }
    const { loginId, email, password, fullName, phone, ...profile } = v.data; const hash = await bcrypt.hash(password, 12);
    const created = await db.transaction(async (tx) => { const [u] = await tx.insert(users).values({ loginId, email: email.toLowerCase(), passwordHash: hash, role: 'STUDENT', fullName, phone: phone ?? null, departmentId: profile.departmentId, isDemo: false }).returning(); const [s] = await tx.insert(studentProfiles).values({ userId: u.id, ...profile, parentPhone: profile.parentPhone?.trim() || null }).returning(); return { user: u, student: s }; });
    await writeAudit({ actorId: req.user!.id, action: 'STUDENT_CREATED', module: 'STUDENTS', recordId: created.student.id, ip: req.ip }); return ok(res, { id: created.student.id, rollNumber: created.student.rollNumber, name: created.user.fullName, loginId: created.user.loginId }, 'Student created', 201);
  } catch (e) { next(e); }
});
adminRouter.post('/faculty', async (req, res, next) => {
  try {
    const v = createFaculty.safeParse(req.body); if (!v.success) return fail(res, 400, v.error.issues[0]?.message || 'Invalid faculty');
    if (req.user!.role === 'HOD' && v.data.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only add faculty in their department');
    if (req.user!.role === 'HOD' && v.data.role !== 'FACULTY') return fail(res, 403, 'HOD can only create Faculty accounts');
    if (req.user!.role === 'PRINCIPAL' && v.data.role === 'HOD') return fail(res, 403, 'Only Admin can create HOD accounts');
    const { loginId, email, password, fullName, phone, facultyCode, departmentId, designation, role } = v.data;
    const created = await db.transaction(async (tx) => { const [u] = await tx.insert(users).values({ loginId, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role, fullName, phone: phone ?? null, departmentId, isDemo: false }).returning(); const [f] = await tx.insert(facultyProfiles).values({ userId: u.id, facultyCode, departmentId, designation }).returning(); return { user: u, faculty: f }; });
    await writeAudit({ actorId: req.user!.id, action: 'FACULTY_CREATED', module: 'FACULTY', recordId: created.faculty.id, ip: req.ip }); return ok(res, { id: created.faculty.id, name: created.user.fullName, facultyCode: created.faculty.facultyCode, loginId: created.user.loginId }, 'Faculty account created', 201);
  } catch (e) { next(e); }
});
adminRouter.post('/departments', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try { const v = z.object({ code: z.string().min(2).max(12).transform((s) => s.toUpperCase()), name: z.string().min(3).max(160) }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Enter a department code and name'); const [row] = await db.insert(departments).values(v.data).returning(); await writeAudit({ actorId: req.user!.id, action: 'DEPARTMENT_CREATED', module: 'DEPARTMENTS', recordId: row.id, ip: req.ip }); return ok(res, row, 'Department created', 201); } catch (e) { next(e); }
});
adminRouter.post('/subjects', allowRoles('ADMIN', 'SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try { const v = z.object({ code: z.string().min(2).max(24).transform((s) => s.toUpperCase()), name: z.string().min(3).max(160), departmentId: z.string().uuid(), semesterNumber: z.number().int().min(1).max(8), credits: z.number().int().min(1).max(8).default(3) }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Enter valid subject details'); if (req.user!.role === 'HOD' && v.data.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only manage subjects in their department'); const [row] = await db.insert(subjects).values(v.data).returning(); await writeAudit({ actorId: req.user!.id, action: 'SUBJECT_CREATED', module: 'SUBJECTS', recordId: row.id, ip: req.ip }); return ok(res, row, 'Subject created', 201); } catch (e) { next(e); }
});
adminRouter.post('/examinations', allowRoles('ADMIN', 'SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try { const v = z.object({ name: z.string().min(3).max(140), type: z.string().min(3).max(32), departmentId: z.string().uuid(), year: z.number().int().min(1).max(4), sectionId: z.string().uuid().optional(), subjectId: z.string().uuid().optional(), examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().optional(), endTime: z.string().optional(), room: z.string().optional() }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Enter valid examination details'); if (v.data.sectionId) { const [section] = await db.select({ departmentId: sections.departmentId, year: sections.year }).from(sections).where(eq(sections.id, v.data.sectionId)).limit(1); if (!section || section.departmentId !== v.data.departmentId || section.year !== v.data.year) return fail(res, 400, 'Examination section, department, and year must match'); } if (v.data.subjectId) { const [subject] = await db.select({ departmentId: subjects.departmentId }).from(subjects).where(eq(subjects.id, v.data.subjectId)).limit(1); if (!subject || subject.departmentId !== v.data.departmentId) return fail(res, 400, 'Examination subject must belong to the selected department'); } if (req.user!.role === 'HOD' && v.data.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only create examinations for their department'); const [row] = await db.insert(examinations).values(v.data).returning(); await writeAudit({ actorId: req.user!.id, action: 'EXAM_CREATED', module: 'EXAMINATIONS', recordId: row.id, ip: req.ip }); return ok(res, row, 'Examination created', 201); } catch (e) { next(e); }
});
adminRouter.post('/fees', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try { const v = z.object({ studentId: z.string().uuid(), category: z.string().min(2).max(40), amount: z.number().positive().max(10_000_000), dueDate: z.string().optional() }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Enter valid fee details'); const [row] = await db.insert(fees).values({ ...v.data, amount: String(v.data.amount), dueDate: v.data.dueDate ?? null }).returning(); await writeAudit({ actorId: req.user!.id, action: 'FEE_CREATED', module: 'FEES', recordId: row.id, ip: req.ip }); return ok(res, row, 'Fee recorded', 201); } catch (e) { next(e); }
});
adminRouter.patch('/students/:id/status', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => { try { const state = z.boolean().safeParse(req.body.active); if (!state.success) return fail(res, 400, 'Active must be a boolean'); const [row] = await db.update(studentProfiles).set({ active: state.data, updatedAt: new Date() }).where(eq(studentProfiles.id, req.params.id)).returning(); if (!row) return fail(res, 404, 'Student not found'); await db.update(users).set({ active: row.active }).where(eq(users.id, row.userId)); await writeAudit({ actorId: req.user!.id, action: row.active ? 'STUDENT_ACTIVATED' : 'STUDENT_DEACTIVATED', module: 'STUDENTS', recordId: row.id, ip: req.ip }); return ok(res, row); } catch (e) { next(e); } });
adminRouter.patch('/students/:id/parent-sms-consent', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const parsed = z.object({ parentSmsConsent: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Parent SMS consent must be a boolean');
    const [student] = await db.select({ id: studentProfiles.id, parentPhone: studentProfiles.parentPhone }).from(studentProfiles).where(eq(studentProfiles.id, req.params.id)).limit(1);
    if (!student) return fail(res, 404, 'Student not found');
    if (parsed.data.parentSmsConsent && !student.parentPhone?.trim()) return fail(res, 409, 'Add a parent/guardian phone number before recording consent');
    const [updated] = await db.update(studentProfiles).set({ parentSmsConsent: parsed.data.parentSmsConsent, updatedAt: new Date() }).where(eq(studentProfiles.id, student.id)).returning({ id: studentProfiles.id, parentSmsConsent: studentProfiles.parentSmsConsent });
    await writeAudit({ actorId: req.user!.id, action: parsed.data.parentSmsConsent ? 'PARENT_SMS_CONSENT_RECORDED' : 'PARENT_SMS_CONSENT_WITHDRAWN', module: 'STUDENTS', recordId: student.id, newValue: { parentSmsConsent: parsed.data.parentSmsConsent }, ip: req.ip });
    return ok(res, { ...updated, hasParentContact: Boolean(student.parentPhone?.trim()) }, 'Guardian SMS consent updated');
  } catch (error) { next(error); }
});

adminRouter.post('/courses', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try { const v = z.object({ departmentId: z.string().uuid(), name: z.string().min(3).max(120), degree: z.string().min(2).max(40).default('B.Tech'), durationYears: z.number().int().min(1).max(8).default(4) }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Enter valid course details'); const [row] = await db.insert(courses).values(v.data).returning(); await writeAudit({ actorId: req.user!.id, action: 'COURSE_CREATED', module: 'COURSES', recordId: row.id, ip: req.ip }); return ok(res, row, 'Course created', 201); } catch (e) { next(e); }
});
adminRouter.post('/sections', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try { const v = z.object({ departmentId: z.string().uuid(), courseId: z.string().uuid().optional(), year: z.number().int().min(1).max(4), name: z.string().min(1).max(8), academicYearId: z.string().uuid().optional() }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Enter valid section details'); if (v.data.courseId) { const [course] = await db.select({ departmentId: courses.departmentId }).from(courses).where(eq(courses.id, v.data.courseId)).limit(1); if (!course || course.departmentId !== v.data.departmentId) return fail(res, 400, 'Section course must belong to the selected department'); } const [row] = await db.insert(sections).values(v.data).returning(); await writeAudit({ actorId: req.user!.id, action: 'SECTION_CREATED', module: 'SECTIONS', recordId: row.id, ip: req.ip }); return ok(res, row, 'Section created', 201); } catch (e) { next(e); }
});
adminRouter.post('/faculty-subjects', allowRoles('ADMIN', 'SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try { const v = z.object({ facultyId: z.string().uuid(), subjectId: z.string().uuid(), sectionId: z.string().uuid(), semesterId: z.string().uuid().optional(), academicYearId: z.string().uuid().optional() }).safeParse(req.body); if (!v.success) return fail(res, 400, 'Select a faculty member, subject, and section'); const [faculty] = await db.select({ departmentId: facultyProfiles.departmentId }).from(facultyProfiles).where(eq(facultyProfiles.id, v.data.facultyId)).limit(1); const [subject] = await db.select({ departmentId: subjects.departmentId }).from(subjects).where(eq(subjects.id, v.data.subjectId)).limit(1); const [section] = await db.select({ departmentId: sections.departmentId }).from(sections).where(eq(sections.id, v.data.sectionId)).limit(1); if (!faculty || !subject || !section || faculty.departmentId !== subject.departmentId || subject.departmentId !== section.departmentId) return fail(res, 400, 'Faculty, subject, and section must belong to the same department'); if (req.user!.role === 'HOD' && section.departmentId !== req.user!.departmentId) return fail(res, 403, 'HOD can only assign classes in their department'); const [existing] = await db.select().from(facultySubjects).where(and(eq(facultySubjects.facultyId, v.data.facultyId), eq(facultySubjects.subjectId, v.data.subjectId), eq(facultySubjects.sectionId, v.data.sectionId))).limit(1); if (existing) return ok(res, existing, 'Assignment already exists'); const [row] = await db.insert(facultySubjects).values(v.data).returning(); await writeAudit({ actorId: req.user!.id, action: 'FACULTY_SUBJECT_ASSIGNED', module: 'ACADEMICS', recordId: row.id, ip: req.ip }); return ok(res, row, 'Faculty assignment created', 201); } catch (e) { next(e); }
});

adminRouter.post('/users/:id/reset-password', allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id); if (!id.success) return fail(res, 400, 'Invalid user');
    const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id.data)).limit(1);
    if (!target) return fail(res, 404, 'User not found');
    if (target.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') return fail(res, 403, 'Only a Super Admin can reset a Super Admin');
    const temp = `${crypto.randomBytes(9).toString('base64url')}#${crypto.randomInt(10, 99)}`;
    const now = new Date();
    await db.update(users).set({ passwordHash: await bcrypt.hash(temp, 12), passwordChangedAt: now, updatedAt: now }).where(eq(users.id, target.id));
    await writeAudit({ actorId: req.user!.id, action: 'PASSWORD_RESET_BY_ADMIN', module: 'AUTH', recordId: target.id, ip: req.ip });
    return ok(res, { temporaryPassword: temp }, 'Temporary password generated. Share it securely; the user should change it immediately.');
  } catch (error) { next(error); }
});
