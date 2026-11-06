import type { Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export function ok<T>(res: Response, data: T, message?: string, status = 200) {
  return res.status(status).json({ success: true, ...(message ? { message } : {}), data });
}
export function fail(res: Response, status: number, message: string, code?: string) {
  return res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
}

/**
 * Maps a PostgreSQL unique-constraint name to a human-readable conflict message.
 * Used instead of leaking the raw driver error (which includes SQL and parameters).
 */
export function duplicateMessage(constraint?: string): string {
  if (!constraint) return 'This record already exists.';
  if (constraint.includes('roll_number')) return 'That roll number is already registered to another student.';
  if (constraint.includes('login_id')) return 'That login ID is already in use.';
  if (constraint.includes('email')) return 'That email address is already registered.';
  if (constraint.includes('faculty_code')) return 'That faculty code is already in use.';
  if (constraint.includes('attendance')) return 'Attendance for this class and date already exists.';
  if (constraint.includes('marks')) return 'Marks for this student, subject, and examination already exist.';
  if (constraint.includes('subjects')) return 'That subject code already exists.';
  if (constraint.includes('departments')) return 'That department code or name already exists.';
  return 'This record already exists.';
}
