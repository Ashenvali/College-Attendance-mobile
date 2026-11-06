import { Router } from 'express';
import { and, desc, eq, or, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { assignments, auditLogs, courses, departments, examinations, events, facultyProfiles, facultySubjects, fees, marks, notices, notifications, results, sections, studentProfiles, subjects, timetables, users, smsCampaigns } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import type { AuthUser } from '../types/auth';

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);

async function getStudent(userId: string) {
  const [row] = await db.select({ id: studentProfiles.id, sectionId: studentProfiles.sectionId, departmentId: studentProfiles.departmentId, year: studentProfiles.year })
    .from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  return row;
}
async function getFacultyScopes(userId: string) {
  const [profile] = await db.select({ id: facultyProfiles.id }).from(facultyProfiles).where(eq(facultyProfiles.userId, userId)).limit(1);
  if (!profile) return { facultyId: undefined, scopes: new Set<string>() };
  const rows = await db.select({ subjectId: facultySubjects.subjectId, sectionId: facultySubjects.sectionId }).from(facultySubjects).where(eq(facultySubjects.facultyId, profile.id));
  return { facultyId: profile.id, scopes: new Set(rows.map((r) => `${r.subjectId}:${r.sectionId}`)) };
}

resourcesRouter.get('/:resource', async (req, res, next) => {
  try {
    const { resource } = req.params;
    const user: AuthUser = req.user!;
    let data: unknown;
    switch (resource) {
      case 'students': {
        let rows = await db.select({ id: studentProfiles.id, userId: users.id, name: users.fullName, email: users.email, phone: users.phone, parentPhone: studentProfiles.parentPhone, parentSmsConsent: studentProfiles.parentSmsConsent, rollNumber: studentProfiles.rollNumber, year: studentProfiles.year, section: sections.name, sectionId: sections.id, departmentId: departments.id, department: departments.code, active: studentProfiles.active })
          .from(studentProfiles).innerJoin(users, eq(studentProfiles.userId, users.id)).innerJoin(sections, eq(studentProfiles.sectionId, sections.id)).innerJoin(departments, eq(studentProfiles.departmentId, departments.id)).orderBy(studentProfiles.rollNumber).limit(500);
        if (user.role === 'STUDENT') rows = rows.filter((r) => r.userId === user.id);
        if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        if (user.role === 'FACULTY') { const { scopes } = await getFacultyScopes(user.id); const sectionIds = new Set([...scopes].map((key) => key.split(':')[1])); rows = rows.filter((r) => sectionIds.has(r.sectionId)); }
        data = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
          ? rows.map(({ parentPhone, parentSmsConsent, ...row }) => ({ ...row, hasParentContact: Boolean(parentPhone?.trim()), parentSmsConsent }))
          : rows.map(({ parentPhone: _parentPhone, parentSmsConsent: _consent, ...row }) => row);
        break;
      }
      case 'faculty': {
        let rows = await db.select({ id: facultyProfiles.id, userId: users.id, name: users.fullName, email: users.email, phone: users.phone, facultyCode: facultyProfiles.facultyCode, designation: facultyProfiles.designation, departmentId: departments.id, department: departments.code, active: facultyProfiles.active }).from(facultyProfiles).innerJoin(users, eq(facultyProfiles.userId, users.id)).innerJoin(departments, eq(facultyProfiles.departmentId, departments.id)).orderBy(users.fullName).limit(500);
        if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        if (user.role === 'FACULTY') rows = rows.filter((r) => r.userId === user.id);
        if (user.role === 'STUDENT') return fail(res, 403, 'Students cannot view the faculty directory');
        data = rows; break;
      }
      case 'departments':
        data = user.role === 'HOD' && user.departmentId ? await db.select().from(departments).where(eq(departments.id, user.departmentId)) : await db.select().from(departments).orderBy(departments.name);
        break;
      case 'courses':
        data = await db.select({ id: courses.id, name: courses.name, degree: courses.degree, durationYears: courses.durationYears, departmentId: departments.id, department: departments.code }).from(courses).innerJoin(departments, eq(courses.departmentId, departments.id)).where(user.role === 'HOD' && user.departmentId ? eq(departments.id, user.departmentId) : undefined).orderBy(courses.name);
        break;
      case 'sections':
        data = await db.select({ id: sections.id, year: sections.year, section: sections.name, active: sections.active, departmentId: departments.id, department: departments.code, course: courses.name }).from(sections).innerJoin(departments, eq(sections.departmentId, departments.id)).leftJoin(courses, eq(sections.courseId, courses.id)).where(user.role === 'HOD' && user.departmentId ? eq(departments.id, user.departmentId) : undefined).orderBy(departments.code, sections.year, sections.name);
        break;
      case 'faculty-subjects': {
        if (user.role === 'STUDENT') return fail(res, 403, 'Students cannot view faculty assignment records');
        const { facultyId } = await getFacultyScopes(user.id);
        data = await db.select({ id: facultySubjects.id, faculty: users.fullName, facultyCode: facultyProfiles.facultyCode, subjectId: subjects.id, subject: subjects.name, code: subjects.code, sectionId: sections.id, section: sections.name, year: sections.year, departmentId: departments.id, department: departments.code }).from(facultySubjects).innerJoin(facultyProfiles, eq(facultySubjects.facultyId, facultyProfiles.id)).innerJoin(users, eq(facultyProfiles.userId, users.id)).innerJoin(subjects, eq(facultySubjects.subjectId, subjects.id)).innerJoin(sections, eq(facultySubjects.sectionId, sections.id)).innerJoin(departments, eq(sections.departmentId, departments.id)).where(facultyId ? eq(facultySubjects.facultyId, facultyId) : user.role === 'HOD' && user.departmentId ? eq(departments.id, user.departmentId) : undefined);
        break;
      }
      case 'subjects': {
        let rows = await db.select({ id: subjects.id, code: subjects.code, name: subjects.name, semesterNumber: subjects.semesterNumber, departmentId: departments.id, department: departments.code }).from(subjects).innerJoin(departments, eq(subjects.departmentId, departments.id)).orderBy(subjects.code);
        if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        else if (user.role === 'FACULTY') { const { scopes } = await getFacultyScopes(user.id); const ids = new Set([...scopes].map((key) => key.split(':')[0])); rows = rows.filter((r) => ids.has(r.id)); }
        else if (user.role === 'STUDENT') { const student = await getStudent(user.id); rows = rows.filter((r) => student && r.departmentId === student.departmentId); }
        data = rows; break;
      }
      case 'classes': {
        let rows = await db.select({ subjectId: subjects.id, code: subjects.code, subject: subjects.name, sectionId: sections.id, section: sections.name, year: sections.year, departmentId: departments.id, department: departments.code }).from(facultySubjects).innerJoin(subjects, eq(facultySubjects.subjectId, subjects.id)).innerJoin(sections, eq(facultySubjects.sectionId, sections.id)).innerJoin(departments, eq(sections.departmentId, departments.id));
        if (user.role === 'FACULTY') { const { facultyId } = await getFacultyScopes(user.id); rows = facultyId ? rows.filter((r) => true) : []; if (facultyId) { const owned = await db.select({ subjectId: facultySubjects.subjectId, sectionId: facultySubjects.sectionId }).from(facultySubjects).where(eq(facultySubjects.facultyId, facultyId)); const scope = new Set(owned.map((x) => `${x.subjectId}:${x.sectionId}`)); rows = rows.filter((r) => scope.has(`${r.subjectId}:${r.sectionId}`)); } }
        else if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        else if (user.role === 'STUDENT') { const student = await getStudent(user.id); rows = rows.filter((r) => student && r.sectionId === student.sectionId); }
        data = rows; break;
      }
      case 'timetable': {
        const student = user.role === 'STUDENT' ? await getStudent(user.id) : undefined;
        const { facultyId } = user.role === 'FACULTY' ? await getFacultyScopes(user.id) : { facultyId: undefined };
        data = await db.select({ id: timetables.id, dayOfWeek: timetables.dayOfWeek, startTime: timetables.startTime, endTime: timetables.endTime, room: timetables.room, subject: subjects.name, code: subjects.code, section: sections.name, year: sections.year, faculty: users.fullName }).from(timetables).innerJoin(subjects, eq(timetables.subjectId, subjects.id)).innerJoin(sections, eq(timetables.sectionId, sections.id)).innerJoin(facultyProfiles, eq(timetables.facultyId, facultyProfiles.id)).innerJoin(users, eq(facultyProfiles.userId, users.id)).where(student ? eq(timetables.sectionId, student.sectionId) : facultyId ? eq(timetables.facultyId, facultyId) : user.role === 'HOD' && user.departmentId ? eq(sections.departmentId, user.departmentId) : undefined).orderBy(timetables.dayOfWeek, timetables.startTime);
        break;
      }
      case 'exams': {
        const student = user.role === 'STUDENT' ? await getStudent(user.id) : undefined;
        const faculty = user.role === 'FACULTY' ? await getFacultyScopes(user.id) : undefined;
        let rows = await db.select({ id: examinations.id, name: examinations.name, type: examinations.type, date: examinations.examDate, startTime: examinations.startTime, room: examinations.room, subjectId: subjects.id, subject: subjects.name, departmentId: departments.id, department: departments.code, year: examinations.year, sectionId: examinations.sectionId }).from(examinations).innerJoin(departments, eq(examinations.departmentId, departments.id)).leftJoin(subjects, eq(examinations.subjectId, subjects.id)).orderBy(examinations.examDate).limit(200);
        if (student) rows = rows.filter((r) => r.departmentId === student.departmentId && r.year === student.year && (!r.sectionId || r.sectionId === student.sectionId));
        else if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        else if (faculty) rows = rows.filter((r) => [...faculty.scopes].some((key) => key.startsWith(`${r.subjectId}:`) && (!r.sectionId || key.endsWith(`:${r.sectionId}`))));
        data = rows.map(({ departmentId: _departmentId, sectionId: _sectionId, ...r }) => r); break;
      }
      case 'results': {
        const student = user.role === 'STUDENT' ? await getStudent(user.id) : undefined;
        const faculty = user.role === 'FACULTY' ? await getFacultyScopes(user.id) : undefined;
        let rows = await db.select({ id: marks.id, student: users.fullName, rollNumber: studentProfiles.rollNumber, departmentId: studentProfiles.departmentId, sectionId: studentProfiles.sectionId, subjectId: marks.subjectId, examination: examinations.name, subject: subjects.name, internal: marks.internal, external: marks.external, grade: marks.grade, result: marks.result, reviewed: marks.reviewedAt, published: results.published }).from(marks).innerJoin(studentProfiles, eq(marks.studentId, studentProfiles.id)).innerJoin(users, eq(studentProfiles.userId, users.id)).innerJoin(examinations, eq(marks.examinationId, examinations.id)).innerJoin(subjects, eq(marks.subjectId, subjects.id)).leftJoin(results, and(eq(results.studentId, marks.studentId), eq(results.examinationId, marks.examinationId))).limit(500);
        if (student) rows = rows.filter((r) => r.rollNumber && r.departmentId === student.departmentId && r.sectionId === student.sectionId && r.published === true);
        else if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        else if (faculty) rows = rows.filter((r) => faculty.scopes.has(`${r.subjectId}:${r.sectionId}`));
        data = rows.map(({ departmentId: _departmentId, sectionId: _sectionId, subjectId: _subjectId, ...r }) => r); break;
      }
      case 'fees': {
        if (['FACULTY', 'HOD'].includes(user.role)) return fail(res, 403, 'Fee records are limited to students and institution leadership');
        const student = user.role === 'STUDENT' ? await getStudent(user.id) : undefined;
        data = student ? await db.select().from(fees).where(eq(fees.studentId, student.id)) : await db.select({ id: fees.id, student: users.fullName, rollNumber: studentProfiles.rollNumber, category: fees.category, amount: fees.amount, paidAmount: fees.paidAmount, dueDate: fees.dueDate, status: fees.status }).from(fees).innerJoin(studentProfiles, eq(fees.studentId, studentProfiles.id)).innerJoin(users, eq(studentProfiles.userId, users.id)).limit(500);
        break;
      }
      case 'assignments': {
        if (user.role === 'PRINCIPAL' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return fail(res, 403, 'Class assignments are not part of this institution-wide module');
        const student = user.role === 'STUDENT' ? await getStudent(user.id) : undefined;
        const faculty = user.role === 'FACULTY' ? await getFacultyScopes(user.id) : undefined;
        let rows = await db.select({ id: assignments.id, title: assignments.title, description: assignments.description, dueAt: assignments.dueAt, subjectId: subjects.id, subject: subjects.name, sectionId: sections.id, section: sections.name, departmentId: sections.departmentId }).from(assignments).innerJoin(subjects, eq(assignments.subjectId, subjects.id)).innerJoin(sections, eq(assignments.sectionId, sections.id)).orderBy(assignments.dueAt).limit(200);
        if (student) rows = rows.filter((r) => r.sectionId === student.sectionId);
        else if (user.role === 'HOD' && user.departmentId) rows = rows.filter((r) => r.departmentId === user.departmentId);
        else if (faculty) rows = rows.filter((r) => faculty.scopes.has(`${r.subjectId}:${r.sectionId}`));
        data = rows.map(({ departmentId: _departmentId, sectionId: _sectionId, subjectId: _subjectId, ...r }) => r); break;
      }
      case 'events': data = await db.select().from(events).orderBy(desc(events.startsAt)).limit(200); break;
      case 'notices': {
        let rows = await db.select().from(notices).where(eq(notices.published, true)).orderBy(desc(notices.publishedAt)).limit(200);
        if (user.role === 'STUDENT') { const student = await getStudent(user.id); rows = rows.filter((n) => n.audience === 'ALL_STUDENTS' || (n.audience === 'DEPARTMENT' && n.departmentId === student?.departmentId) || (n.audience === 'YEAR' && n.departmentId === student?.departmentId && n.year === student?.year) || (n.audience === 'SECTION' && n.sectionId === student?.sectionId)); }
        else if (user.role === 'HOD') rows = rows.filter((n) => n.audience === 'ALL_STUDENTS' || n.departmentId === user.departmentId);
        else if (user.role === 'FACULTY') { const { scopes } = await getFacultyScopes(user.id); const sectionIds = new Set([...scopes].map((key) => key.split(':')[1])); rows = rows.filter((n) => n.audience === 'ALL_STUDENTS' || (n.audience === 'SECTION' && n.sectionId && sectionIds.has(n.sectionId))); }
        data = rows; break;
      }
      case 'notifications': data = await db.select().from(notifications).where(eq(notifications.recipientId, user.id)).orderBy(desc(notifications.createdAt)).limit(100); break;
      case 'audit-logs':
        if (!['ADMIN', 'SUPER_ADMIN', 'PRINCIPAL'].includes(user.role)) return fail(res, 403, 'Only institution leadership can view audit logs');
        data = await db.select({ id: auditLogs.id, action: auditLogs.action, module: auditLogs.module, recordId: auditLogs.recordId, createdAt: auditLogs.createdAt, actor: users.fullName }).from(auditLogs).leftJoin(users, eq(auditLogs.actorId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(200); break;
      case 'sms':
        if (!['ADMIN', 'SUPER_ADMIN', 'PRINCIPAL'].includes(user.role)) return fail(res, 403, 'Only Admin or Principal can manage SMS');
        data = await db.select().from(smsCampaigns).orderBy(desc(smsCampaigns.createdAt)).limit(100); break;
      default: return fail(res, 404, `Module '${resource}' is not available`);
    }
    return ok(res, data);
  } catch (e) { next(e); }
});
