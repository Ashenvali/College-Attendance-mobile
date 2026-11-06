import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { or, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users, studentProfiles, facultyProfiles, departments, sections } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/http';
import { writeAudit } from '../services/audit.service';
import { getJwtSecret } from '../utils/jwt-secret';

const signSession = (user: { id: string; role: string; departmentId: string | null; fullName: string; loginId: string; isDemo: boolean; sessionVersion: number }) => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    { role: user.role, departmentId: user.departmentId, fullName: user.fullName, loginId: user.loginId, isDemo: user.isDemo, sessionVersion: user.sessionVersion },
    getJwtSecret(),
    { subject: user.id, expiresIn },
  );
};

export const authRouter = Router();
const loginSchema = z.object({ identifier: z.string().min(1).max(180), password: z.string().min(1).max(128) });

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Enter a user ID and password', 'VALIDATION_ERROR');
    const identifier = parsed.data.identifier.trim();
    const [user] = await db.select().from(users).where(or(eq(users.loginId, identifier), eq(users.email, identifier.toLowerCase()))).limit(1);
    if (!user || !user.active || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail(res, 401, 'User ID or password is incorrect', 'INVALID_CREDENTIALS');
    const token = signSession(user);
    await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await writeAudit({ actorId: user.id, action: 'LOGIN', module: 'AUTH', ip: req.ip });
    return ok(res, { token, user: { id: user.id, loginId: user.loginId, email: user.email, fullName: user.fullName, role: user.role, departmentId: user.departmentId, isDemo: user.isDemo } }, 'Signed in successfully');
  } catch (error) { next(error); }
});
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    // Bumping the session version invalidates every issued token for this account, including
    // tokens copied from another device, so sign-out is effective server-side.
    await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
    await writeAudit({ actorId: req.user!.id, action: 'LOGOUT', module: 'AUTH', ip: req.ip });
    return ok(res, { loggedOut: true }, 'Signed out');
  } catch (error) { next(error); }
});
authRouter.post('/revoke-sessions', requireAuth, async (req, res, next) => {
  try {
    await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
    await writeAudit({ actorId: req.user!.id, action: 'SESSIONS_REVOKED', module: 'AUTH', ip: req.ip });
    return ok(res, { revoked: true }, 'All sessions were signed out. Please sign in again.');
  } catch (error) { next(error); }
});
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    let profile: Record<string, unknown> = {};
    if (user.role === 'STUDENT') {
      const [row] = await db.select({ rollNumber: studentProfiles.rollNumber, year: studentProfiles.year, sectionId: studentProfiles.sectionId, department: departments.name, departmentCode: departments.code, section: sections.name, phone: users.phone, email: users.email, parentName: studentProfiles.parentName, parentPhone: studentProfiles.parentPhone })
        .from(studentProfiles).innerJoin(departments, eq(studentProfiles.departmentId, departments.id)).innerJoin(sections, eq(studentProfiles.sectionId, sections.id)).innerJoin(users, eq(studentProfiles.userId, users.id)).where(eq(studentProfiles.userId, user.id)).limit(1);
      if (row) profile = row;
    } else if (user.role === 'FACULTY' || user.role === 'HOD') {
      const [row] = await db.select({ facultyCode: facultyProfiles.facultyCode, designation: facultyProfiles.designation, department: departments.name, departmentCode: departments.code })
        .from(facultyProfiles).innerJoin(departments, eq(facultyProfiles.departmentId, departments.id)).where(eq(facultyProfiles.userId, user.id)).limit(1);
      if (row) profile = row;
    }
    return ok(res, { user: { id: user.id, loginId: user.loginId, fullName: user.fullName, role: user.role, departmentId: user.departmentId, isDemo: user.isDemo }, profile });
  } catch (error) { next(error); }
});

const changeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10, 'New password must be at least 10 characters').max(128) });
authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message || 'Invalid request', 'VALIDATION_ERROR');
    if (parsed.data.newPassword === parsed.data.currentPassword) return fail(res, 400, 'Choose a different password', 'VALIDATION_ERROR');
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return fail(res, 401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
    const now = new Date();
    const [updated] = await db.update(users)
      .set({ passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), passwordChangedAt: now, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: now })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, role: users.role, departmentId: users.departmentId, fullName: users.fullName, loginId: users.loginId, isDemo: users.isDemo, sessionVersion: users.sessionVersion });
    await writeAudit({ actorId: user.id, action: 'PASSWORD_CHANGED', module: 'AUTH', recordId: user.id, ip: req.ip });
    // The current device keeps working with a freshly signed token; every other device is signed out.
    return ok(res, { token: signSession(updated) }, 'Password changed. Other sessions were signed out.');
  } catch (error) { next(error); }
});
