# Architecture — FoodBridge V1

## 1. Architecture overview

FoodBridge uses a React client for user interaction and Firebase services for identity, data storage, trusted business logic, files and notifications.

```text
Browser (React + Vite, JavaScript)
  ├── Public site / globe / impact
  ├── Donor dashboard
  ├── Recipient dashboard
  ├── Delivery partner dashboard
  └── Admin workspace
        │
        ├── Firebase Authentication
        ├── Firestore (role-scoped application data)
        ├── Firebase Storage (listing photos and restricted verification files)
        ├── Cloud Functions (trusted workflows)
        │     ├── profile/verification operations
        │     ├── listing validation
        │     ├── recipient matching
        │     ├── scheduled radius expansion
        │     ├── atomic acceptance/capacity reservation
        │     ├── notification dispatch
        │     ├── delivery state transitions
        │     └── impact aggregation
        └── Firebase Cloud Messaging (optional web push)

External adapters:
  ├── Map tiles / geocoding / routing
  └── Optional email/SMS provider (not required for V1 core)
```

## 2. Recommended stack

- React + Vite + JavaScript.
- React Router.
- Firebase Authentication.
- Cloud Firestore.
- Cloud Functions for Firebase (Node.js, JavaScript).
- Firebase Storage.
- Firebase Cloud Messaging.
- Firebase App Check.
- MapLibre GL JS with a selected map data/provider arrangement.
- globe.gl / Three.js for the homepage globe.
- Vitest, React Testing Library, Firebase Emulator Suite, Playwright.

Use current compatible stable versions. Pin dependencies and review updates.

## 3. Frontend boundaries

Suggested feature-oriented structure:

```text
src/
  app/              # router, providers, route guards
  components/       # shared accessible components
  features/
    auth/
    donor/
    recipient/
    delivery/
    admin/
    notifications/
    impact/
    globe/
  lib/              # Firebase client, validation, map adapters
  locales/          # en, kn, hi
  pages/
  styles/
```

The frontend may request operations but must not be trusted to decide role, verification, eligibility, capacity, authoritative distance, acceptance or completion.

## 4. Trusted backend responsibilities

Cloud Functions own:
- Role/verification changes.
- Listing validation and publication.
- Suitability evaluation.
- Recipient search and ranking.
- Radius expansion and notification fan-out.
- Atomic acceptance and capacity reservation.
- Delivery state transitions and confirmations.
- Audit logs.
- Public impact aggregation.

Scheduled matching must use a reliable scheduler/queue pattern. Each scheduled action must be idempotent and safe to retry.

## 5. Geospatial matching

For a small pilot, a geohash-based query or geospatial index pattern can narrow candidates, followed by exact distance calculation using coordinates. Firestore does not provide a native arbitrary-radius query; do not pretend a simple latitude/longitude range is an exact radius.

Recommended sequence:
1. Query candidate geohash ranges for the current radius.
2. Fetch only eligible, verified, active recipient records.
3. Calculate exact great-circle distance server-side.
4. Filter by configured radius.
5. Filter by recipient category, accepted material types, operating status and available capacity.
6. Sort by distance and any documented operational priority.
7. Persist notification attempts to avoid duplicates.

Do not expose recipient private contact details during broad matching.

## 6. Map and globe

- Use map provider adapters for tiles, geocoding and routing.
- Do not hard-code a provider's free-tier assumption.
- Keep API keys restricted and never put server secrets in the client.
- The public globe is an illustrative impact visualization, not a routing engine.
- Use aggregated/anonymized route data in public visualizations.
- Use accurate map coordinates only in authorized operational screens.

## 7. Notifications

In-app notifications are the source-of-truth inbox. FCM web push is an enhancement. Store notification records before/with dispatch and track delivery attempts. Push failure must not erase the in-app notification.

## 8. Reliability patterns

- Server timestamps for authoritative events.
- Firestore transactions for acceptance and capacity reservation.
- Idempotency keys/records for scheduled jobs and notification dispatch.
- Explicit status transition validation.
- Audit logs for privileged actions.
- Retry-safe Cloud Functions.
- Dead-letter/error records for failed asynchronous tasks where needed.

## 9. Environments

Use separate Firebase projects for development, staging and production. Never test destructive rules or migrations against production. Keep secrets in environment-specific secret/config management and commit only `.env.example`.
