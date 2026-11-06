import test from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecret } from '../src/utils/jwt-secret';
import { allowRoles } from '../src/middleware/auth';

test('JWT secret: no silent dev fallback outside development/test', () => {
  const env = { ...process.env };
  try {
    delete process.env.BITSKNL_AUTH_SIGNING_SECRET; delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production'; assert.throws(() => getJwtSecret());
    delete process.env.NODE_ENV; assert.throws(() => getJwtSecret());
    process.env.NODE_ENV = 'staging'; assert.throws(() => getJwtSecret());
    process.env.NODE_ENV = 'production'; process.env.BITSKNL_AUTH_SIGNING_SECRET = 'short'; assert.throws(() => getJwtSecret());
    process.env.BITSKNL_AUTH_SIGNING_SECRET = 'x'.repeat(40); assert.equal(getJwtSecret(), 'x'.repeat(40));
    process.env.BITSKNL_AUTH_SIGNING_SECRET = 'replace-with-at-least-32-random-characters'; assert.throws(() => getJwtSecret(), 'placeholder from .env.example must be rejected');
    delete process.env.BITSKNL_AUTH_SIGNING_SECRET; process.env.NODE_ENV = 'development'; assert.ok(getJwtSecret());
  } finally { process.env = env; }
});

function run(role: string | null, allowed: string[]) {
  let status = 0; let nexted = false;
  const res: any = { status(c: number) { status = c; return res; }, json() { return res; } };
  allowRoles(...(allowed as any))({ user: role ? { role } : undefined } as any, res, () => { nexted = true; });
  return { status, nexted };
}
test('allowRoles enforces the role matrix', () => {
  assert.equal(run('FACULTY', ['FACULTY', 'HOD']).nexted, true);
  assert.equal(run('STUDENT', ['FACULTY', 'HOD']).status, 403);
  assert.equal(run('HOD', ['ADMIN', 'SUPER_ADMIN']).status, 403);
  assert.equal(run(null, ['ADMIN']).status, 401);
});
