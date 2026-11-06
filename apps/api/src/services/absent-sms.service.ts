import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { attendanceRecords, attendanceSessions, departments, facultyProfiles, facultySubjects, sections, smsCampaigns, smsRecipients, studentProfiles, subjects, users } from '../db/schema';
import { maskPhone, normalizePhone, renderAbsentMessage, smsDeliveryMode, smsProvider, type SmsDeliveryMode } from './sms.service';
import { writeAudit } from './audit.service';
import type { AuthUser } from '../types/auth';

export type SessionInfo = { id: string; date: string; subjectId: string; subjectCode: string; sectionId: string; departmentId: string; departmentName: string };
export type AbsentItem = {
  studentId: string; userId: string; name: string; rollNumber: string; department: string; date: string;
  phone: string | null; maskedPhone: string | null; eligible: boolean; reason: string | null; message: string;
};

export async function loadSession(sessionId: string): Promise<SessionInfo | null> {
  const [row] = await db.select({ id: attendanceSessions.id, date: attendanceSessions.classDate, subjectId: subjects.id, subjectCode: subjects.code, sectionId: sections.id, departmentId: departments.id, departmentName: departments.name })
    .from(attendanceSessions).innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id)).innerJoin(sections, eq(attendanceSessions.sectionId, sections.id))
    .innerJoin(departments, eq(sections.departmentId, departments.id)).where(eq(attendanceSessions.id, sessionId)).limit(1);
  return row ? { ...row, date: String(row.date) } : null;
}

/** Server-side authorization: admins any; HOD own department; faculty only classes assigned to them. */
export async function canAccessSession(user: AuthUser, session: SessionInfo): Promise<boolean> {
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'HOD') return Boolean(user.departmentId) && user.departmentId === session.departmentId;
  if (user.role !== 'FACULTY') return false;
  const rows = await db.select({ id: facultySubjects.id }).from(facultySubjects).innerJoin(facultyProfiles, eq(facultySubjects.facultyId, facultyProfiles.id))
    .where(and(eq(facultyProfiles.userId, user.id), eq(facultySubjects.subjectId, session.subjectId), eq(facultySubjects.sectionId, session.sectionId))).limit(1);
  return rows.length > 0;
}

export async function buildPlan(session: SessionInfo, mode: SmsDeliveryMode): Promise<AbsentItem[]> {
  const rows = await db.select({ studentId: studentProfiles.id, userId: users.id, name: users.fullName, rollNumber: studentProfiles.rollNumber, parentPhone: studentProfiles.parentPhone, consent: studentProfiles.parentSmsConsent, isDemo: users.isDemo })
    .from(attendanceRecords).innerJoin(studentProfiles, eq(attendanceRecords.studentId, studentProfiles.id)).innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(and(eq(attendanceRecords.sessionId, session.id), eq(attendanceRecords.status, 'ABSENT'))).orderBy(studentProfiles.rollNumber);
  return rows.map((r) => {
    const phone = normalizePhone(r.parentPhone);
    let reason: string | null = null;
    if (!phone) reason = r.parentPhone?.trim() ? 'Invalid parent mobile number' : 'No parent mobile number';
    else if (mode === 'gateway' && r.isDemo) reason = 'Demo student (live SMS blocked)';
    else if (mode === 'gateway' && !r.consent) reason = 'Parent consent not recorded';
    return { studentId: r.studentId, userId: r.userId, name: r.name, rollNumber: r.rollNumber, department: session.departmentName, date: session.date,
      phone, maskedPhone: phone ? maskPhone(phone) : null, eligible: !reason, reason,
      message: renderAbsentMessage({ studentName: r.name, rollNumber: r.rollNumber, department: session.departmentName, date: session.date }) };
  });
}

/** Preview never exposes unmasked phone numbers. */
export async function previewAbsent(session: SessionInfo) {
  const mode = smsDeliveryMode();
  const plan = await buildPlan(session, mode);
  const existing = await existingRecipients(session.id);
  return {
    mode, date: session.date, absentCount: plan.length, eligibleCount: plan.filter((i) => i.eligible).length,
    items: plan.map(({ phone: _phone, userId: _userId, ...safe }) => ({ ...safe, previousStatus: existing.get(safe.studentId) ?? null })),
    warning: mode === 'mock' ? 'Test mode: no SMS will be transmitted.' : 'Live mode: SMS is sent only to non-demo students with recorded parent consent.',
  };
}

async function existingRecipients(sessionId: string): Promise<Map<string, string>> {
  const rows = await db.select({ studentId: smsRecipients.studentId, status: smsRecipients.status }).from(smsRecipients)
    .innerJoin(smsCampaigns, eq(smsRecipients.campaignId, smsCampaigns.id)).where(eq(smsCampaigns.attendanceSessionId, sessionId));
  return new Map(rows.flatMap((r) => (r.studentId ? [[r.studentId, r.status] as [string, string]] : [])));
}

export async function processAbsentSms(session: SessionInfo, actor: { id: string; ip?: string | null }, opts: { studentIds?: string[]; retry?: boolean } = {}) {
  const mode = smsDeliveryMode();
  const plan = await buildPlan(session, mode);
  const wanted = plan.filter((i) => i.eligible && (!opts.studentIds || opts.studentIds.includes(i.studentId)));
  const skipped = plan.filter((i) => !i.eligible).map((i) => ({ studentId: i.studentId, rollNumber: i.rollNumber, reason: i.reason }));
  await db.insert(smsCampaigns).values({ name: `Absent alert ${session.date} ${session.subjectCode}`.slice(0, 160), message: 'Per-student absence notification', audience: 'ABSENT_ATTENDANCE',
    status: 'PROCESSING', createdBy: actor.id, targetDepartmentId: session.departmentId, targetSectionId: session.sectionId, attendanceSessionId: session.id })
    .onConflictDoNothing({ target: smsCampaigns.attendanceSessionId });
  const [campaign] = await db.select({ id: smsCampaigns.id }).from(smsCampaigns).where(eq(smsCampaigns.attendanceSessionId, session.id)).limit(1);
  if (!campaign) throw new Error('Could not create SMS campaign record');

  let sent = 0, mocked = 0, failed = 0, claimedCount = 0;
  if (wanted.length) {
    // Unique (campaign, student) makes this idempotent: an already-notified parent is never re-inserted.
    await db.insert(smsRecipients).values(wanted.map((i) => ({ campaignId: campaign.id, userId: i.userId, studentId: i.studentId, phone: i.maskedPhone!, status: 'PENDING', message: i.message })))
      .onConflictDoNothing({ target: [smsRecipients.campaignId, smsRecipients.studentId] });
    // Atomic claim: only rows we flip to SENDING are sent, so concurrent requests cannot double-send.
    const claimed = await db.update(smsRecipients).set({ status: 'SENDING', attempts: sql`${smsRecipients.attempts} + 1` })
      .where(and(eq(smsRecipients.campaignId, campaign.id), inArray(smsRecipients.studentId, wanted.map((i) => i.studentId)),
        opts.retry ? eq(smsRecipients.status, 'FAILED') : and(eq(smsRecipients.status, 'PENDING'), eq(smsRecipients.attempts, 0))))
      .returning({ id: smsRecipients.id, studentId: smsRecipients.studentId });
    claimedCount = claimed.length;
    const provider = smsProvider();
    const byStudent = new Map(wanted.map((i) => [i.studentId, i]));
    for (const row of claimed) {
      const item = byStudent.get(row.studentId!)!;
      let result;
      try {
        result = await provider.send({ phone: item.phone!, message: item.message, variables: { student_name: item.name, roll_number: item.rollNumber, department: item.department, date: item.date } });
      } catch { result = { status: 'FAILED' as const, detail: 'Unexpected provider error.' }; }
      if (result.status === 'SENT') sent++; else if (result.status === 'MOCKED') mocked++; else failed++;
      await db.update(smsRecipients).set({ status: result.status, providerId: result.providerId?.slice(0, 100) ?? null,
        errorDetail: result.status === 'FAILED' ? (result.detail ?? 'Delivery failed').slice(0, 200) : null, sentAt: result.status === 'FAILED' ? null : new Date() }).where(eq(smsRecipients.id, row.id));
    }
  }
  const all = await db.select({ status: smsRecipients.status }).from(smsRecipients).where(eq(smsRecipients.campaignId, campaign.id));
  const has = (s: string) => all.some((r) => r.status === s);
  const bad = all.filter((r) => r.status === 'FAILED').length, good = all.length - bad;
  const status = has('SENDING') || has('PENDING') ? 'PROCESSING' : bad && good ? 'PARTIAL' : bad ? 'FAILED' : all.every((r) => r.status === 'MOCKED') ? 'MOCKED' : 'SENT';
  await db.update(smsCampaigns).set({ status, updatedAt: new Date() }).where(eq(smsCampaigns.id, campaign.id));
  await writeAudit({ actorId: actor.id, action: opts.retry ? 'ABSENT_SMS_RETRY' : 'ABSENT_SMS_SEND', module: 'ABSENT_SMS', recordId: session.id,
    newValue: { mode, attempted: claimedCount, sent, mocked, failed, skipped: skipped.length }, ip: actor.ip ?? null });
  return { mode, campaignStatus: status, attempted: claimedCount, sent, mocked, failed, alreadyProcessed: wanted.length - claimedCount, skipped,
    warning: mode === 'mock' ? 'Test mode: no SMS was transmitted.' : undefined };
}

export async function absentStatus(sessionId: string) {
  const rows = await db.select({ id: smsRecipients.id, status: smsRecipients.status, phone: smsRecipients.phone, errorDetail: smsRecipients.errorDetail, attempts: smsRecipients.attempts,
    sentAt: smsRecipients.sentAt, name: users.fullName, rollNumber: studentProfiles.rollNumber })
    .from(smsRecipients).innerJoin(smsCampaigns, eq(smsRecipients.campaignId, smsCampaigns.id)).leftJoin(users, eq(smsRecipients.userId, users.id))
    .leftJoin(studentProfiles, eq(smsRecipients.studentId, studentProfiles.id)).where(eq(smsCampaigns.attendanceSessionId, sessionId)).orderBy(studentProfiles.rollNumber);
  return rows;
}
