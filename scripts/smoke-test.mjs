const API = process.env.API_URL || 'http://127.0.0.1:3001/api';
async function req(path, token, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} failed (${response.status}): ${payload.message}`);
  return payload.data;
}
async function login(identifier, password) { return req('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ identifier, password }) }); }
const assertions = [];
try {
  const healthResponse = await fetch(API.replace(/\/api$/, '') + '/health');
  const health = await healthResponse.json();
  if (!healthResponse.ok || health.database !== 'connected') throw new Error('API health/database check failed');
  assertions.push('API and PostgreSQL health check');

  const faculty = await login('faculty@demo.bits', 'Faculty@123');
  const classes = await req('/attendance/register/classes', faculty.token);
  if (!classes.length) throw new Error('Faculty has no assigned class');
  const clazz = classes.find((c) => c.subjectCode === 'CS501') || classes[0];
  const date = process.env.ATTENDANCE_TEST_DATE || '2026-10-04';
  const register = await req(`/attendance/register?subjectId=${clazz.subjectId}&sectionId=${clazz.sectionId}&date=${date}`, faculty.token);
  const rahul = register.students.find((s) => s.rollNumber === 'DEMO-CSE-001');
  if (!rahul) throw new Error('Seeded student DEMO-CSE-001 is not in faculty roster');
  const records = register.students.map((s) => ({ studentId: s.id, status: s.id === rahul.id ? 'ABSENT' : 'PRESENT' }));
  const saved = await req('/attendance', faculty.token, { method: 'POST', body: JSON.stringify({ subjectId: clazz.subjectId, sectionId: clazz.sectionId, date, records }) });
  if (saved.total !== records.length) throw new Error(`Expected ${records.length} saved rows, got ${saved.total}`);
  assertions.push(`Faculty saved ${saved.total} status records transactionally (${saved.present} present, ${saved.absent} absent, ${saved.late} late)`);

  const student = await login('student@demo.bits', 'Student@123');
  const attendance = await req('/attendance/me', student.token);
  const subject = attendance.subjects.find((s) => s.subjectCode === 'CS501');
  if (!subject || subject.total < 5 || subject.attendancePercentage >= 75) throw new Error('Student attendance did not reflect saved faculty record or threshold');
  const notifications = await req('/notifications', student.token);
  if (!notifications.some((n) => n.title === 'Low attendance alert')) throw new Error('Expected low-attendance in-app alert was not created');
  assertions.push(`Student read the saved ${subject.subjectCode} record (${subject.attendancePercentage}% from ${subject.total} classes)`);
  assertions.push('Low-attendance notification was generated for the affected student');

  const denied = await fetch(`${API}/attendance/register/classes`, { headers: { authorization: `Bearer ${student.token}` } });
  if (denied.status !== 403) throw new Error(`Student register access should be denied, received ${denied.status}`);
  assertions.push('Student is denied faculty register endpoints by RBAC');

  const hod = await login('hod@demo.bits', 'Hod@123');
  const analytics = await req('/attendance/analytics', hod.token);
  if (!analytics.lowAttendance.some((s) => s.roll === 'DEMO-CSE-001')) throw new Error('HOD analytics does not show the below-threshold student');
  assertions.push('HOD analytics recalculated from the saved attendance and shows the low-attendance student');
  console.log(JSON.stringify({ ok: true, assertions, testDate: date, saved }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, assertions, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
