import { Router } from 'express';
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { attendanceRecords, attendanceSessions, departments, facultyProfiles, facultySubjects, notifications, sections, studentProfiles, subjects, users } from '../db/schema';
import { allowRoles, requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { writeAudit } from '../services/audit.service';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);
const isUuid = z.string().uuid();
const getFacultyId = async (userId: string) => (await db.select({ id: facultyProfiles.id }).from(facultyProfiles).where(eq(facultyProfiles.userId, userId)).limit(1))[0]?.id;
const canTeach = async (facultyId: string, subjectId: string, sectionId: string) => (await db.select({ id: facultySubjects.id }).from(facultySubjects).where(and(eq(facultySubjects.facultyId, facultyId), eq(facultySubjects.subjectId, subjectId), eq(facultySubjects.sectionId, sectionId))).limit(1)).length > 0;
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

attendanceRouter.get('/register/classes', allowRoles('FACULTY', 'ADMIN', 'SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try {
    const facultyId = req.user!.role === 'FACULTY' ? await getFacultyId(req.user!.id) : undefined;
    const rows = await db.select({ subjectId: subjects.id, subjectCode: subjects.code, subjectName: subjects.name, sectionId: sections.id, sectionName: sections.name, year: sections.year, departmentId: departments.id, departmentName: departments.name, departmentCode: departments.code })
      .from(facultySubjects).innerJoin(facultyProfiles, eq(facultySubjects.facultyId, facultyProfiles.id)).innerJoin(subjects, eq(facultySubjects.subjectId, subjects.id)).innerJoin(sections, eq(facultySubjects.sectionId, sections.id)).innerJoin(departments, eq(sections.departmentId, departments.id))
      .where(facultyId ? eq(facultySubjects.facultyId, facultyId) : undefined);
    return ok(res, rows);
  } catch (e) { next(e); }
});

attendanceRouter.get('/register', allowRoles('FACULTY', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const query = z.object({ subjectId: isUuid, sectionId: isUuid, date: dateQuery }).safeParse(req.query);
    if (!query.success) return fail(res, 400, 'Select a subject, section, and valid date', 'VALIDATION_ERROR');
    const { subjectId, sectionId, date } = query.data;
    const facultyId = req.user!.role === 'FACULTY' ? await getFacultyId(req.user!.id) : undefined;
    if (req.user!.role === 'FACULTY' && (!facultyId || !(await canTeach(facultyId, subjectId, sectionId)))) return fail(res, 403, 'This class is not assigned to your faculty account', 'CLASS_NOT_ASSIGNED');
    const [classInfo] = await db.select({ subjectId: subjects.id, subjectCode: subjects.code, subjectName: subjects.name, departmentId: departments.id, departmentName: departments.name, departmentCode: departments.code, year: sections.year, sectionId: sections.id, sectionName: sections.name })
      .from(subjects).innerJoin(departments, eq(subjects.departmentId, departments.id)).innerJoin(sections, eq(sections.departmentId, departments.id))
      .where(and(eq(subjects.id, subjectId), eq(sections.id, sectionId))).limit(1);
    if (!classInfo) return fail(res, 404, 'Class or subject not found');
    const [faculty] = await db.select({ name: users.fullName, facultyId: facultyProfiles.id }).from(facultyProfiles).innerJoin(users, eq(facultyProfiles.userId, users.id)).where(facultyId ? eq(facultyProfiles.id, facultyId) : eq(facultyProfiles.userId, req.user!.id)).limit(1);
    const students = await db.select({ id: studentProfiles.id, rollNumber: studentProfiles.rollNumber, name: users.fullName, userId: users.id })
      .from(studentProfiles).innerJoin(users, eq(studentProfiles.userId, users.id)).where(and(eq(studentProfiles.sectionId, sectionId), eq(studentProfiles.active, true))).orderBy(studentProfiles.rollNumber);
    const [session] = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(eq(attendanceSessions.subjectId, subjectId), eq(attendanceSessions.sectionId, sectionId), eq(attendanceSessions.classDate, date))).limit(1);
    const records = await db.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).where(and(eq(attendanceSessions.subjectId, subjectId), eq(attendanceSessions.sectionId, sectionId), eq(attendanceSessions.classDate, date)));
    const history = await db.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).where(and(eq(attendanceSessions.subjectId, subjectId), eq(attendanceSessions.sectionId, sectionId)));
    const statuses = new Map(records.map((r) => [r.studentId, r.status]));
    const totals = new Map<string, { attended: number; total: number }>();
    for (const record of history) { const item = totals.get(record.studentId) ?? { attended: 0, total: 0 }; item.total++; if (record.status !== 'ABSENT') item.attended++; totals.set(record.studentId, item); }
    const roster = students.map((student) => {
      const count = totals.get(student.id) ?? { attended: 0, total: 0 };
      return { ...student, status: statuses.get(student.id) ?? 'PRESENT', attendancePercentage: count.total ? Math.round((count.attended / count.total) * 1000) / 10 : 0 };
    });
    return ok(res, { classInfo, facultyName: faculty?.name ?? 'Authorized administrator', date, total: roster.length, existingSession: Boolean(session), sessionId: session?.id ?? null, students: roster });
  } catch (e) { next(e); }
});

const saveSchema = z.object({ subjectId: isUuid, sectionId: isUuid, date: dateQuery, records: z.array(z.object({ studentId: isUuid, status: z.enum(['PRESENT', 'ABSENT', 'LATE']) })).min(1).max(500) }).superRefine((v, ctx) => {
  const seen = new Set<string>(); v.records.forEach((r, i) => { if (seen.has(r.studentId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records', i, 'studentId'], message: 'Duplicate student entry' }); seen.add(r.studentId); });
});
attendanceRouter.post('/', allowRoles('FACULTY', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? 'Invalid attendance data', 'VALIDATION_ERROR');
    const data = parsed.data;
    const facultyId = req.user!.role === 'FACULTY' ? await getFacultyId(req.user!.id) : undefined;
    if (req.user!.role === 'FACULTY' && (!facultyId || !(await canTeach(facultyId, data.subjectId, data.sectionId)))) return fail(res, 403, 'You can only mark attendance for your assigned classes', 'CLASS_NOT_ASSIGNED');
    const [subject] = await db.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, data.subjectId)).limit(1);
    const [section] = await db.select({ id: sections.id, departmentId: sections.departmentId }).from(sections).where(eq(sections.id, data.sectionId)).limit(1);
    if (!subject || !section) return fail(res, 404, 'Subject or section not found');
    const validStudents = await db.select({ id: studentProfiles.id, userId: studentProfiles.userId }).from(studentProfiles).where(and(eq(studentProfiles.sectionId, data.sectionId), eq(studentProfiles.active, true)));
    const validIds = new Set(validStudents.map((s) => s.id));
    if (data.records.some((r) => !validIds.has(r.studentId))) return fail(res, 400, 'Attendance includes a student outside this section', 'STUDENT_NOT_IN_SECTION');
    const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
    const changed: Array<{ studentId: string; oldStatus: string | null; newStatus: string }> = [];
    const alerts: Array<{ userId: string; percentage: number }> = [];
    const session = await db.transaction(async (tx) => {
      const [current] = await tx.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(eq(attendanceSessions.subjectId, data.subjectId), eq(attendanceSessions.sectionId, data.sectionId), eq(attendanceSessions.classDate, data.date))).limit(1);
      const previous = current ? await tx.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).where(eq(attendanceRecords.sessionId, current.id)) : [];
      const priorCounts = new Map<string, { attended: number; total: number }>();
      const allHistory = await tx.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).where(and(eq(attendanceSessions.subjectId, data.subjectId), eq(attendanceSessions.sectionId, data.sectionId)));
      for (const row of allHistory) { const c = priorCounts.get(row.studentId) ?? { attended: 0, total: 0 }; c.total++; if (row.status !== 'ABSENT') c.attended++; priorCounts.set(row.studentId, c); }
      const [sessionRow] = await tx.insert(attendanceSessions).values({ subjectId: data.subjectId, sectionId: data.sectionId, facultyId: facultyId ?? (await tx.select({ id: facultyProfiles.id }).from(facultyProfiles).limit(1))[0].id, classDate: data.date, markedBy: req.user!.id })
        .onConflictDoUpdate({ target: [attendanceSessions.subjectId, attendanceSessions.sectionId, attendanceSessions.classDate], set: { updatedAt: new Date(), markedBy: req.user!.id } }).returning({ id: attendanceSessions.id });
      const previousMap = new Map(previous.map((r) => [r.studentId, r.status]));
      for (const record of data.records) {
        const oldStatus = previousMap.get(record.studentId) ?? null;
        changed.push({ studentId: record.studentId, oldStatus, newStatus: record.status });
        await tx.insert(attendanceRecords).values({ sessionId: sessionRow.id, studentId: record.studentId, status: record.status, markedBy: req.user!.id })
          .onConflictDoUpdate({ target: [attendanceRecords.sessionId, attendanceRecords.studentId], set: { status: record.status, markedBy: req.user!.id, updatedAt: new Date() } });
        const prior = priorCounts.get(record.studentId) ?? { attended: 0, total: 0 };
        const adjusted = { attended: prior.attended - (oldStatus && oldStatus !== 'ABSENT' ? 1 : 0) + (record.status !== 'ABSENT' ? 1 : 0), total: prior.total + (oldStatus ? 0 : 1) };
        const oldPct = prior.total ? prior.attended / prior.total * 100 : 100;
        const newPct = adjusted.total ? adjusted.attended / adjusted.total * 100 : 0;
        if (newPct < threshold && oldPct >= threshold) {
          const student = validStudents.find((s) => s.id === record.studentId);
          if (student) alerts.push({ userId: student.userId, percentage: Math.round(newPct * 10) / 10 });
        }
      }
      for (const alert of alerts) await tx.insert(notifications).values({ recipientId: alert.userId, title: 'Low attendance alert', message: `Your ${subject.code} attendance is ${alert.percentage}%. The minimum threshold is ${threshold}%. Please improve your attendance.`, type: 'LOW_ATTENDANCE', status: 'IN_APP', metadata: { subjectId: subject.id, date: data.date, percentage: alert.percentage } });
      return sessionRow;
    });
    await writeAudit({ actorId: req.user!.id, action: 'ATTENDANCE_SAVED', module: 'ATTENDANCE', recordId: session.id, newValue: { subjectId: data.subjectId, sectionId: data.sectionId, date: data.date, records: changed }, ip: req.ip });
    const counts = data.records.reduce((a, r) => { a[r.status.toLowerCase() as 'present' | 'absent' | 'late']++; return a; }, { present: 0, absent: 0, late: 0 });
    const total = data.records.length;
    return ok(res, { sessionId: session.id, total, ...counts, percentage: total ? Math.round(((counts.present + counts.late) / total) * 1000) / 10 : 0, lowAttendanceAlerts: alerts.length }, 'Attendance saved successfully');
  } catch (e) { next(e); }
});

attendanceRouter.get('/me', allowRoles('STUDENT'), async (req, res, next) => {
  try {
    const [student] = await db.select({ id: studentProfiles.id }).from(studentProfiles).where(eq(studentProfiles.userId, req.user!.id)).limit(1);
    if (!student) return fail(res, 404, 'Student profile not found');
    const rows = await db.select({ subjectId: subjects.id, subjectCode: subjects.code, subjectName: subjects.name, classDate: attendanceSessions.classDate, status: attendanceRecords.status })
      .from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id)).where(eq(attendanceRecords.studentId, student.id)).orderBy(desc(attendanceSessions.classDate));
    const groups = new Map<string, { subjectId: string; subjectCode: string; subjectName: string; total: number; present: number; absent: number; late: number; history: Array<{ date: string; status: string }> }>();
    for (const r of rows) { const g = groups.get(r.subjectId) ?? { subjectId: r.subjectId, subjectCode: r.subjectCode, subjectName: r.subjectName, total: 0, present: 0, absent: 0, late: 0, history: [] }; g.total++; g[r.status.toLowerCase() as 'present' | 'absent' | 'late']++; g.history.push({ date: String(r.classDate), status: r.status }); groups.set(r.subjectId, g); }
    const subjectsData = [...groups.values()].map((g) => ({ ...g, attendancePercentage: g.total ? Math.round(((g.present + g.late) / g.total) * 1000) / 10 : 0 }));
    const total = subjectsData.reduce((n, s) => n + s.total, 0), attended = subjectsData.reduce((n, s) => n + s.present + s.late, 0);
    return ok(res, { overall: { total, attended, absent: total - attended, percentage: total ? Math.round(attended / total * 1000) / 10 : 0 }, subjects: subjectsData });
  } catch (e) { next(e); }
});

attendanceRouter.get('/history', allowRoles('FACULTY', 'HOD', 'PRINCIPAL', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const facultyId = req.user!.role === 'FACULTY' ? await getFacultyId(req.user!.id) : undefined;
    const sessions = await db.select({ id: attendanceSessions.id, date: attendanceSessions.classDate, subject: subjects.name, code: subjects.code, section: sections.name, year: sections.year, departmentId: sections.departmentId, department: departments.code, facultyId: attendanceSessions.facultyId })
      .from(attendanceSessions).innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id)).innerJoin(sections, eq(attendanceSessions.sectionId, sections.id)).innerJoin(departments, eq(sections.departmentId, departments.id))
      .where(facultyId ? eq(attendanceSessions.facultyId, facultyId) : req.user!.role === 'HOD' && req.user!.departmentId ? eq(sections.departmentId, req.user!.departmentId) : undefined).orderBy(desc(attendanceSessions.classDate)).limit(100);
    const records = await db.select({ sessionId: attendanceRecords.sessionId, status: attendanceRecords.status }).from(attendanceRecords);
    return ok(res, sessions.map((s) => { const rows = records.filter((r) => r.sessionId === s.id); const present = rows.filter((r) => r.status === 'PRESENT').length, absent = rows.filter((r) => r.status === 'ABSENT').length, late = rows.filter((r) => r.status === 'LATE').length; return { ...s, total: rows.length, present, absent, late, percentage: rows.length ? Math.round((present + late) / rows.length * 1000) / 10 : 0 }; }));
  } catch (e) { next(e); }
});

attendanceRouter.get('/analytics', allowRoles('HOD', 'PRINCIPAL', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const rows = await db.select({ departmentId: departments.id, department: departments.code, departmentName: departments.name, year: sections.year, section: sections.name, subject: subjects.code, studentId: studentProfiles.id, roll: studentProfiles.rollNumber, studentName: users.fullName, status: attendanceRecords.status, date: attendanceSessions.classDate, facultyId: attendanceSessions.facultyId })
      .from(attendanceRecords).innerJoin(studentProfiles, eq(attendanceRecords.studentId, studentProfiles.id)).innerJoin(users, eq(studentProfiles.userId, users.id)).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).innerJoin(sections, eq(attendanceSessions.sectionId, sections.id)).innerJoin(departments, eq(sections.departmentId, departments.id)).innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
      .where(req.user!.role === 'HOD' && req.user!.departmentId ? eq(departments.id, req.user!.departmentId) : undefined);
    const eligible = rows.length, attended = rows.filter((r) => r.status !== 'ABSENT').length, threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
    const aggregate = (key: (r: typeof rows[number]) => string) => {
      const m = new Map<string, { total: number; attended: number }>();
      rows.forEach((r) => { const k = key(r), v = m.get(k) ?? { total: 0, attended: 0 }; v.total++; if (r.status !== 'ABSENT') v.attended++; m.set(k, v); });
      return [...m.entries()].map(([name, v]) => ({ name, total: v.total, percentage: v.total ? Math.round(v.attended / v.total * 1000) / 10 : 0 }));
    };
    const byStudent = new Map<string, { id: string; name: string; roll: string; total: number; attended: number; department: string }>();
    rows.forEach((r) => { const v = byStudent.get(r.studentId) ?? { id: r.studentId, name: r.studentName, roll: r.roll, total: 0, attended: 0, department: r.department }; v.total++; if (r.status !== 'ABSENT') v.attended++; byStudent.set(r.studentId, v); });
    const lowAttendance = [...byStudent.values()].filter((s) => s.total > 0 && s.attended / s.total * 100 < threshold).map((s) => ({ ...s, percentage: Math.round(s.attended / s.total * 1000) / 10 }));
    return ok(res, { overall: { classes: new Set(rows.map((r) => `${r.date}-${r.subject}-${r.section}`)).size, records: eligible, percentage: eligible ? Math.round(attended / eligible * 1000) / 10 : 0, threshold }, byYear: aggregate((r) => `${r.year}${r.year === 1 ? 'st' : r.year === 2 ? 'nd' : r.year === 3 ? 'rd' : 'th'} Year`), bySection: aggregate((r) => `${r.year}${r.section}`), bySubject: aggregate((r) => r.subject), byDepartment: aggregate((r) => r.department), lowAttendance, records: rows.slice(0, 200) });
  } catch (e) { next(e); }
});
