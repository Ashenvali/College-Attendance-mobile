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

export const authRouter = Router();
const loginSchema = z.object({ identifier: z.string().min(1).max(180), password: z.string().min(1).max(128) });
const jwtSecret = () => process.env.JWT_SECRET || 'dev-only-bits-kurnool-secret-change-me';

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Enter a user ID and password', 'VALIDATION_ERROR');
    const identifier = parsed.data.identifier.trim();
    const [user] = await db.select().from(users).where(or(eq(users.loginId, identifier), eq(users.email, identifier.toLowerCase()))).limit(1);
    if (!user || !user.active || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail(res, 401, 'User ID or password is incorrect', 'INVALID_CREDENTIALS');
    const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign({ role: user.role, departmentId: user.departmentId, fullName: user.fullName, loginId: user.loginId, isDemo: user.isDemo }, jwtSecret(), { subject: user.id, expiresIn });
    await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await writeAudit({ actorId: user.id, action: 'LOGIN', module: 'AUTH', ip: req.ip });
    return ok(res, { token, user: { id: user.id, loginId: user.loginId, email: user.email, fullName: user.fullName, role: user.role, departmentId: user.departmentId, isDemo: user.isDemo } }, 'Signed in successfully');
  } catch (error) { next(error); }
});
authRouter.post('/logout', requireAuth, async (req, res) => {
  await writeAudit({ actorId: req.user!.id, action: 'LOGOUT', module: 'AUTH', ip: req.ip });
  return ok(res, { loggedOut: true }, 'Signed out');
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
