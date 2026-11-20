# Deployment and Environment Guide

## 1. Environments

Use separate Firebase projects:
- Development
- Staging
- Production

Do not use production data in local development. Use clearly labelled synthetic seed data only in emulator/dev environments.

## 2. Required configuration

Create `.env.example` with placeholder values for public Firebase web config and provider configuration. Firebase web configuration is not a server secret, but security must come from rules, App Check and backend authorization.

Typical client variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY` (only if web push is configured)
- `VITE_MAP_STYLE_URL` or equivalent provider setting

Server secrets belong in Firebase/Google Cloud secret management, not `.env` committed to source control.

## 3. Local development

Document exact steps to:
1. Install supported Node.js version.
2. Install dependencies.
3. Copy `.env.example` to a local ignored `.env`.
4. Start Firebase Emulator Suite.
5. Run Vite frontend.
6. Load emulator-only seed data.
7. Run tests.

## 4. Firebase setup

Configure:
- Authentication providers and authorized domains.
- Firestore database, rules and indexes.
- Storage bucket and rules.
- Cloud Functions runtime and required APIs.
- App Check.
- FCM web push and VAPID key if enabled.
- Scheduled functions / scheduler billing configuration as applicable.
- Hosting rewrites and headers.

## 5. Map provider

Select a provider for production tiles, geocoding and routing. Review usage limits, attribution requirements, caching rules, privacy terms and cost. Do not assume a public community tile endpoint is suitable for unrestricted production traffic.

## 6. Admin bootstrap

Use a documented, controlled bootstrap method:
- provision the first admin through a trusted script/console process
- verify the target UID
- log the action
- remove/disable bootstrap mechanism after initial setup

Never expose an admin-registration button or let users set admin role themselves.

## 7. Deployment sequence

1. Deploy and test rules/indexes.
2. Deploy Cloud Functions.
3. Configure secrets and provider settings.
4. Deploy frontend to staging.
5. Run smoke tests and end-to-end tests.
6. Verify push, scheduled expansion and private-location access.
7. Review logs/alerts.
8. Promote to production after pilot approval.

## 8. Backups and recovery

Document Firestore export schedule, Storage backup approach, retention, restore procedure and responsible owner. Test restore before relying on backups.

## 9. Pre-launch checklist

- [ ] Production Firebase project configured.
- [ ] Auth domains and providers configured.
- [ ] Firestore rules reviewed and tested.
- [ ] Storage rules reviewed and tested.
- [ ] App Check configured.
- [ ] Admin account provisioned securely.
- [ ] Organization verification process staffed.
- [ ] Food-safety and waste-handling rules reviewed locally.
- [ ] Map provider terms and costs reviewed.
- [ ] FCM configured or push clearly disabled.
- [ ] Scheduled radius expansion tested.
- [ ] Backups and monitoring configured.
- [ ] Privacy policy, terms and contact details completed.
- [ ] English, Kannada and Hindi reviewed.
- [ ] Mobile testing completed.
- [ ] Controlled pilot completed.
