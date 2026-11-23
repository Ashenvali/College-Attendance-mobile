import { pool } from '../apps/api/src/db/client';

/** Reports the RLS posture of the connected database. Used by the release checklist. */
async function main() {
  const role = await pool.query('select rolsuper, rolbypassrls, current_user from pg_roles where rolname = current_user');
  const tables = await pool.query("select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname");
  const policies = await pool.query("select count(*)::int as count from pg_policies where schemaname='public'");
  console.log(JSON.stringify({
    role: role.rows[0],
    tables: tables.rows.length,
    rlsEnabled: tables.rows.filter((row) => row.relrowsecurity).length,
    policies: policies.rows[0].count,
  }, null, 2));
  await pool.end();
}
main().catch((error) => { console.error(error.message); process.exit(1); });
