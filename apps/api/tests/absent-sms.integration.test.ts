/**
 * Database integration test for the absent-student SMS workflow.
 * Runs ONLY against a disposable database: set TEST_DATABASE_URL (migrated with `db:migrate`).
 * Refuses hosted Supabase URLs. Uses the mock provider / an unreachable gateway: nothing is ever transmitted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
if (!url || /supabase\.(co|com)/.test(url)) {
  test('absent SMS integration (skipped: set TEST_DATABASE_URL to a disposable local database)', { skip: true }, () => undefined);
} else {
  process.env.DATABASE_URL = url; process.env.NODE_ENV = 'test'; process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || '1';
  for (const k of ['SMS_PROVIDER', 'SMS_API_URL', 'SMS_API_KEY', 'SMS_SENDER_ID', 'MSG91_AUTH_KEY']) delete process.env[k];

  test('absent SMS: eligibility, idempotency, concurrency, consent, retry, authorization', async () => {
    const { db, pool } = await import('../src/db/client');
    const s = await import('../src/db/schema');
    const svc = await import('../src/services/absent-sms.service');
    const { eq } = await import('drizzle-orm');
    const tag = Math.random().toString(36).slice(2, 8);
    try {
      const [dept] = await db.insert(s.departments).values({ code: `T${tag}`.slice(0, 12).toUpperCase(), name: `Test Dept ${tag}` }).returning();
      const [sec] = await db.insert(s.sections).values({ departmentId: dept.id, year: 3, name: 'T' }).returning();
      const [subj] = await db.insert(s.subjects).values({ code: `S${tag}`.toUpperCase(), name: 'Test Subject', departmentId: dept.id, semesterNumber: 5 }).returning();
      const mkUser = async (role: any, n: string) => (await db.insert(s.users).values({ loginId: `${n}${tag}`, email: `${n}${tag}@t.test`, passwordHash: 'x', role, fullName: `${n} ${tag}`, departmentId: dept.id }).returning())[0];
      const fu = await mkUser('FACULTY', 'fac'); const other = await mkUser('FACULTY', 'oth');
      const [fac] = await db.insert(s.facultyProfiles).values({ userId: fu.id, facultyCode: `F${tag}`, departmentId: dept.id, designation: 'AP' }).returning();
      await db.insert(s.facultySubjects).values({ facultyId: fac.id, subjectId: subj.id, sectionId: sec.id });
      const [sess] = await db.insert(s.attendanceSessions).values({ subjectId: subj.id, sectionId: sec.id, facultyId: fac.id, classDate: '2026-11-05', markedBy: fu.id }).returning();
      const kids: Array<[string, string | null, boolean]> = [['a', '9876543210', true], ['b', '9876543211', false], ['c', null, true]];
      const ids: Record<string, string> = {};
      for (const [n, phone, consent] of kids) {
        const u = await mkUser('STUDENT', `stu${n}`);
        const [sp] = await db.insert(s.studentProfiles).values({ userId: u.id, rollNumber: `R${n}${tag}`, departmentId: dept.id, sectionId: sec.id, year: 3, parentPhone: phone, parentSmsConsent: consent }).returning();
        ids[n] = sp.id;
        await db.insert(s.attendanceRecords).values({ sessionId: sess.id, studentId: sp.id, status: 'ABSENT', markedBy: fu.id });
      }
      const session = (await svc.loadSession(sess.id))!;
      const actor = { id: fu.id };

      // authorization
      assert.equal(await svc.canAccessSession({ id: fu.id, role: 'FACULTY', departmentId: dept.id, fullName: '', loginId: '', isDemo: false }, session), true);
      assert.equal(await svc.canAccessSession({ id: other.id, role: 'FACULTY', departmentId: dept.id, fullName: '', loginId: '', isDemo: false }, session), false);
      assert.equal(await svc.canAccessSession({ id: other.id, role: 'STUDENT', departmentId: dept.id, fullName: '', loginId: '', isDemo: false }, session), false);

      // preview never leaks the full number
      const pv = await svc.previewAbsent(session);
      assert.ok(!JSON.stringify(pv).includes('9876543210'));
      assert.equal(pv.absentCount, 3); assert.equal(pv.eligibleCount, 2); // c has no phone

      // concurrent sends -> each parent messaged exactly once
      const [r1, r2] = await Promise.all([svc.processAbsentSms(session, actor), svc.processAbsentSms(session, actor)]);
      assert.equal(r1.attempted + r2.attempted, 2, 'exactly two students attempted across concurrent calls');
      const again = await svc.processAbsentSms(session, actor);
      assert.equal(again.attempted, 0); assert.equal(again.alreadyProcessed, 2);
      const status = await svc.absentStatus(sess.id);
      assert.equal(status.length, 2); assert.ok(status.every((r) => r.status === 'MOCKED' && r.attempts === 1));
      assert.ok(status.every((r) => /^\*+\d{4}$|^\+\*+\d{4}$/.test(r.phone)), 'stored phone is masked');

      // live mode: consent enforced; unreachable gateway -> FAILED -> retry increments attempts, never duplicates
      process.env.SMS_PROVIDER = 'http'; process.env.SMS_API_URL = 'https://sms-gateway.invalid/send'; process.env.SMS_API_KEY = 'k'; process.env.SMS_SENDER_ID = 'BITSKN';
      const live = await svc.previewAbsent(session);
      assert.equal(live.mode, 'gateway'); assert.equal(live.eligibleCount, 1, 'only the consented parent is eligible in live mode');
      const [sp2] = await db.select().from(s.studentProfiles).where(eq(s.studentProfiles.id, ids.a));
      await db.update(s.studentProfiles).set({ parentPhone: '9876543299' }).where(eq(s.studentProfiles.id, sp2.id));
      await db.delete(s.smsRecipients); // fresh slate for the live path
      const f1 = await svc.processAbsentSms(session, actor);
      assert.equal(f1.failed, 1); assert.equal(f1.sent, 0);
      const f2 = await svc.processAbsentSms(session, actor);
      assert.equal(f2.attempted, 0, 'a FAILED row is not resent without explicit retry');
      const f3 = await svc.processAbsentSms(session, actor, { retry: true });
      assert.equal(f3.attempted, 1);
      const st = await svc.absentStatus(sess.id);
      assert.equal(st.length, 1); assert.equal(st[0].attempts, 2); assert.equal(st[0].status, 'FAILED');
    } finally { await pool.end(); }
  });
}
