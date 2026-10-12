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
