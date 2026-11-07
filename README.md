# BITS Kurnool College Management & Student Communication System

A mobile-first college management portal for **Brindavan Institute of Technology & Science (BITS Kurnool)**. It uses the college's official identity and departments, with clearly labelled fictional development data.

> **Development demo:** Every seeded person and student record is fictional. Demo passwords are not suitable for production.

## Delivered now

- Responsive React + TypeScript management/student portal with role-specific navigation for Student, Faculty, HOD, Principal, Admin, and Super Admin.
- Express + TypeScript REST API, JWT bearer sessions, bcrypt password hashing, Zod validation, role enforcement, Helmet, CORS, and login throttling.
- PostgreSQL relational schema managed with Drizzle ORM and a checked-in generated SQL migration.
- Functional faculty attendance register: assigned-class list → date roster → Present/Absent/Late and mark-all → live counters → confirmation → transactional database save/upsert → subject attendance recalculation → audit record → threshold notification.
- Student attendance view reads those same PostgreSQL attendance records; HOD/leadership analytics aggregate saved attendance.
- Role-scoped notices with in-app notification fan-out/read state; exams, results/marks, fees, timetable, assignments, events, reports/export, audit records, and SMS campaign architecture.
- Expo Router mobile app (apps/mobile) calling the same API: role-based tabs, attendance, absent-student parent SMS, SMS dashboard, notices, profile and password change.
- OpenAPI document at `/api/openapi.json`; API health at `/health`.

## Project structure

```text
apps/
  api/
    src/config/                  # runtime configuration
    src/db/                      # Drizzle schema, migration runner, seed data
    src/middleware/              # JWT and role-based access control
    src/routes/                  # auth, attendance, dashboards, admin, notices, marks, SMS, modules
    src/services/                # audit and provider-agnostic SMS architecture
    migrations/                  # generated PostgreSQL migrations
  web/
    src/components/              # dashboards, attendance register, charts, data tables, notices
    src/contexts/                # browser authentication/session context
    src/lib/                     # REST client
    src/styles/                  # responsive college portal design
  mobile/                        # Expo + React Native client for shared API
shared/                          # future shared TypeScript contracts

docs/                            # OpenAPI, brand asset notes
```

## Technology

- Web: React 18, TypeScript, Vite, Recharts, Lucide
- Mobile: React Native 0.86, Expo SDK 57, React 19, TypeScript 6
- Backend: Node.js, Express, TypeScript, REST, Zod, JWT, bcryptjs
- Database: PostgreSQL 16+ and Drizzle ORM
- SMS: provider interface with safe mock default; optional HTTP gateway adapter

## Local setup

Prerequisites: Node.js 20+, npm, PostgreSQL 16+. Docker is optional.

```bash
cp .env.example .env
# Ubuntu with PostgreSQL installed:
sudo systemctl start postgresql
pg_isready
# Docker alternative: docker compose up -d postgres
npm install
npm run db:setup
npm run dev
```

- Web portal: `http://localhost:3000`
- REST API: `http://localhost:3001/api`
- Health check: `http://localhost:3001/health`
- OpenAPI: `http://localhost:3001/api/openapi.json`

The API and Vite dev server run together. Vite proxies `/api` to the local Express service. `npm run build` creates the web build and API TypeScript build; `npm run typecheck` checks the API and web, and `npm run mobile:typecheck` checks the Expo client. `npm test` runs the database-free unit tests plus the absent-SMS integration test (active whenever `TEST_DATABASE_URL` points at a disposable database). ``npm run test:signin` drives the real portal in a headless DOM — it types credentials, clicks Sign in and asserts the dashboard replaced the login form (add `--block-storage` to simulate a sandboxed preview). `npm run test:smoke` runs the end-to-end API suites — attendance save → student read → alert → analytics, the module workflow (marks review/publication, notice fan-out, mock SMS) and the 28-check role-permission matrix — and writes fictional development records to PostgreSQL. The managed website builds the same API and portal into a container; Express serves `apps/web/dist` on the platform-provided `PORT` (3000 by default).

## Environment variables

Copy `.env.example` to `.env`. Required in production:

- `DATABASE_URL`: PostgreSQL connection string; for this IPv4-hosted website use the selected Supabase project's SSL-enabled Supavisor Session Pooler connection (port 5432)
- `BITSKNL_AUTH_SIGNING_SECRET`: high-entropy private secret (at least 32 random characters); the app-specific key used to sign and verify JWT sessions
- `WEB_ORIGIN`: optional explicitly allowed cross-origin frontend origin(s); same-origin portal API requests are the default

Configurable: `JWT_EXPIRES_IN`, `PORT`, `ATTENDANCE_THRESHOLD` (defaults to 75), `NODE_ENV`. Legacy `JWT_SECRET` is accepted only as a development fallback. Never expose server env values to web/mobile bundles.

For Supabase, the API enforces `sslmode=verify-full` and trusts the public root certificate `apps/api/certs/supabase-prod-ca-2021.crt`, linked from the project's Database Settings → SSL Configuration. The direct Supabase database hostname is IPv6-only on this account; use the exact Shared Session Pooler URI copied from the Dashboard's Connect panel. The CA certificate is public and bundled only into the server image; database credentials remain in the protected runtime secret store.

### Optional production services

- SMS gateway: set `SMS_PROVIDER=http`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`. The local default is `mock` and **does not transmit messages**.
- Push: FCM project/service-account configuration placeholders are included; no FCM client or credentials are active yet.
- Redis: `REDIS_URL` placeholder for a future queue worker; scheduled SMS is stored as queued but requires a production worker.
- File uploads/object storage: AWS S3 env placeholders only; no upload service is enabled yet.
- Payments: gateway key placeholder only; no payment flow is enabled.

## Database and migrations

The SQL migration is generated from `apps/api/src/db/schema.ts` using Drizzle Kit and stored in `apps/api/migrations/`. To generate a later migration:

```bash
npm exec --workspace @bitsknl/api -- drizzle-kit generate --config drizzle.config.ts
npm run db:migrate
```

`npm run db:seed` is idempotent and provides fictional users, BITS department names, courses/sections, DBMS and other subjects, classes, historical attendance, timetable, exam, fees, notices, assignment, and event data.

## Demo accounts (development only)

`npm run db:seed` now refuses to run unless `ALLOW_DEMO_SEED=true`, and must **never** be run against the production database. The mobile app no longer shows demo credentials. To lock out any existing demo accounts (without deleting data): `npm run db:disable-demo`.

Seeded development logins (fictional data; passwords are in `apps/api/src/db/seed.ts`) exist only on development databases.

## Key attendance workflow

1. Sign in as Faculty.
2. Select **Attendance Register**, class `CS501 · Year 3 Section A`, and a date.
3. Load the API-backed roster, adjust individual status or use **Mark all present**.
4. Review counts and **Confirm & save**.
5. API validates faculty/class access, transactionally upserts attendance in `attendance_sessions` and `attendance_records`, records an audit entry, recalculates attendance from saved rows, and creates an in-app low-attendance notification if a student crosses below the configurable threshold.
6. Sign in as `student@demo.bits` and open **Attendance** to see subject totals from those same database rows.
7. Sign in as HOD and open **Attendance Analytics** to see the updated department aggregate and low-attendance students.

To trigger the seeded Rahul alert during a demonstration, mark him absent for a new class date. His four existing fictional DBMS entries include one absence, so the new absence drops him below the default 75% threshold.

## Mobile client

```bash
cd apps/mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to the API host reachable from your phone, e.g. http://192.168.1.20:3001/api
npx expo start
```

Use the development machine's LAN IP from a physical phone (not `localhost`).

**Browser build (evaluation, screenshots, UAT):** the same Expo Router app also compiles for the web with `react-native-web`. From the repository root:

```bash
npm run mobile:export   # exports apps/mobile/dist with EXPO_PUBLIC_API_URL=/api
npm run dev             # exports, then serves the portal and the API together
```

Open `/mobile/` on the dev server or the deployed container. Platform-split modules keep native behaviour intact: `src/services/storage.ts` (expo-secure-store) vs `storage.web.ts` (localStorage), and `AbsenceDatePicker.tsx` (native picker) vs `AbsenceDatePicker.web.tsx` (`<input type="date">`). The browser build keeps its session token in `localStorage` because a browser has no keychain; Android/iOS builds use the keychain. Re-run `npm run mobile:export` after changing mobile source.

Android/iOS store signing needs EAS: set the production API host in `apps/mobile/eas.json` (currently `REPLACE-WITH-PRODUCTION-API-HOST`) and follow `docs/PLAY_STORE_CHECKLIST.md`.

## REST API

API responses use `{ "success": true, "data": ... }` or `{ "success": false, "message": ... }`.

- `POST /api/auth/login`, `POST /api/auth/logout` (revokes the token server-side), `POST /api/auth/revoke-sessions`, `GET /api/auth/me`, `POST /api/auth/change-password`
- `GET /api/dashboard`
- `GET /api/attendance/register/classes`
- `GET /api/attendance/register?subjectId=<uuid>&sectionId=<uuid>&date=YYYY-MM-DD`
- `POST /api/attendance` (date, subjectId, sectionId, student status records)
- `GET /api/attendance/me` (student's own data)
- `GET /api/attendance/history`, `GET /api/attendance/analytics`
- `GET/POST /api/notices`, `GET/PATCH /api/notifications`
- `GET /api/modules/:resource` for role-filtered portal data
- `GET/POST/PATCH /api/marks` for faculty marks, HOD review, and authorized result publication
- `POST /api/admin/students|faculty|departments|subjects|examinations|fees`
- `GET/POST /api/sms/campaigns`, `POST /api/sms/campaigns/:id/send`
- `GET /api/sms/parents/scopes|preview|campaigns` (Faculty/HOD parent messaging)
- `GET /api/sms/absent/:sessionId/preview|status`, `POST .../send|retry` (absent-student parent SMS)
- `GET /api/sms/dashboard` (delivery log with masked numbers)
- `GET /api/admin/reports/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` (reporting; CSV in the portal)
- `GET/PATCH /api/admin/students/:id/contact` (masked parent-contact maintenance)
- `GET /api/auth/config` (public: whether fictional demo sign-in is enabled on this deployment)

Full initial contract: `docs/openapi.json`.

## Security and production notes

- The published site currently uses these demo identities only with fictional sample records. Replace/remove demo credentials before loading real college data.
- This deployment uses the selected Supabase PostgreSQL project through the IPv4-compatible Shared Session Pooler with CA- and hostname-verified TLS (`verify-full`), and restricts browser CORS to explicitly configured origins (same-origin portal requests work without a CORS grant). Backups, secret rotation, and stronger account lifecycle/MFA controls remain necessary before production use with real records.
- Current JWT sessions are short-lived bearer tokens; browser holds them in `sessionStorage`. Refresh-token rotation/password reset, production account provisioning, upload storage, FCM delivery, payment processing, queued/scheduled SMS worker, and native app store builds remain integration work. The current full monorepo audit reports 27 findings (11 moderate, 16 high, 0 critical), concentrated in development/mobile and migration tooling; the API-only production dependency tree reports zero advisories. The audit's suggested automatic fixes include incompatible major downgrades, so they were not applied blindly.
- The SMS provider is explicitly mock by default; demo messaging is not delivered externally.
- Hosting uses managed on-demand (Autoscale) service: the published HTTPS URL is stable, but an idle container may sleep and take time to cold-start. Supabase documents that Free projects with low database activity may be paused after seven days; restore the project in Supabase if that happens. No paid-plan upgrade or billing change was made.
- The verified Supabase integration tests intentionally leave clearly fictional demo attendance, marks, a timestamped notice and mock SMS campaign records in the selected project; no external SMS was transmitted.


## Pre-launch gate

```bash
npm run launch:check        # 29 automated launch checks (types, tests, build, security, Play artefacts)
npm run launch:check:live   # + live API probes; API_BASE_URL overrides http://localhost:3001/api
```

Exit code is non-zero while a BLOCKER/HIGH item fails, so the same command can gate CI. It also prints
the owner-side items that cannot be automated (Play Console, DLT sender ID, device testing) as
`MANUAL`, never as a pass. Itemised results: `docs/LAUNCH-CHECKLIST-2026-11-07.md`.

## Audit (6 November 2026)

`docs/AUDIT-2026-11-06.md` is a full, evidence-based audit of this repository: structure, stack, auth, student/faculty/attendance, parent SMS, announcements, dashboards, database/RLS, security, UI/UX, device testing, QA, legal, Play readiness, documentation and code health — each item with a file path and a PASS/PARTIAL/FAIL/NOT VERIFIED status, plus a prioritised fix plan. It records every check that was executed (typechecks, tests, builds, migrations, live API probes) and everything that could not be verified from a sandbox.

## Security & operations (see docs/FIXES-2026-11-06.md)

- Apply migration `0002_security_sms_absent` (enables RLS on every public table and revokes anon/authenticated access). Then verify in Supabase → Advisors → Security.
- `npm test` runs database-free unit tests. `npm run db:disable-demo` deactivates demo accounts.
- Absent-student SMS: `ABSENT_SMS_MODE=off|manual|auto`; see docs/SMS_SETUP.md.
