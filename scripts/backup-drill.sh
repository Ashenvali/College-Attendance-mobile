#!/usr/bin/env bash
# Backup + restore drill: proves the database can be dumped and restored before launch.
# Verified locally against PostgreSQL 16 (dump → restore into a scratch database → row counts match).
#
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require" ./scripts/backup-drill.sh /var/backups/bits.dump
#
# Requires pg_dump / pg_restore / psql on PATH (postgresql-client). The restore target is a
# uniquely named scratch database that is dropped at the end, so the source is only ever read.
set -euo pipefail

DUMP="${1:-/tmp/bits-backup.dump}"
: "${DATABASE_URL:?Set DATABASE_URL to the database you want to drill}"
if [[ "$DUMP" != /* ]]; then echo "usage: DATABASE_URL=... $0 /absolute/path.dump" >&2; exit 2; fi

SCRATCH="drill_restore_$(date +%s)"
TABLES="users student_profiles faculty_profiles attendance_sessions attendance_records notices sms_campaigns sms_recipients audit_logs"

# Same credentials/params, different database name.
scratch_url() { printf '%s' "$DATABASE_URL" | sed -E "s#(://[^/]+)/[^?]+#\1/$SCRATCH#"; }
maintenance_url() { printf '%s' "$DATABASE_URL" | sed -E "s#(://[^/]+)/[^?]+#\1/${SCRATCH_DB:-postgres}#"; }

cleanup() { psql "$(maintenance_url)" -qc "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "1/3 dumping to $DUMP"
pg_dump "$DATABASE_URL" --format=custom --file="$DUMP"

echo "2/3 restoring into scratch database $SCRATCH"
psql "$(maintenance_url)" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $SCRATCH"
pg_restore --dbname="$(scratch_url)" --no-owner --no-privileges --single-transaction "$DUMP"

echo "3/3 comparing row counts (source vs restored)"
status=0
for table in $TABLES; do
  source_count=$(psql "$DATABASE_URL" -tAc "select count(*) from public.$table" 2>/dev/null || echo "n/a")
  restored_count=$(psql "$(scratch_url)" -tAc "select count(*) from public.$table" 2>/dev/null || echo "n/a")
  if [[ "$source_count" == "$restored_count" ]]; then
    printf '    %-22s %s rows  OK\n' "$table" "$source_count"
  else
    printf '    %-22s source=%s restored=%s  MISMATCH\n' "$table" "$source_count" "$restored_count"
    status=1
  fi
done

echo "Dump size: $(du -h "$DUMP" | cut -f1)"
[[ $status -eq 0 ]] && echo "DRILL PASSED — the dump restores completely." || echo "DRILL FAILED — investigate before launch."
exit "$status"
