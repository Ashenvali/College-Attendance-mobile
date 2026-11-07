# Google Play release checklist (open items need the college)

Run `npm run launch:check` (add `--live` against a running API) to see these items as a live gate:
34 automated checks run automatically, and every owner-side item below is printed as `MANUAL`
so an unverified item is never mistaken for a passing one.

## Blocking before any upload

- [ ] **Google Play Developer account**, organisation account recommended. New personal accounts must
      run a closed test with a minimum number of testers before production access — check the current
      Play Console rules at signup, they change.
- [ ] **Production API on a permanent HTTPS host.** Set it in `apps/mobile/eas.json` →
      `build.production.env.EXPO_PUBLIC_API_URL` (currently `REPLACE-WITH-PRODUCTION-API-HOST`;
      `npm run launch:check` fails while that placeholder is present).
- [ ] **Delete the demo credentials from the production experience.** Already enforced in code:
      `DEMO_MODE=false` is pinned in the `production` build profile, the API returns 403
      `DEMO_DISABLED` for `@demo.bits` accounts, and the portal hides the demo panel entirely.
      Also run `npm run db:disable-demo` against the production database so the accounts are inactive
      even if the flag is misconfigured.
- [ ] **Target API level 36.** Since **31 August 2026** every new app and every app update must target
      Android 16 (API level 36); an unchanged app must target at least API 35 to stay discoverable.
      Expo SDK 54+ / React Native 0.86 does this by default, but confirm it in the built artefact:
      `bundletool dump manifest --bundle app-release.aab | grep targetSdkVersion` → `36`.
- [ ] **Build the Android artefacts with EAS** (not run in this repository yet — requires an Expo account):
      `cd apps/mobile && npx eas-cli login && npx eas-cli build -p android --profile preview` (APK for
      testers), then `--profile production` for the AAB.
- [ ] **Test the release build on real Android devices**: sign in as each of the five roles, open the
      attendance register, save attendance, trigger an absent-SMS preview in mock mode, and test
      aeroplane mode (the app must show a readable network error, not crash).
- [ ] **Privacy policy at a public URL** (draft: `docs/PRIVACY_POLICY_DRAFT.md` — needs legal review and
      must name the college as the data controller, the retention period, and the contact for deletion).
- [ ] **Data Safety form**: data collected — name, email, phone, roll number, parent/guardian contact,
      attendance, marks, user IDs; encrypted in transit (HTTPS); deletion on request; no data sold.
      Must match the app's actual behaviour — the form is audited.
- [ ] **Content rating questionnaire**, target audience, and **App Access** instructions with a
      reviewer test account on non-production data (never a real student).
- [ ] **Store listing**: app name, short (80 char) and full description, 2–8 phone screenshots,
      1024×500 feature graphic, 512×512 icon, category (Education), contact email.
- [ ] **College authorisation** to publish, plus written permission to use the BITS seal and name.
- [ ] **Backup drill**: `DATABASE_URL=... ./scripts/backup-drill.sh /var/backups/bits.dump` passes
      (verified locally: 9 tables restored with matching row counts).

## Recommended before a pilot

- [ ] `npm run import:students` with the college's real roster (`--dry-run` first) so staff are not on
      demo data; each student receives an initial password and should change it at first sign-in.
- [ ] Live SMS: DLT-registered sender ID + approved template, then `SMS_PROVIDER=msg91` and a test to a
      single staff phone before enabling any campaign.
- [ ] `TRUST_PROXY=1` behind the reverse proxy so login rate limits see real client IPs.
- [ ] `DEMO_MODE=false`, `ALLOW_DEMO_SEED` unset, `NODE_ENV=production`, and a unique
      `BITSKNL_AUTH_SIGNING_SECRET` of 32+ characters (the API refuses to start otherwise).
- [ ] Uptime check on `/health` and a log/alert destination for `[api-error]` lines.
