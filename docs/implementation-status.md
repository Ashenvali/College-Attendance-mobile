# BITS Kurnool implementation status

**Status date:** 4 October 2026  
**Institution identity:** Brindavan Institute of Technology & Science (BITS Kurnool), NH-7, Peddatekur, Kurnool – 518218, Andhra Pradesh, India.

## Implemented

- Organized the application as a TypeScript monorepo with Express/PostgreSQL API, React/Vite web portal, and a separate Expo/React Native client.
- Created the relational PostgreSQL schema and versioned Drizzle migration; verified migrations and idempotent fictional demo seeding against local PostgreSQL 16.
- Implemented password hashing, JWT bearer sessions, login throttling, authentication middleware, role-specific navigation, and role-scoped REST routes for Student, Faculty, HOD, Principal, Admin, and Super Admin.
- Implemented the faculty attendance flow: assigned-class selection, date-based roster, Present/Absent/Late, mark-all, search/filter and live totals, confirmation, transactional session/record save, recalculation, audit logging, and low-attendance notifications.
- Connected student subject attendance and HOD attendance analytics to the same saved PostgreSQL attendance records.
- Added role-scoped dashboards, notices and in-app notifications, timetable, subjects, exams, marks/review/result publication, fees, assignments, events, reports/CSV export, audit log reads, catalogue and class-assignment management, and SMS campaign APIs/UI.
- Implemented SMS as an explicit mock by default; an optional HTTP gateway adapter uses environment variables and is not active without credentials.
- Added a responsive BITS Kurnool web portal using the official institutional identity and college seal, plus a compact native Expo client for Student and Faculty attendance workflows.
- Added API contract documentation, setup instructions, reusable smoke tests, Docker Compose PostgreSQL configuration, and environment examples.

## What is verified working

- PostgreSQL migrations and fictional seed complete successfully. Seed contains six departments, 12 fictional CSE 3-A students, five role demo identities, and historical attendance.
- API reports database connected; local Vite and public sandbox preview both return HTTP 200.
- Web login was exercised in the isolated browser with the fictional Student account. The live dashboard displayed PostgreSQL-backed attendance, notices, timetable, fees, and exam summary. The Student Attendance page showed the faculty-recorded CS501 attendance at **60% (3 of 5 classes)**.
- `npm run test:smoke` passed both suites. The attendance suite verified a Faculty save, Student read-back, low-attendance alert, Student denial from Faculty register endpoints, and HOD analytics update. The module suite verified role logins, class assignment, marks entry, HOD review gate, Principal result publication, notice fan-out, and SMS mock mode with no messages transmitted.
- `npm run typecheck`, `npm run mobile:typecheck`, `npm run build`, `npm run db:setup`, and `npx expo install --check` all passed.

## Demo accounts

These identities and all linked academic records are fictional development data; they do not represent actual BITS Kurnool employees or students.

| Role | Login ID | Password |
|---|---|---|
| Student | `student@demo.bits` | `Student@123` |
| Faculty | `faculty@demo.bits` | `Faculty@123` |
| HOD | `hod@demo.bits` | `Hod@123` |
| Principal | `principal@demo.bits` | `Principal@123` |
| Admin | `admin@demo.bits` | `Admin@123` |

## Setup and run

```bash
cp .env.example .env
# Start a PostgreSQL service, or: docker compose up -d postgres
npm install
npm run db:setup
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001/api`
- Health: `http://localhost:3001/health`
- Expo client: `cd apps/mobile && npx expo start`
- Mobile API origin: set `EXPO_PUBLIC_API_URL` to an origin reachable from the device (not `localhost` on a physical phone).

The checked-in `.env.example` contains placeholders/local development defaults only. Never deploy its demo JWT secret or demo passwords. Configure a managed PostgreSQL `DATABASE_URL`, high-entropy `JWT_SECRET`, allowed `WEB_ORIGIN`, and TLS/secret management before production.

## Remaining work / configuration

- Demo JWT sessions are short-lived; refresh-token rotation, password recovery, MFA, account provisioning, and production authentication policy are not implemented.
- Several management modules have functional API-backed read/create or approval paths, but comprehensive update/delete workflows and institution-wide reporting exports are not complete.
- Push delivery (FCM), object storage (S3), queued/scheduled SMS worker (Redis), and payment processing are architecture/configuration placeholders only. SMS remains safe mock mode until a gateway URL/key/sender ID are configured; no real SMS was sent in testing.
- The native client is a compact login/attendance client, not a full mirror of every web-portal module. EAS configuration, store signing, and physical-device acceptance testing remain.
- The last `npm audit` reported 28 advisories (11 moderate, 17 high, 0 critical), primarily in Expo/React Native tooling dependencies and the Drizzle Kit toolchain. `drizzle-orm` itself was upgraded beyond the reported SQL identifier injection range. Review the live audit and compatible vendor fixes before a production release; avoid blindly downgrading framework versions to satisfy stale/incorrect suggested major fixes.
- The current sandbox web preview is temporary and is not a production deployment. Configure a managed hosting target and managed PostgreSQL for durable public access.

## Validation commands

```bash
npm run typecheck
npm run mobile:typecheck
npm run build
npm run db:setup
npm run test:smoke
cd apps/mobile && npx expo install --check
```

`npm run test:smoke` writes clearly fictional integration-test attendance, marks, notice, and mock-campaign records to the development database. It sends no SMS.
