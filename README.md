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
- A separate Expo/React Native client for mobile login, student attendance, and faculty attendance operations; it calls the same API/database.
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
# Start PostgreSQL. Option A: installed PostgreSQL service.
# Option B: docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Web portal: `http://localhost:5173`
- REST API: `http://localhost:3001/api`
- Health check: `http://localhost:3001/health`
- OpenAPI: `http://localhost:3001/api/openapi.json`

The API and Vite dev server run together. Vite proxies `/api` to the local Express service. `npm run build` creates the web build and API TypeScript build; `npm run typecheck` checks the API and web, and `npm run mobile:typecheck` checks the Expo client. `npm run test:smoke` runs end-to-end API workflows and writes fictional development records (attendance, result, notice, and mock campaign) to PostgreSQL. In production, run the compiled API with `NODE_ENV=production`; Express will serve `apps/web/dist` when built.

## Environment variables

Copy `.env.example` to `.env`. Required in production:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: high-entropy private secret (at least 32 random characters)
- `WEB_ORIGIN`: allowed frontend origin(s)

Configurable: `JWT_EXPIRES_IN`, `PORT`, `ATTENDANCE_THRESHOLD` (defaults to 75), `NODE_ENV`. Never expose server env values to web/mobile bundles.

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

## Fictional development demo accounts

| Role | Login ID | Password |
|---|---|---|
| Student | `student@demo.bits` | `Student@123` |
| Faculty | `faculty@demo.bits` | `Faculty@123` |
| HOD | `hod@demo.bits` | `Hod@123` |
| Principal | `principal@demo.bits` | `Principal@123` |
| Admin | `admin@demo.bits` | `Admin@123` |

The faculty account is only assigned to the fictional CSE 3rd-year Section A DBMS/OS classes. The seed provides 12 fictional students. The student account is Rahul Kumar, roll number `DEMO-CSE-001`.

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

Use the development machine's LAN IP from a physical phone (not `localhost`). For browser-based testing, the responsive web portal already adapts to mobile widths. Android/iOS store signing and EAS configuration are not included.

## REST API

API responses use `{ "success": true, "data": ... }` or `{ "success": false, "message": ... }`.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
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

Full initial contract: `docs/openapi.json`.

## Security and production notes

- Demo identities are not production accounts. Replace/remove demo seed credentials before deployment.
- Use a managed PostgreSQL database, TLS, secret manager, restrictive CORS, backups, rotation, and stronger account lifecycle/MFA controls for production.
- Current JWT sessions are short-lived bearer tokens; browser holds them in `sessionStorage`. Refresh-token rotation/password reset, production account provisioning, upload storage, FCM delivery, payment processing, queued/scheduled SMS worker, and native app store builds remain integration work. The current npm audit still reports advisories in parts of the Expo/React Native and Drizzle Kit toolchain (no critical findings at the last check); review current advisories and platform vendor guidance before production release.
- The SMS provider is explicitly mock by default; demo messaging is not delivered externally.
