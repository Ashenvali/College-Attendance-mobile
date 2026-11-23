import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateMessage } from '../src/utils/http';

test('duplicate constraint names map to actionable messages, never raw SQL', () => {
  assert.match(duplicateMessage('student_profiles_roll_number_unique'), /roll number/i);
  assert.match(duplicateMessage('users_login_id_unique'), /login ID/i);
  assert.match(duplicateMessage('users_email_unique'), /email/i);
  assert.match(duplicateMessage('faculty_profiles_faculty_code_unique'), /faculty code/i);
  assert.match(duplicateMessage('attendance_session_class_date_uq'), /attendance/i);
  assert.match(duplicateMessage('marks_exam_subject_student_uq'), /marks/i);
  assert.equal(duplicateMessage(undefined), 'This record already exists.');
  const message = duplicateMessage('users_email_unique');
  assert.ok(!message.includes('insert into'), 'must not leak SQL');
  assert.ok(!message.includes('$1'), 'must not leak bound parameters');
});
