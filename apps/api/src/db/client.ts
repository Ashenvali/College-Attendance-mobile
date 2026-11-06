import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Supabase's shared Session Pooler is IPv4-compatible; prefer its A records on IPv4-only hosts.
setDefaultResultOrder('ipv4first');

function databaseConnectionString(): string | undefined {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com')) {
      // Use the public CA linked from this project's Supabase Database Settings.
      // This keeps TLS encrypted and verifies both the CA chain and pooler hostname.
      url.searchParams.set('sslmode', 'verify-full');
      url.searchParams.set('sslrootcert', resolve(__dirname, '../../certs/supabase-prod-ca-2021.crt'));
    }
    return url.toString();
  } catch {
    return value;
  }
}

export const pool = new Pool({
  connectionString: databaseConnectionString(),
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });
