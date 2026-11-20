# Security, Privacy and Safety Requirements

## 1. Trust boundaries

The browser is untrusted. Any value supplied by the client can be modified. Trusted decisions must be made in Cloud Functions or another secured backend.

Never trust client-supplied:
- role/admin status
- organization verification status
- available capacity
- listing eligibility
- distance/radius result
- acceptance state
- delivery state
- impact totals
- payment agreement confirmation by the other party

## 2. Authentication and authorization

- Require authentication for operational actions.
- Enforce role and ownership in Firestore/Storage rules and backend functions.
- Admin privileges must be provisioned through a controlled process.
- Pending/unverified organizations cannot accept donations.
- Unverified delivery partners cannot accept delivery requests.
- Suspend access when an account is suspended.
- Add Firebase App Check and reasonable abuse/rate protections.

## 3. Location privacy

- Exact pickup/drop-off addresses are private.
- Public pages and globe use aggregated or anonymized data.
- Show approximate distance to eligible recipients.
- Reveal exact addresses only to donor, accepted recipient, assigned delivery partner and authorized admin as necessary.
- Do not implement continuous live tracking in V1.
- Define retention and deletion policies for location data.

## 4. Document and photo protection

- Validate file type, size and content as far as practical.
- Use separate paths and rules for public listing images versus private verification documents.
- Verification documents must never be publicly readable.
- Avoid storing unnecessary identity documents.
- Restrict admin access and audit sensitive reads/actions where feasible.

## 5. Food safety and recipient suitability

FoodBridge is a coordination tool, not a food-safety certification authority.

- Capture preparation/collection time, deadline, storage and condition.
- Use conservative server-side eligibility rules.
- Do not route spoiled, expired, contaminated or unknown-condition items to human or animal consumption.
- Animal suitability is recipient/material-specific.
- Recipients must inspect food/material before accepting handover.
- Display clear donor-declaration and recipient-inspection language.
- Have the pilot's food-safety and waste-handling policies reviewed by qualified local authorities.

## 6. Data minimization

Collect only data needed to coordinate donations and verify organizations. Avoid exposing phone numbers, private names, exact addresses and documents to the public.

## 7. Logging and audit

- Record admin verification, suspension and dispute decisions.
- Record important listing and delivery status changes.
- Do not log passwords, authentication tokens, private document URLs or unnecessary personal data.
- Use server timestamps.

## 8. Retention and user rights

Before launch, define:
- How long completed donation and audit records are retained.
- How users request account deletion or data correction.
- Which records must be retained for safety, fraud prevention or legal obligations.
- How private documents are deleted when no longer needed.

## 9. Incident response

Document an owner and process for:
- compromised admin account
- unauthorized data exposure
- false or unsafe listing
- delivery dispute
- notification abuse
- service outage

Provide a way for users to report an issue and ensure the admin workspace can place a listing or account on hold.


---

## 10. Firebase App Check & Zero-Cost Abuse Protection Setup

To prevent automated bot scraping, credential abuse, and unauthorized API traffic, configure **Firebase App Check** using free attestation providers:

### Zero-Cost Provider Architecture
1. **Web Client (Free):** Use **reCAPTCHA v3** (100% free up to 1,000,000 assessments/month) or **reCAPTCHA Enterprise free tier**.
2. **Local Development & Emulators:** Use **App Check Debug Tokens** (`FIREBASE_APPCHECK_DEBUG_TOKEN`) so local emulator workflows incur zero cost and zero network calls.

### Client Initialization Example (`src/services/firebase.js`)
```javascript
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from 'firebase/app-check';

if (typeof window !== 'undefined' && !import.meta.env.VITE_USE_FIREBASE_EMULATOR) {
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}
```

### Backend Enforcement
In production, enable App Check enforcement for Cloud Firestore and Cloud Storage in the Firebase Console:
- Requests without a valid attestation token are rejected at the edge before consuming database reads or bandwidth quotas.
- Emulator requests automatically bypass or use debug tokens when `singleProjectMode` is active.
