# FoodBridge (Karnataka Community Food Redistribution)

FoodBridge is a production-minded community food redistribution web platform built in JavaScript (React 18 + Vite). It connects places with surplus food (messes, caterers, marriage halls, restaurants) with verified recipients across four strict categories:
1. **Human-food recipients**: Verified NGOs, children's homes, eldercare shelters, and community kitchens.
2. **Animal-food recipients**: Registered cattle shelters (gaushalas) and animal sanctuaries (strictly vegetarian items only).
3. **Composting facilities**: Organic residue conditioning units.
4. **Biogas plants**: High-moisture biomethanation processing units.

---

## 1. Zero-Cost Architecture & Civic Standards

- **100% Free Tier Compliant**: Operates completely within free tiers (Firebase Spark Free Plan, OpenStreetMap / CARTO raster tiles, Photon geocoding). No credit card or paid billing account is required.
- **No SaaS Terminology**: FoodBridge is designed as a unified public-benefit community platform. Terms like `Free`, `Basic`, `Pro`, `Premium`, `Enterprise`, `Pricing`, `Subscription`, `Billing`, and `Tier` are strictly banned across the codebase.
- **Direct Settlement Transportation**: Delivery costs agreed between donors and recipients are settled directly via cash or UPI. No digital wallet, payment gateway, escrow, or platform fee is introduced.
- **Tri-Lingual Parity**: Complete internationalization across English (`en`), Kannada (`kn`), and Hindi (`hi`), persisted in `localStorage` with automated dictionary completeness testing.

---

## 2. Quickstart & Local Installation

### Prerequisites
- Node.js (v18.0.0 or higher; tested on Node v20/v22/v24)
- npm (v9.0.0 or higher)
- Java JRE 11+ (only required if running the offline Firebase Local Emulator Suite)

### Clean Installation Steps
```bash
# 1. Clone the repository and navigate into the project
git clone <repository-url>
cd foodbridge_v1

# 2. Install all dependencies
npm install

# 3. Create local environment configuration
cp .env.example .env.local

# 4. Run automated tests (100% offline, zero network dependencies)
npm test

# 5. Start the local development server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 3. Local Emulator Suite Setup & Development Seeding

FoodBridge is configured to automatically communicate with the Firebase Local Emulator Suite when `VITE_USE_FIREBASE_EMULATOR=true`.

```bash
# Install Firebase CLI globally if not already installed
npm install -g firebase-tools

# Start Auth, Firestore, and Storage emulators
firebase emulators:start --only auth,firestore,storage
```
Emulator endpoints:
- Auth: `http://localhost:9099`
- Firestore: `http://localhost:8080`
- Storage: `http://localhost:9199`
- Emulator UI: `http://localhost:4000`

### Seeding Test Data (Development Only)
When developing with the emulators, test accounts can be generated directly via the Emulator UI at `http://localhost:4000` or using the registration flows:
- **Donor**: Register with any email and choose the *Food Donor* role during onboarding.
- **Recipient**: Register with any email, choose *Recipient Organization*, and submit with category `human` or `animal`.
- **Delivery**: Register with any email, choose *Delivery Partner*.

---

## 4. Secure Admin Bootstrap (No Public Self-Promotion)

Security rules strictly prohibit users from assigning themselves `admin` privileges or updating `isAdmin` from the client (`validSelfRoles()` rejects `'admin'`).

### To bootstrap an administrator account safely:
1. Create a user account normally in the application or Firebase Console (e.g., `admin@foodbridge.internal`).
2. Run a secure server-side Node.js script using the Firebase Admin SDK or manually toggle `isAdmin: true` in the Firestore `/users/{uid}` document via Firebase Console:

```javascript
// scripts/bootstrap-admin.js (Server-side / Firebase Admin SDK)
import admin from 'firebase-admin';

admin.initializeApp();

const targetUid = 'USER_UID_FROM_AUTH';

async function grantAdmin(uid) {
  // Set custom user claim
  await admin.auth().setCustomUserClaims(uid, { admin: true });

  // Update Firestore user record
  await admin.firestore().collection('users').doc(uid).update({
    isAdmin: true,
    roles: admin.firestore.FieldValue.arrayUnion('admin'),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`Successfully elevated UID ${uid} to Administrator.`);
}

grantAdmin(targetUid);
```

---

## 5. Deployment Guide (Firebase Spark Plan)

### A. Firebase Project Setup
1. Create a new free project at [console.firebase.google.com](https://console.firebase.google.com) (select the free Spark plan).
2. Enable **Email/Password** under *Authentication* -> *Sign-in method*.
3. Create a **Cloud Firestore** database in production mode.
4. Enable **Cloud Storage** in production mode.
5. In *Project Settings* -> *General*, add a Web App and copy the configuration into `.env.production` (or your build pipeline environment variables).

### B. Deploy Firestore Security Rules & Composite Indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### C. Deploy Storage Security Rules
```bash
firebase deploy --only storage
```

### D. Deploy Frontend to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

---

## 6. Web Push (FCM) & VAPID Key Setup

1. In the Firebase Console, navigate to **Project Settings** -> **Cloud Messaging**.
2. Under the **Web configuration** tab, locate **Web Push certificates**.
3. Click **Generate key pair**.
4. Copy the public key string into `VITE_FIREBASE_VAPID_KEY` in `.env.local` / `.env.production`.
5. FoodBridge requests notification permissions non-intrusively from the recipient dashboard rather than spamming users on first visit.

---

## 7. Map Tiles, Geocoding & Usage Limits Warning

FoodBridge uses open civic infrastructure:
- **MapLibre GL JS** + **OpenStreetMap / CARTO** raster tiles.
- **Photon Geocoder** (`https://photon.komoot.io/api` by Komoot, powered by OpenStreetMap).

### Important Compliance & Operational Rules:
- Comply with the OpenStreetMap Foundation Acceptable Use Policy:
  - Do not send more than 1 request per second to public Nominatim / Photon servers.
  - Client queries should include an identifying descriptive request pattern.
- For high-volume production deployments, organizations should deploy their own zero-cost containerized Nominatim instance on an existing community server or use self-hosted vector tiles (e.g. Protomaps / PMTiles).

---

## 8. Data Privacy, Compliance & Retention (DPDP / GDPR)

FoodBridge is designed with civic privacy invariants:
- **Public Impact**: The landing page metrics are computed purely from numeric weights and counts; donor and recipient names, exact street addresses, and phone numbers are never exported.
- **Globe Aggregation**: The 3D globe displays safe **district centroids** (e.g., Bengaluru Urban, Tumakuru, Mysuru, Hubballi), completely scrubbing physical building addresses.
- **Delivery Requests**: Available delivery cards display only district-level approximations. Exact addresses are only revealed to the matched, assigned courier.
- **Data Export & Right to Erasure**: [src/services/dataComplianceService.js](file:///c:/Users/Ayush/Desktop/Codes/foodbridge_v1/src/services/dataComplianceService.js) provides automated JSON data export (`exportUserData`) and account scrubbing (`anonymizeAndScrubUserData`), redacting personal identifiers while preserving anonymized aggregate weights for historical public impact integrity.

---

## 9. Backups, Export & Restore Guidance

### Automated Firestore Daily Exports
Using Google Cloud CLI with your Firebase project:
```bash
# Export all collections to a Cloud Storage bucket
gcloud firestore export gs://YOUR_BACKUP_BUCKET/backups/$(date +%Y-%m-%d)

# Restore from a backup snapshot
gcloud firestore import gs://YOUR_BACKUP_BUCKET/backups/2026-11-19/
```

### Emergency Rollback Procedure
If a regression occurs after deploying to Firebase Hosting:
```bash
# Roll back to previous hosting release instantly
firebase hosting:rollback
```

---

## 10. Pre-Launch Checklist & Controlled Pilot Plan

### Pre-Launch Checklist
- [x] All 15 automated test suites pass cleanly (`npm test`).
- [x] Production build passes without chunk warnings under 500 kB threshold (`npm run build`).
- [x] `.env` is omitted from Git via `.gitignore`; only `.env.example` is committed.
- [x] Firestore security rules block unauthorized role elevation (`isAdmin: true`).
- [x] Storage rules restrict file uploads to $\le 5\text{ MB}$ PDFs/images for verification and $\le 3\text{ MB}$ photos for listings.
- [x] Strict suitability separation prevents animal feed from receiving non-vegetarian items (Gaushala rule).
- [x] Food safety danger zones strictly reject room-temperature cooked food past 4 hours for human consumption.
- [x] Transactional locking prevents double-claim race conditions on listings and delivery requests.

### Controlled Pilot Plan (Tumakuru Corridor)
1. **Pilot Geography**: Begin operations in the **Tumakuru $\longleftrightarrow$ Bengaluru** pilot corridor.
2. **Onboarding**: Manually verify an initial batch of 5 surplus donors (college hostels, mess facilities, caterers) and 5 recipient organizations (shelters, gaushalas, compost hubs).
3. **Dispatcher Monitoring**: Administrators monitor the `/admin` Operations Workspace for the first 50 redistribution handovers, auditing pickup compliance, mutual cost splits, and safe-use deadlines.
4. **Expansion Review**: Expand service radius only after the 50th verified completed handover without disputes.

---

## 11. Honest Risk Assessment & Disclaimers

> [!WARNING]
> **Food Safety & Regulatory Disclaimer**:
> FoodBridge is an open-source civic logistics and communication platform designed to coordinate surplus food redistribution. The platform incorporates conservative deterministic rules (e.g., FSSAI 2-hour/4-hour danger zones, vegetarian gaushala safeguards, safe-use buffer deadlines), but software logic alone cannot replace physical sensory inspection.
>
> All recipient organizations must inspect food upon physical handover. FoodBridge does not provide legal, health, or regulatory warranties. Pilot operators must consult local FSSAI authorities and legal counsel before deploying live food redistribution operations.
