# BITS Kurnool implementation status

**Status date:** 7 October 2026
**Institution:** Brindavan Institute of Technology & Science (BITS Kurnool)
**Address:** NH-7, Peddatekur, Kurnool – 518218, Andhra Pradesh, India.

## Implemented

- TypeScript monorepo with React/Vite responsive website, Express/TypeScript REST API, Drizzle/PostgreSQL schema and migrations, and a separate Expo/React Native companion client.
- Shared official college identity: the user-supplied seal, full name, compact “BITS Kurnool” wordmark, official website, and address across login, role dashboards, headers and application metadata.
- Unified login with hashed credentials, JWT sessions, password visibility, explicitly fictional demo accounts, distinct Student/Faculty/HOD/Principal/Admin dashboards and backend role-based access controls.
- Student modules for profile, attendance, timetable, subjects, examinations, results, fees, notices, notifications, assignments, events and help; student attendance is read from the same PostgreSQL attendance records written by Faculty.
- Faculty classes, student listing, marks, timetable, class notices, notifications and the digital Attendance Register with assigned-class access, date-based roster, Present/Absent/Late, Mark All Present, search, status filters, live counters, confirmation, transaction-based persistence, attendance recalculation, audit trail and low-attendance notification.
- HOD department monitoring and attendance analytics; Principal institution-level overview and review/publication controls; Admin catalogue and operational management.
- Role-scoped notices and notification fan-out/read state; exams, marks entry, HOD review, Principal publication, fees, timetable, assignments, events, reports/CSV, audit logs, and SMS campaigns with an explicit no-credentials mock mode.
- Multi-stage production Dockerfile serving the built SPA and API on the platform-provided port. The production image includes only API runtime dependencies and the public Supabase CA file; the Expo workspace is excluded from the server image.

## Verified against the selected Supabase PostgreSQL project

- The user-selected project `evszpfuzlexcmebdomzh` in Mumbai (`ap-south-1`) was empty at inspection. Its IPv4-compatible Supavisor Session Pooler connects from this environment with `sslmode=verify-full`, the official Supabase Root 2021 CA, and hostname verification. The CA is public and lives only in the server-side API path; connection and JWT secrets remain in the protected WebDev secret store.
- The checked-in schema migration applied successfully. The idempotent seed created six fictional departments, 12 fictional CSE Year 3 Section A students, five fictional role demo accounts, and four historical DBMS attendance dates.
- Attendance integration test passed against Supabase: Faculty saved 12 records for 4 October 2026 (11 Present, Rahul Kumar (Demo Student) Absent); Student then read CS501 at **60% (3/5 classes)**; the low-attendance notification was generated; HOD analytics showed the student below threshold; Student was denied the Faculty register endpoint.
- Module integration test passed: all five operational-role JWT logins, academic catalogue, Admin teaching assignment, Faculty marks entry, HOD review, Principal publication gate, Student result visibility, Admin notice/notification fan-out, and SMS mock campaign for 11 fictional recipients. **No SMS was transmitted.** These tests intentionally leave fictional sample records, including a timestamped demo notice, examination/mark record and mock SMS campaign, in the demo database.
- `/health` returns database connected. The public Preview serves `/manus-routes.json` as JSON and accepts a fictional demo login. Browser checks loaded both the Student dashboard and Faculty Attendance Register; the Student dashboard displayed the PostgreSQL-backed **60% / 3 of 5** attendance, and the Faculty register loaded 12 assigned students without another save.
- Production-mode API smoke check on an alternate local port served the SPA and route manifest, authenticated the Student demo account and returned the same 60% attendance.
- API/web TypeScript checks, Expo mobile TypeScript check and web production build pass. Vite emits a non-blocking warning that the minified JavaScript chunk is larger than 500 kB.

## Demo account safety

All seeded accounts, names, fee/assessment data and attendance are fictional. The evaluation login displays the demo credentials publicly. This release is **for demonstration only**: disable/replace demo credentials and establish production identity, account lifecycle, password recovery, backups and access policy before loading real student, staff, fee or examination records.

## Hosting and remaining integrations

- The project is configured for managed on-demand (Autoscale) hosting with a stable platform HTTPS URL after publication. The Preview was verified earlier, but its temporary development process has since stopped; the permanent URL will be reported only after the checkpoint and publication succeed. Docker is not installed in this Sandbox, so WebDev's managed publication performs the authoritative container build. On-demand instances may sleep while idle and incur a cold-start delay.
- The selected Supabase project is on the Free plan. Supabase documents that projects with low database activity may be paused after seven days; a paused database-backed website requires restoring the Supabase project before it works again. No plan upgrade or billing change was made.
- SMS remains mock mode unless the owner configures an approved gateway URL, API key and sender ID. FCM push, S3/object storage, Redis/scheduled SMS worker and payment processing are not enabled. Password reset, MFA, refresh-token rotation and native app-store signing are not included.
- The web portal contains the broader modules; the Expo client remains a compact role-login and attendance companion, not a full mirror of every web module. Some catalogue/administrative flows have read/create or approval paths but not comprehensive update/delete operations.

## Local development

```bash
cp .env.example .env
sudo systemctl start postgresql
pg_isready
npm install
npm run db:setup
npm run dev
```

- Web/Preview dev server: `http://localhost:3000`
- API: `http://localhost:3001/api`
- Health: `http://localhost:3001/health`
- Expo client: `cd apps/mobile && npx expo start`; configure `EXPO_PUBLIC_API_URL` to an origin reachable from the device.

See the root `README.md` for the public demo identities, endpoints, migrations, feature limitations and setup details.
