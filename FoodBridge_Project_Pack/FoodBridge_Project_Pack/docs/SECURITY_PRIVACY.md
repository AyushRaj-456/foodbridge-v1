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
