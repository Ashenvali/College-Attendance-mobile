import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pool } from './client';

async function main() {
  await migrate(drizzle(pool), { migrationsFolder: 'apps/api/migrations' });
  console.log('PostgreSQL migrations applied.');
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
