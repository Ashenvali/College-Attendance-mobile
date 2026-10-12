import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { fail } from '../utils/http';
import type { AuthUser, UserRole } from '../types/auth';

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}
const secret = () => process.env.JWT_SECRET || 'dev-only-bits-kurnool-secret-change-me';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return fail(res, 401, 'Sign in to continue', 'UNAUTHENTICATED');
  try {
    const payload = jwt.verify(header.slice(7), secret()) as jwt.JwtPayload;
    if (!payload.sub || !payload.role) return fail(res, 401, 'Invalid session', 'INVALID_TOKEN');
    req.user = {
      id: String(payload.sub), role: payload.role as UserRole,
      departmentId: payload.departmentId ? String(payload.departmentId) : null,
      fullName: String(payload.fullName ?? 'BITS Kurnool user'), loginId: String(payload.loginId ?? ''), isDemo: Boolean(payload.isDemo),
    };
    next();
  } catch { return fail(res, 401, 'Your session expired. Please sign in again.', 'INVALID_TOKEN'); }
}
export function allowRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, 'Sign in to continue', 'UNAUTHENTICATED');
    if (!roles.includes(req.user.role)) return fail(res, 403, 'You do not have permission to access this resource', 'FORBIDDEN');
    next();
  };
}
export const privileged = allowRoles('SUPER_ADMIN', 'ADMIN', 'PRINCIPAL');
