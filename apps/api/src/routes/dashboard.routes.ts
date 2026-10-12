import { Router } from 'express';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { academicYears, attendanceRecords, attendanceSessions, departments, examinations, facultyProfiles, facultySubjects, fees, notices, notifications, sections, studentProfiles, subjects, timetables, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';

export const dashboardRouter = Router();
dashboardRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role === 'STUDENT') {
      const [student] = await db.select({ id: studentProfiles.id, roll: studentProfiles.rollNumber, year: studentProfiles.year, sectionId: studentProfiles.sectionId, departmentId: studentProfiles.departmentId, section: sections.name, department: departments.name })
        .from(studentProfiles).innerJoin(sections, eq(studentProfiles.sectionId, sections.id)).innerJoin(departments, eq(studentProfiles.departmentId, departments.id)).where(eq(studentProfiles.userId, user.id)).limit(1);
      if (!student) return fail(res, 404, 'Student profile not found');
      const recordRows = await db.select({ status: attendanceRecords.status }).from(attendanceRecords).where(eq(attendanceRecords.studentId, student.id));
      const total = recordRows.length, attended = recordRows.filter((r) => r.status !== 'ABSENT').length;
      const [pendingFees] = await db.select({ due: sql<number>`coalesce(sum(${fees.amount} - ${fees.paidAmount}), 0)` }).from(fees).where(eq(fees.studentId, student.id));
      const classes = await db.select({ subject: subjects.name, code: subjects.code, startTime: timetables.startTime, room: timetables.room }).from(timetables).innerJoin(subjects, eq(timetables.subjectId, subjects.id)).where(eq(timetables.sectionId, student.sectionId)).limit(5);
      const upcoming = await db.select({ name: examinations.name, subject: subjects.name, date: examinations.examDate }).from(examinations).leftJoin(subjects, eq(examinations.subjectId, subjects.id)).where(and(eq(examinations.departmentId, student.departmentId), gte(examinations.examDate, new Date().toISOString().slice(0, 10)))).limit(1);
      const recent = await db.select({ title: notices.title, priority: notices.priority, publishedAt: notices.publishedAt }).from(notices).where(eq(notices.published, true)).orderBy(sql`${notices.publishedAt} desc`).limit(3);
      const unread = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.recipientId, user.id), sql`${notifications.readAt} is null`));
      return ok(res, { role: user.role, greeting: user.fullName, profile: { rollNumber: student.roll, year: student.year, section: student.section, department: student.department }, stats: [{ label: 'Overall attendance', value: `${total ? Math.round(attended / total * 1000) / 10 : 0}%`, tone: attended / Math.max(total, 1) >= 0.75 ? 'good' : 'warning' }, { label: 'Classes attended', value: `${attended}/${total}`, tone: 'neutral' }, { label: 'Pending fees', value: `₹${Number(pendingFees?.due ?? 0).toLocaleString('en-IN')}`, tone: 'warning' }, { label: 'Unread notifications', value: unread.length, tone: 'neutral' }], todayClasses: classes, upcomingExams: upcoming, notices: recent });
    }
    const scoped = user.role === 'HOD' && user.departmentId ? eq(studentProfiles.departmentId, user.departmentId) : undefined;
    const scopedFaculty = user.role === 'HOD' && user.departmentId ? eq(facultyProfiles.departmentId, user.departmentId) : undefined;
    const [studentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(studentProfiles).where(scoped);
    const [facultyCount] = await db.select({ count: sql<number>`count(*)::int` }).from(facultyProfiles).where(scopedFaculty);
    const [deptCount] = await db.select({ count: sql<number>`count(*)::int` }).from(departments).where(user.role === 'HOD' && user.departmentId ? eq(departments.id, user.departmentId) : undefined);
    const attendanceScope = user.role === 'HOD' && user.departmentId ? eq(sections.departmentId, user.departmentId) : undefined;
    const attendanceRows = await db.select({ status: attendanceRecords.status }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).innerJoin(sections, eq(attendanceSessions.sectionId, sections.id)).where(attendanceScope);
    const attendancePercent = attendanceRows.length ? Math.round(attendanceRows.filter((r) => r.status !== 'ABSENT').length / attendanceRows.length * 1000) / 10 : 0;
    const [noticeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(notices).where(eq(notices.published, true));
    const [examCount] = await db.select({ count: sql<number>`count(*)::int` }).from(examinations).where(user.role === 'HOD' && user.departmentId ? eq(examinations.departmentId, user.departmentId) : undefined);
    const [feeTotals] = await db.select({ amount: sql<number>`coalesce(sum(${fees.amount}),0)::float`, paid: sql<number>`coalesce(sum(${fees.paidAmount}),0)::float` }).from(fees);
    const attendanceThreshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
    const lowCount = user.role === 'HOD' ? (await db.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id)).innerJoin(sections, eq(attendanceSessions.sectionId, sections.id)).where(attendanceScope)).length : 0;
    const stats = user.role === 'FACULTY'
      ? [{ label: 'Assigned classes', value: (await db.select({ id: facultySubjects.id }).from(facultySubjects).innerJoin(facultyProfiles, eq(facultySubjects.facultyId, facultyProfiles.id)).where(eq(facultyProfiles.userId, user.id))).length, tone: 'neutral' }, { label: 'Students', value: studentCount?.count ?? 0, tone: 'neutral' }, { label: 'Attendance today', value: attendancePercent + '%', tone: 'good' }, { label: 'Upcoming exams', value: examCount?.count ?? 0, tone: 'neutral' }]
      : [{ label: 'Students', value: studentCount?.count ?? 0, tone: 'neutral' }, { label: 'Faculty', value: facultyCount?.count ?? 0, tone: 'neutral' }, ...(user.role === 'PRINCIPAL' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ label: 'Departments', value: deptCount?.count ?? 0, tone: 'neutral' }] : []), { label: 'Average attendance', value: `${attendancePercent}%`, tone: attendancePercent >= attendanceThreshold ? 'good' : 'warning' }, ...(user.role === 'HOD' ? [{ label: 'Below threshold records', value: lowCount, tone: 'warning' }] : []), { label: 'Active notices', value: noticeCount?.count ?? 0, tone: 'neutral' }, { label: 'Upcoming exams', value: examCount?.count ?? 0, tone: 'neutral' }, ...(user.role === 'PRINCIPAL' || user.role === 'ADMIN' ? [{ label: 'Fee collection', value: `${Math.round(Number(feeTotals?.amount) ? Number(feeTotals?.paid) / Number(feeTotals?.amount) * 100 : 0)}%`, tone: 'good' }] : [])];
    return ok(res, { role: user.role, greeting: user.fullName, departmentId: user.departmentId, stats });
  } catch (e) { next(e); }
});
