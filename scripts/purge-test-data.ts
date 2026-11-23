/**
 * Purge automated-test residue from the development database.
 *
 * The smoke, module and permission suites create throwaway accounts on every run
 * (`stua…`, `stub…`, `stuc…`, `fac…`, `oth…`) plus their announcements and audit trail.
 * Those rows pile up and make the portal look untidy; the seeded demonstration dataset
 * (`@demo.bits` accounts and their academic records) is *not* touched.
 *
 *   npm run db:purge-test-data            # dry run: report what would be removed
 *   npm run db:purge-test-data -- --apply # delete it, inside one transaction
 *
 * Deletion order follows the foreign keys (see the report printed by `npm run db:purge-test-data
 * -- --verbose`): children first, `users` last.
 */
import 'dotenv/config';
import { pool } from '../apps/api/src/db/client';

const APPLY = process.argv.includes('--apply');

/** Accounts created by scripts/smoke-test.mjs, module-smoke-test.mjs and permission-smoke-test.mjs. */
const TEST_LOGIN_PATTERN = '^(stu[abc]|fac|oth)[a-z0-9]{6}$';
/** Notice titles written by the same suites (and the notifications they fanned out). */
const TEST_NOTICE_TITLES = ['Demo workflow announcement %', 'Audit notice'];
/**
 * Accounts created on purpose while verifying the bulk-import script. They are inactive and hold no
 * academic data, so they are residue like the generated ones above.
 */
const IMPORT_VERIFICATION_LOGINS = ['24B11CS001', '24B11CS002'];

const TEST_USER_MATCH = `(is_demo = false and (login_id ~ '${TEST_LOGIN_PATTERN}' or login_id in (${IMPORT_VERIFICATION_LOGINS.map((id) => `'${id}'`).join(',')})))`;
const TEST_USERS = `select id from users where ${TEST_USER_MATCH}`;

const STEPS: Array<{ label: string; sql: string }> = [
  { label: 'notifications addressed to test accounts', sql: `delete from notifications where recipient_id in (${TEST_USERS})` },
  { label: 'attendance records of test students', sql: `delete from attendance_records where student_id in (select id from student_profiles where user_id in (${TEST_USERS}))` },
  { label: 'attendance records marked by test faculty', sql: `delete from attendance_records where marked_by in (${TEST_USERS})` },
  { label: 'attendance sessions of test faculty', sql: `delete from attendance_sessions where marked_by in (${TEST_USERS}) or faculty_id in (select id from faculty_profiles where user_id in (${TEST_USERS}))` },
  { label: 'marks entered by test faculty', sql: `delete from marks where entered_by in (${TEST_USERS})` },
  { label: 'marks of test students', sql: `delete from marks where student_id in (select id from student_profiles where user_id in (${TEST_USERS}))` },
  { label: 'fees of test students', sql: `delete from fees where student_id in (select id from student_profiles where user_id in (${TEST_USERS}))` },
  { label: 'SMS recipients for test accounts', sql: `delete from sms_recipients where user_id in (${TEST_USERS})` },
  { label: 'mock campaign residue ("Mock smoke …", "Audit test campaign")', sql: `delete from sms_campaigns where name like 'Mock smoke %' or name = 'Audit test campaign'` },
  { label: 'SMS campaigns created by test accounts', sql: `delete from sms_campaigns where created_by in (${TEST_USERS})` },
  { label: 'audit log entries of test accounts', sql: `delete from audit_logs where actor_id in (${TEST_USERS})` },
  { label: 'student profiles of test accounts', sql: `delete from student_profiles where user_id in (${TEST_USERS})` },
  { label: 'faculty profiles of test accounts', sql: `delete from faculty_profiles where user_id in (${TEST_USERS})` },
  { label: 'results in test examinations', sql: `delete from results where examination_id in (select id from examinations where name like 'Fictional smoke assessment %')` },
  { label: 'marks in test examinations', sql: `delete from marks where examination_id in (select id from examinations where name like 'Fictional smoke assessment %')` },
  { label: 'test examinations', sql: `delete from examinations where name like 'Fictional smoke assessment %'` },
  { label: 'duplicate teaching assignments created by the permission suite', sql: `delete from faculty_subjects where id in (select fs.id from faculty_subjects fs join faculty_profiles fp on fp.id = fs.faculty_id join subjects s on s.id = fs.subject_id join sections sec on sec.id = fs.section_id group by fs.id, fp.id, s.id, sec.id having count(*) > 1)` },
  { label: 'notifications fanned out from test announcements', sql: `delete from notifications where ${TEST_NOTICE_TITLES.map((t) => `title like '${t}'`).join(' or ')}` },
  { label: 'test-run notifications ("Results published")', sql: `delete from notifications where title = 'Results published'` },
  { label: 'test announcements', sql: `delete from notices where ${TEST_NOTICE_TITLES.map((t) => `title like '${t}'`).join(' or ')}` },
  { label: 'test accounts', sql: `delete from users where ${TEST_USER_MATCH}` },
];

async function main() {
  const before = (await pool.query<{ n: number }>(`select count(*)::int as n from users`)).rows[0].n;
  const { rows: sample } = await pool.query(`select login_id from users where ${TEST_USER_MATCH} order by created_at limit 8`);

  console.log(`Automated-test residue found: ${sample.length ? '' : 'none'}`);
  if (sample.length) console.log('  e.g.', sample.map((r: { login_id: string }) => r.login_id).join(', '), '…');

  if (!APPLY) {
    const counts = await countTargets();
    console.log('\nDry run — nothing was deleted:');
    for (const [label, count] of counts) console.log(`  ${String(count).padStart(4)}  ${label}`);
    console.log(`\nUsers now: ${before}. Re-run with --apply to remove the rows above.`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const step of STEPS) {
      const result = await client.query(step.sql);
      console.log(`  removed ${String(result.rowCount).padStart(4)}  ${step.label}`);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const after = (await pool.query<{ n: number }>(`select count(*)::int as n from users`)).rows[0].n;
  console.log(`\nUsers: ${before} → ${after}. The seeded demonstration dataset is untouched.`);
  await pool.end();
}

/** Same predicates as STEPS, counted instead of deleted. */
async function countTargets(): Promise<Array<[string, number]>> {
  const probes: Array<[string, string]> = [
    ['notifications addressed to test accounts', `select count(*)::int n from notifications where recipient_id in (${TEST_USERS})`],
    ['attendance records of test students', `select count(*)::int n from attendance_records where student_id in (select id from student_profiles where user_id in (${TEST_USERS}))`],
    ['attendance sessions of test faculty', `select count(*)::int n from attendance_sessions where marked_by in (${TEST_USERS}) or faculty_id in (select id from faculty_profiles where user_id in (${TEST_USERS}))`],
    ['marks of test accounts', `select count(*)::int n from marks where entered_by in (${TEST_USERS}) or student_id in (select id from student_profiles where user_id in (${TEST_USERS}))`],
    ['fees of test students', `select count(*)::int n from fees where student_id in (select id from student_profiles where user_id in (${TEST_USERS}))`],
    ['mock campaign residue', `select count(*)::int n from sms_campaigns where name like 'Mock smoke %' or name = 'Audit test campaign'`],
    ['SMS campaigns created by test accounts', `select count(*)::int n from sms_campaigns where created_by in (${TEST_USERS})`],
    ['audit log entries of test accounts', `select count(*)::int n from audit_logs where actor_id in (${TEST_USERS})`],
    ['student profiles of test accounts', `select count(*)::int n from student_profiles where user_id in (${TEST_USERS})`],
    ['faculty profiles of test accounts', `select count(*)::int n from faculty_profiles where user_id in (${TEST_USERS})`],
    ['test-run notifications ("Results published")', `select count(*)::int n from notifications where title = 'Results published'`],
    ['notifications fanned out from test announcements', `select count(*)::int n from notifications where ${TEST_NOTICE_TITLES.map((t) => `title like '${t}'`).join(' or ')}`],
    ['results in test examinations', `select count(*)::int n from results where examination_id in (select id from examinations where name like 'Fictional smoke assessment %')`],
    ['marks in test examinations', `select count(*)::int n from marks where examination_id in (select id from examinations where name like 'Fictional smoke assessment %')`],
    ['test examinations', `select count(*)::int n from examinations where name like 'Fictional smoke assessment %'`],
    ['duplicate teaching assignments', `select count(*)::int n from (select fs.id from faculty_subjects fs join faculty_profiles fp on fp.id = fs.faculty_id join subjects s on s.id = fs.subject_id join sections sec on sec.id = fs.section_id group by fs.id, fp.id, s.id, sec.id having count(*) > 1) x`],
    ['test announcements', `select count(*)::int n from notices where ${TEST_NOTICE_TITLES.map((t) => `title like '${t}'`).join(' or ')}`],
    ['test accounts', `select count(*)::int n from users where ${TEST_USER_MATCH}`],
  ];
  const out: Array<[string, number]> = [];
  for (const [label, sql] of probes) {
    const { rows } = await pool.query(sql);
    out.push([label, rows[0].n]);
  }
  return out;
}

main().catch((error) => { console.error(error.message); process.exit(1); });
