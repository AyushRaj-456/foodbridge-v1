# Data Model — Firestore Proposal

This is a logical model. Adjust indexes and denormalized fields to actual query patterns. Keep private and public data separated.

## Collections

### `users/{uid}`
- `displayName`
- `email` (only where needed; avoid public exposure)
- `preferredLanguage`: `en | kn | hi`
- `roles`: array from approved role set
- `accountStatus`: `active | suspended | pending`
- `createdAt`, `updatedAt`
- `notificationPreferences`
- Never allow clients to add `admin` or change trusted verification fields.

### `organizations/{organizationId}`
- `ownerUid`
- `name`
- `category`: `human | animal | composting | biogas`
- `verificationStatus`: `pending | approved | rejected | more_info`
- `verificationNotes` (restricted)
- `publicServiceArea` (coarse area only)
- `location`: coordinates/geohash (restricted)
- `acceptedMaterialTypes`
- `acceptedFoodStates`
- `operatingHours`
- `isAccepting`
- `maxCapacity`
- `committedCapacity`
- `availableCapacity` (server-maintained or derived)
- `capacityUnit`
- `createdAt`, `updatedAt`

### `organizationPrivate/{organizationId}`
- private contact person details
- phone/contact channels
- full address
- verification document references
- restricted access only

### `deliveryPartners/{uid}`
- `verificationStatus`
- `availabilityStatus`
- `serviceArea`
- `location` or last known coarse availability area
- `transportMode`
- `maxLoad`
- `capacityUnit`
- private contact details in a restricted document
- `createdAt`, `updatedAt`

### `listings/{listingId}`
- `donorUid`
- `donorOrganizationId` (optional)
- `title`, `description`
- `quantity`, `unit`
- `materialCategory`
- `donorIntendedSuitability`
- `eligibleRecipientCategories` (server-calculated)
- `foodState`
- `preparedAt` / `collectedAt` (when relevant)
- `safeUseDeadline` / `collectionDeadline`
- `storageConditions`
- `allergens`
- `vegType` (when relevant)
- `photoRefs`
- `pickupLocation` (restricted fields or separate private document)
- `pickupWindow`
- `status`
- `acceptedRecipientId`
- `matchingRadiusKm`
- `createdAt`, `updatedAt`, `publishedAt`

### `listingPrivate/{listingId}`
- exact pickup address and coordinates
- private donor contact details
- access limited to donor, accepted recipient, assigned delivery partner and authorized admin

### `matchRuns/{listingId}`
- `currentRadiusKm`
- `nextExpansionAt`
- `radiusStepsKm`
- `status`
- `lastRunAt`
- `processedRecipientIds` or references to notification records
- `attemptCount`
- `updatedAt`

### `listingNotifications/{notificationId}`
- `listingId`
- `recipientOrganizationId`
- `radiusKm`
- `status`: `created | push_sent | read | accepted | declined | expired | failed`
- `dedupeKey`
- `createdAt`, `updatedAt`

### `notifications/{notificationId}`
- `userUid`
- `type`
- `titleKey`, `bodyKey` and safe interpolation data
- `relatedListingId`
- `readAt`
- `createdAt`

### `donationEvents/{eventId}`
- `listingId`
- `actorUid`
- `eventType`
- `fromStatus`, `toStatus`
- `safeMetadata`
- `createdAt`

### `deliveries/{deliveryId}`
- `listingId`
- `donorUid`
- `recipientOrganizationId`
- `deliveryPartnerUid`
- `status`
- `pickupWindow`
- `agreedTotal`
- `donorContribution`
- `recipientContribution`
- `currency`
- `paymentMethodNote`: direct between parties
- `pickupConfirmedAt`
- `handoverConfirmedAt`
- `arrivalMarkedAt`
- `recipientConfirmedAt`
- `createdAt`, `updatedAt`

### `deliveryPrivate/{deliveryId}`
- exact pickup/drop-off coordinates and addresses
- private contact/coordination details
- restricted to assigned parties and admin

### `capacityReservations/{reservationId}`
- `organizationId`
- `listingId`
- `quantity`
- `unit`
- `status`: `reserved | released | consumed`
- `createdAt`, `updatedAt`

### `verificationCases/{caseId}`
- `subjectType`
- `subjectId`
- `status`
- `submittedAt`
- `reviewedBy`
- `reviewedAt`
- `decisionReason`
- restricted document references

### `adminAuditLogs/{logId}`
- `adminUid`
- `action`
- `targetType`
- `targetId`
- `reason`
- `createdAt`

### `publicImpact/{regionId}`
- server-computed aggregate values only
- `completedDonationCount`
- `quantityByUnit`
- `activeVerifiedRecipientCount`
- `updatedAt`

## Data invariants

1. Clients cannot write trusted role, verification, status, matching, capacity or audit fields directly.
2. A listing in V1 has at most one accepted recipient.
3. Acceptance and capacity reservation happen atomically.
4. Capacity cannot become negative.
5. A recipient cannot accept if available capacity is less than listing quantity.
6. Expired or cancelled listings cannot be accepted.
7. Notification deduplication is enforced by a stable key.
8. Public data never includes exact private locations or private contact data.
9. Impact totals count completed verified donations only.
10. All authoritative timestamps are server-generated.
