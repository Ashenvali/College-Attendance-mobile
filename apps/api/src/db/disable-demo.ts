import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import { users } from './schema';

// Deactivates (never deletes) all fictional demo accounts so they can no longer sign in. Safe to re-run.
async function main() {
  const rows = await db.update(users).set({ active: false, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.isDemo, true)).returning({ id: users.id });
  console.log(`Deactivated ${rows.length} demo account(s).`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
