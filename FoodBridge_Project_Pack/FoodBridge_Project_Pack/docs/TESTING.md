# Testing Strategy

## 1. Test layers

### Unit tests
- Food/material suitability.
- Recipient category eligibility.
- Available capacity calculation.
- Distance calculation.
- Radius-step selection.
- Listing and delivery state transitions.
- Localization fallback and formatting.
- Impact aggregation.

### Backend integration tests
Use Firebase Emulator Suite to test:
- Authentication and role authorization.
- Firestore rules.
- Storage rules.
- Listing publication.
- Matching and radius expansion.
- Notification deduplication.
- Atomic acceptance and capacity reservation.
- Concurrent acceptance attempts.
- Delivery state transitions.
- Admin verification and audit logs.

### End-to-end tests
Use Playwright for:
1. Guest views homepage and switches language.
2. Donor creates account and submits listing.
3. Verified eligible recipient sees donation and accepts it.
4. Ineligible recipient cannot see/accept an unsuitable listing.
5. Pending organization cannot accept.
6. Radius expands after configured test time.
7. Delivery partner accepts and updates delivery.
8. Recipient confirms receipt.
9. Admin verifies an organization.
10. Unauthorized user cannot view exact address or verification documents.

## 2. Critical edge cases

- Listing deadline passes during matching.
- Organization becomes suspended after notification.
- Capacity changes after notification but before acceptance.
- Two recipients accept simultaneously.
- Scheduled function runs twice.
- Push dispatch fails but in-app notification persists.
- Donor cancels after acceptance.
- Delivery partner cancels after assignment.
- Recipient rejects food at handover.
- A party does not confirm delivery.
- Coordinates are missing or invalid.
- Map provider is unavailable.
- Browser denies notification permission.
- User switches language while a form is open.

## 3. Quality gates

Before merging:
- Lint passes.
- Unit tests pass.
- Emulator integration tests pass.
- Production build passes.
- Critical Playwright journeys pass.
- No secrets or personal data in commits.
- No permissive Firestore/Storage rules.
- Manual accessibility and mobile smoke tests completed.

## 4. Test data

Use synthetic data only in development/emulator environments. Label it clearly. Never seed fake donations or fake impact numbers into production.
