import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { fail } from '../utils/http';
import type { AuthUser, UserRole } from '../types/auth';
import { getJwtSecret } from '../utils/jwt-secret';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return fail(res, 401, 'Sign in to continue', 'UNAUTHENTICATED');
  let payload: jwt.JwtPayload;
  try { payload = jwt.verify(header.slice(7), getJwtSecret()) as jwt.JwtPayload; }
  catch { return fail(res, 401, 'Your session expired. Please sign in again.', 'INVALID_TOKEN'); }
  if (!payload.sub || !payload.role) return fail(res, 401, 'Invalid session', 'INVALID_TOKEN');
  try {
    // Source of truth is the database: deactivated users, changed roles/departments and password changes take effect immediately.
    const [row] = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId, fullName: users.fullName, loginId: users.loginId, isDemo: users.isDemo, active: users.active, passwordChangedAt: users.passwordChangedAt })
      .from(users).where(eq(users.id, String(payload.sub))).limit(1);
    if (!row || !row.active) return fail(res, 401, 'This account is no longer active', 'ACCOUNT_DISABLED');
    if (row.passwordChangedAt && (payload.iat ?? 0) * 1000 < row.passwordChangedAt.getTime() - 1000) return fail(res, 401, 'Your password changed. Please sign in again.', 'INVALID_TOKEN');
    req.user = { id: row.id, role: row.role as UserRole, departmentId: row.departmentId ?? null, fullName: row.fullName, loginId: row.loginId, isDemo: row.isDemo };
    next();
  } catch (error) { next(error); }
}
export function allowRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, 'Sign in to continue', 'UNAUTHENTICATED');
    if (!roles.includes(req.user.role)) return fail(res, 403, 'You do not have permission to access this resource', 'FORBIDDEN');
    next();
  };
}
export const privileged = allowRoles('SUPER_ADMIN', 'ADMIN', 'PRINCIPAL');
