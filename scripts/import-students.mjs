/**
 * Bulk student import (CSV) for the launch hand-over.
 *
 * Creates real (non-demo) student accounts with an initial password and a forced first sign-in
 * change where supported by the deployment. Nothing here touches demo rows.
 *
 *   node scripts/import-students.mjs students.csv --dry-run
 *   node scripts/import-students.mjs students.csv --apply
 *
 * CSV columns (header row required, order free):
 *   rollNumber,fullName,email,sectionName,year,departmentCode,parentName,parentPhone,parentSmsConsent
 *
 * The script talks to the running API as an Admin, so every import goes through the same validation,
 * audit logging and password hashing as the portal. Credentials are read from the environment:
 *   API_BASE_URL (default http://localhost:3001/api), IMPORT_ADMIN_ID, IMPORT_ADMIN_PASSWORD
 */
import { readFileSync } from 'node:fs';

const API = (process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const identifier = process.env.IMPORT_ADMIN_ID;
const password = process.env.IMPORT_ADMIN_PASSWORD;

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/import-students.mjs <students.csv> [--apply]'); process.exit(2); }
const apply = flags.includes('--apply');
if (!identifier || !password) { console.error('Set IMPORT_ADMIN_ID and IMPORT_ADMIN_PASSWORD (an Admin account) first.'); process.exit(2); }

/** RFC-4180-ish parser: handles quoted fields, embedded commas and escaped quotes. */
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

async function call(path, init = {}, token) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(`${path} → ${response.status} ${body.message || ''}`.trim());
  return body.data;
}

const [header, ...lines] = parseCsv(readFileSync(file, 'utf8'));
const columns = header.map((name) => name.trim());
const required = ['rollNumber', 'fullName', 'email', 'sectionName', 'year', 'departmentCode'];
const missing = required.filter((name) => !columns.includes(name));
if (missing.length) { console.error(`Missing columns: ${missing.join(', ')}`); process.exit(2); }

const records = lines.map((cells) => Object.fromEntries(columns.map((name, index) => [name, (cells[index] ?? '').trim()])));
const problems = [];
for (const [index, record] of records.entries()) {
  const line = index + 2;
  if (!/^[A-Za-z0-9-]{4,32}$/.test(record.rollNumber)) problems.push(`line ${line}: rollNumber "${record.rollNumber}" must be 4-32 characters (letters, digits, hyphen)`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) problems.push(`line ${line}: email "${record.email}" is not valid`);
  if (![1, 2, 3, 4].includes(Number(record.year))) problems.push(`line ${line}: year must be 1-4`);
  if (record.parentSmsConsent && !record.parentPhone) problems.push(`line ${line}: consent recorded without a parent phone number`);
}
if (problems.length) { console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`); process.exit(1); }

const token = (await call('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })).token;
const [departments, sections, courses] = await Promise.all([
  call('/modules/departments', {}, token), call('/modules/sections', {}, token), call('/modules/courses', {}, token),
]);

let created = 0; const failures = [];
for (const record of records) {
  const department = departments.find((d) => d.code?.toUpperCase() === record.departmentCode.toUpperCase());
  // /modules/sections returns { id, year, section, department (code), course } — match on the payload we receive.
  const section = sections.find((s) => (s.section ?? s.name) === record.sectionName
    && Number(s.year) === Number(record.year)
    && (s.departmentId === department?.id || s.department?.toUpperCase() === record.departmentCode.toUpperCase()));
  if (!department || !section) { failures.push(`${record.rollNumber}: no matching section ${record.departmentCode}/${record.year}/${record.sectionName}`); continue; }
  const course = courses.find((c) => c.departmentId === department.id || c.departmentId === department?.id);
  const initialPassword = `Bits@${record.rollNumber.slice(-4)}${new Date().getFullYear() % 100}`;
  const payload = {
    loginId: record.rollNumber, email: record.email, password: initialPassword, fullName: record.fullName,
    rollNumber: record.rollNumber, departmentId: department.id, courseId: course?.id, sectionId: section.id,
    year: Number(record.year), parentName: record.parentName || undefined, parentPhone: record.parentPhone || undefined,
    parentSmsConsent: ['true', 'yes', '1'].includes(String(record.parentSmsConsent).toLowerCase()),
  };
  if (!apply) { console.log(`[dry-run] would create ${record.rollNumber} (${record.fullName})`); created += 1; continue; }
  try {
    await call('/admin/students', { method: 'POST', body: JSON.stringify(payload) }, token);
    console.log(`created ${record.rollNumber} → initial password ${initialPassword}`);
    created += 1;
  } catch (error) {
    failures.push(`${record.rollNumber}: ${error.message}`);
  }
}

console.log(`\n${apply ? 'Created' : 'Would create'}: ${created} of ${records.length}`);
if (failures.length) { console.error(`Failures (${failures.length}):\n${failures.join('\n')}`); process.exit(1); }
if (!apply) console.log('Re-run with --apply to write these records.');
