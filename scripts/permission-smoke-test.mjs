/**
 * Role-permission regression test (read-only apart from one deliberately rejected write).
 * Verifies that every role is stopped by the API itself — not just hidden in the UI.
 *
 * Requires a running API and a seeded development database:
 *   node scripts/permission-smoke-test.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';

async function call(path, token, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}
const login = async (identifier, password) => {
  const result = await call('/auth/login', null, { method: 'POST', body: JSON.stringify({ identifier, password }) });
  if (result.status !== 200) throw new Error(`Login failed for ${identifier} (${result.status})`);
  return result.body.data.token;
};

const checks = [];
async function expect(name, path, token, expected, init) {
  const result = await call(path, token, init);
  const statuses = Array.isArray(expected) ? expected : [expected];
  checks.push({ name, expected: statuses.join('/'), actual: result.status, pass: statuses.includes(result.status), message: result.body?.message });
}

const tokens = {
  student: await login('student@demo.bits', 'Student@123'),
  faculty: await login('faculty@demo.bits', 'Faculty@123'),
  hod: await login('hod@demo.bits', 'Hod@123'),
  principal: await login('principal@demo.bits', 'Principal@123'),
  admin: await login('admin@demo.bits', 'Admin@123'),
};

// Unauthenticated access is rejected everywhere.
await expect('anonymous dashboard', '/dashboard', null, 401);
await expect('tampered token', '/dashboard', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid', 401);

// Student scope.
await expect('student own students list', '/modules/students', tokens.student, 200);
await expect('student faculty directory blocked', '/modules/faculty', tokens.student, 403);
await expect('student attendance register blocked', '/attendance/register/classes', tokens.student, 403);
await expect('student analytics blocked', '/attendance/analytics', tokens.student, 403);
await expect('student parent SMS blocked', '/sms/parents/scopes', tokens.student, 403);
await expect('student admin create blocked', '/admin/students', tokens.student, 403, { method: 'POST', body: '{}' });
await expect('student audit logs blocked', '/modules/audit-logs', tokens.student, 403);

// Faculty scope.
await expect('faculty own classes', '/attendance/register/classes', tokens.faculty, 200);
await expect('faculty analytics blocked', '/attendance/analytics', tokens.faculty, 403);
await expect('faculty SMS dashboard blocked', '/sms/dashboard', tokens.faculty, 403);
await expect('faculty admin create blocked', '/admin/students', tokens.faculty, 403, { method: 'POST', body: '{}' });
await expect('faculty parent SMS scopes', '/sms/parents/scopes', tokens.faculty, 200);

// HOD scope: own department only, cannot mark attendance, cannot create HOD accounts.
await expect('hod analytics', '/attendance/analytics', tokens.hod, 200);
await expect('hod attendance write blocked', '/attendance', tokens.hod, 403, { method: 'POST', body: '{}' });
await expect('hod departments write blocked', '/admin/departments', tokens.hod, 403, { method: 'POST', body: '{}' });
await expect('hod parent SMS scopes', '/sms/parents/scopes', tokens.hod, 200);
await expect('hod report generation', '/admin/reports/attendance?from=2026-01-01&to=2026-12-31', tokens.hod, 200);

// Principal scope.
await expect('principal audit logs', '/modules/audit-logs', tokens.principal, 200);
await expect('principal institution SMS campaigns (leadership)', '/sms/campaigns', tokens.principal, 200);
await expect('principal departments write blocked', '/admin/departments', tokens.principal, 403, { method: 'POST', body: JSON.stringify({ code: 'ZZ', name: 'ZZ Test Department' }) });

// Admin scope.
await expect('admin SMS campaigns', '/sms/campaigns', tokens.admin, 200);
await expect('admin SMS dashboard', '/sms/dashboard', tokens.admin, 200);
await expect('admin parent SMS blocked (staff only)', '/sms/parents/scopes', tokens.admin, 403);

// Validation and duplicate handling must be client-safe (no SQL in the response).
// Deliberately reuse a seeded roll number with a fresh login/email so the unique constraint fires.
const departments = (await call('/modules/departments', tokens.admin)).body.data;
const sections = (await call('/modules/sections', tokens.admin)).body.data;
const cse = departments.find((d) => d.code === 'CSE');
const cseSection = sections.find((s) => s.department === 'CSE' && s.year === 3 && s.section === 'A');
const existing = (await call('/modules/students', tokens.admin)).body.data.find((s) => s.departmentId === cse?.id);
const duplicate = await call('/admin/students', tokens.admin, { method: 'POST', body: JSON.stringify({ loginId: `audit-dup-${Date.now()}`, email: `audit-dup-${Date.now()}@demo.bits`, password: 'Passw0rd!23', fullName: 'Duplicate Audit', rollNumber: existing.rollNumber, departmentId: cse.id, sectionId: cseSection.id, year: 3 }) });
checks.push({ name: 'duplicate student rejected without leaking SQL', expected: '400/409', actual: duplicate.status, pass: [400, 409].includes(duplicate.status) && !/insert into|params:/i.test(String(duplicate.body?.message ?? '')), message: duplicate.body?.message });

// Sign-out must invalidate the token.
const throwaway = await login('student@demo.bits', 'Student@123');
await expect('logout', '/auth/logout', throwaway, 200, { method: 'POST' });
await expect('token rejected after sign-out', '/auth/me', throwaway, 401);

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({ ok: failed.length === 0, total: checks.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exit(1);
