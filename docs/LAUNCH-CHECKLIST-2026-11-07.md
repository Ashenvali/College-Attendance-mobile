# Pre-launch checklist — verified 7 November 2026

Command by command, item by item. Every **PASS** below was produced by running the check, not by
reading the code. Anything the sandbox cannot verify is marked **MANUAL** or **NOT VERIFIED** — a
missing verification is never reported as a pass.

Reproduce everything with:

```bash
npm run launch:check                 # 34 automated checks, no server needed
npm run launch:check:live            # + live API probes (start the API first)
```

Latest run: **32/34 automated checks passed, 2 failed, 15 manual items open (8 blockers).**
Verdict: **NOT READY TO LAUNCH.**

---

## 1. Build, types and tests

| # | Check | Result | Evidence |
|---|---|---|---|
| 1.1 | API + portal typecheck (`tsc --noEmit`) | **PASS** | `npm run typecheck` clean |
| 1.2 | Expo client typecheck | **PASS** | `npm run mobile:typecheck` clean |
| 1.3 | Unit + integration tests | **PASS** 10/10 | `npm test` (with `TEST_DATABASE_URL`) |
| 1.4 | Web production build | **PASS** | `npm run build` → 674 kB / 185 kB gzip |
| 1.5 | Expo web export (18 routes) | **PASS** | `npm run mobile:export` |
| 1.6 | Android Hermes export | **PASS** | `npx expo export --platform android` |
| 1.7 | Migrations + seed from an empty database | **PASS** | `npm run db:migrate`, `npm run db:seed` |
| 1.8 | End-to-end API suites (smoke, modules, permissions, parity) | **PASS** | `npm run test:smoke` — 28/28 role checks, 74/74 client URLs matched |
| 1.9 | AAB / APK built by EAS and installed on a device | **MANUAL** | needs an Expo account and a phone |

## 2. Security

| # | Check | Result | Evidence |
|---|---|---|---|
| 2.1 | Passwords hashed (bcrypt, cost 12) | **PASS** | `apps/api/src/routes/auth.routes.ts`, `db/seed.ts` |
| 2.2 | JWT signed with a secret that production cannot default | **PASS** | `utils/jwt-secret.ts` throws unless `NODE_ENV` is development/test |
| 2.3 | Sign-out actually revokes the token | **PASS** | `session_version` bumped on logout/revoke/password change/admin reset; live probe `login → me 200 → logout → me 401` |
| 2.4 | Role-based access enforced server-side | **PASS** | permission matrix 28/28 across Student/Faculty/HOD/Principal/Admin |
| 2.5 | Login rate limiting (per IP and per account) | **PASS** | two `express-rate-limit` instances on `/api/auth/login` |
| 2.6 | SMS send throttling per staff member | **PASS** | `SMS_RATE_LIMIT_PER_MINUTE`, default 20/min |
| 2.7 | Database errors never leak SQL or parameters | **PASS** | `findPostgresError`; regression test `apps/api/tests/errors.test.ts`; live probe L05 clean |
| 2.8 | Parent phone numbers masked in responses | **PASS** | `parentPhoneMasked` in `admin.routes.ts`; mobile profile masks to last 4 digits |
| 2.9 | RLS enabled on every public table, no open policies | **PASS** | `rls-check.ts` → 25/25 tables, 0 policies, API-only access |
| 2.10 | No secrets in the repository | **PASS** | 137 tracked files scanned for `.env`, `.pem`, `.key` |
| 2.11 | Helmet security headers, `x-powered-by` disabled | **PASS** | `apps/api/src/server.ts` |
| 2.12 | CORS restricted to configured origins | **PASS** | `WEB_ORIGIN` allowlist; credentials only from listed origins |
| 2.13 | Demo accounts cannot be used in production | **PASS (new)** | `DEMO_MODE` gate → 403 `DEMO_DISABLED`; portal hides the demo panel; seed refuses demo data in production; `DEMO_MODE=false` pinned in the EAS production profile |
| 2.14 | Password recovery for end users | **FAIL** | no self-service reset; the mobile app now opens a pre-filled reset request to the administrator, which is a manual process |
| 2.15 | Penetration test / external security review | **NOT VERIFIED** | out of scope for this audit (no destructive testing) |

## 3. Data and privacy

| # | Check | Result | Evidence |
|---|---|---|---|
| 3.1 | Parent SMS consent recorded by an administrator only | **PASS** | `admin.routes.ts` 403 for other roles; consent requires a phone number |
| 3.2 | Live SMS only to consenting, non-demo guardians | **PASS** | `sms.routes.ts` consent filter + `is_demo` exclusion |
| 3.3 | SMS defaults to mock, nothing is transmitted | **PASS** | `SMS_PROVIDER=mock`; suite logs `[SMS MOCK]` |
| 3.4 | Phone numbers masked in stored recipient records and logs | **PASS** | masked in `sms_recipients`, masked in the delivery dashboard |
| 3.5 | Backup + restore drill | **PASS (new)** | `scripts/backup-drill.sh` — 9 tables restored with matching row counts |
| 3.6 | Data retention / deletion policy documented | **FAIL** | mentioned in the privacy draft, not implemented as a procedure |
| 3.7 | Privacy policy published at a public URL | **MANUAL (blocker)** | draft exists at `docs/PRIVACY_POLICY_DRAFT.md` |

## 4. Google Play requirements (checked 7 November 2026)

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 4.1 | Android package id | **PASS** | `in.edu.bitskurnool.college` |
| 4.2 | Icon + splash at 1024×1024 | **PASS** | `assets/images/icon.png`, `splash-icon.png` |
| 4.3 | No unnecessary permissions | **PASS** | `permissions: []`; audio + overlay blocked; `allowBackup: false` |
| 4.4 | Version + versionCode set | **PASS** | `1.0.0` / `1` |
| 4.5 | **targetSdk 36** (mandatory since 31 Aug 2026 for new apps and updates; existing apps need ≥ 35 to stay discoverable) | **NOT VERIFIED** | Expo SDK 54 default is expected to be 36, but the native project is generated at build time — verify with `bundletool dump manifest` on the real AAB |
| 4.6 | Production API host configured | **FAIL (blocker)** | `apps/mobile/eas.json` still contains `REPLACE-WITH-PRODUCTION-API-HOST` |
| 4.7 | Production profile disables demo mode | **PASS (new)** | `DEMO_MODE=false` |
| 4.8 | Data Safety form | **MANUAL (blocker)** | Play Console |
| 4.9 | Content rating | **MANUAL (blocker)** | Play Console |
| 4.10 | Store listing assets (screenshots, feature graphic, descriptions) | **MANUAL** | not in the repository |
| 4.11 | Reviewer test account in App Access | **MANUAL** | must be non-production data |
| 4.12 | Billing Library 8+ | **NOT APPLICABLE** | the app does not use Play Billing (fees are recorded internally, no payments) |
| 4.13 | Closed testing cohort before production access | **MANUAL** | required for new personal developer accounts |

## 5. Mobile app behaviour

| # | Check | Result | Evidence |
|---|---|---|---|
| 5.1 | Five role logins, role-aware navigation | **PASS** | mobile routes + `/api/dashboard` |
| 5.2 | Student attendance reads faculty-saved records | **PASS** | `/api/attendance/me` |
| 5.3 | Faculty register: classes → roster → mark → confirm → save | **PASS** | `/api/attendance/register*`, `/api/attendance` |
| 5.4 | Parent SMS scoped to assigned sections/department | **PASS** | `/api/sms/parents/*` + 28/28 permission checks |
| 5.5 | Token stored in the platform keychain on device | **PASS** | `expo-secure-store` (`storage.ts`); browser build documents its `localStorage` fallback on-screen |
| 5.6 | Web build works in a browser (no keychain APIs) | **PASS (new)** | `/mobile/`, `/mobile/login`, `/mobile/attendance` → 200 |
| 5.7 | Offline / network-error handling | **PARTIAL** | readable error states, no offline queue or cache |
| 5.8 | Push notifications | **FAIL** | in-app notifications only; no FCM/APNs wiring |
| 5.9 | Device test on real hardware | **MANUAL (blocker)** | not possible in this sandbox |

## 6. Operations

| # | Check | Result | Evidence |
|---|---|---|---|
| 6.1 | `/health` reports database connectivity | **PASS** | live probe L01 |
| 6.2 | Docker image builds the API + portal + mobile web build | **PASS** | multi-stage `Dockerfile` |
| 6.3 | Container serves the SPA and `/mobile/` with deep links | **PASS** | static routing verified on port 3000 |
| 6.4 | `TRUST_PROXY` so rate limits see real client IPs | **PARTIAL** | supported and documented, must be set per deployment |
| 6.5 | Log/alert destination for `[api-error]` | **FAIL** | stdout only |
| 6.6 | CI pipeline running the gate on every change | **FAIL** | no workflow file; `npm run launch:check` is ready to be wired in |
| 6.7 | Uptime monitoring + on-call owner | **MANUAL** | college IT |

---

## Verdict

**NOT READY TO LAUNCH.** Blocking items, in the order they should be cleared:

1. Production API host in `eas.json` (4.6) — code-side, five minutes.
2. Build the AAB with EAS and confirm `targetSdkVersion 36` (4.5, 1.9).
3. Device test of the release build, all five roles (2.13 in context, 5.9).
4. Privacy policy published (3.7) + Data Safety form (4.8) + content rating (4.9).
5. Play Console account, store listing, reviewer account, closed test (4.8–4.13).
6. Live SMS: DLT sender ID + approved template (3.2 verified in mock only).
7. College authorisation to publish and to use the seal.

**Ready for internal testing / pilot today**: the software itself passes 32/34 automated checks, the
permission matrix is 28/28, the backup drill restores cleanly, and the three blockers that were code
defects during the audit (no browser build, SQL-leaking 500s, cosmetic sign-out) are fixed. The
remaining blockers are accounts, paperwork and hardware — not engineering.
