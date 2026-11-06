# Google Play release checklist (open items need the college)
- [ ] Google Play Developer account (organisation account recommended; new personal accounts have extra closed-testing requirements - check current Play Console rules).
- [ ] Production API on a permanent https host; set it in `apps/mobile/eas.json` (`production.env.EXPO_PUBLIC_API_URL`).
- [ ] `cd apps/mobile && npx eas-cli login && npx eas-cli build -p android --profile preview` (APK for testers), then `--profile production` (AAB). Requires an Expo account; this has NOT been run.
- [ ] Test the release build on real Android devices (login per role, attendance, SMS in test mode, no-network behaviour).
- [ ] Privacy policy published at a public URL (draft: docs/PRIVACY_POLICY_DRAFT.md - needs legal review).
- [ ] Data Safety form (data collected: name, email, phone, student/parent contact, attendance, user IDs; encrypted in transit; deletion on request).
- [ ] Content rating, target audience, app access instructions with a reviewer test account (non-production data), store listing text, icon, screenshots, feature graphic.
- [ ] College authorization to publish and permission to use the logo/seal.
- [ ] Re-check current Play target-API-level requirements at submission time.
