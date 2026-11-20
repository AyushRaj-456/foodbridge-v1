# Product Requirements — FoodBridge V1

## 1. Purpose

FoodBridge reduces avoidable food waste by connecting surplus-food donors to suitable nearby recipients and coordinating transportation where required.

## 2. Problem statement

Surplus food can be available at hostel messes, marriage halls, restaurants and other establishments while nearby organizations may need food or organic material. Coordination, suitability, time sensitivity and transportation make redistribution difficult. FoodBridge provides a single workflow to list surplus, identify eligible recipients, notify them, arrange pickup and record completion.

## 3. Product objectives

- Make it easy for a donor to publish a complete surplus listing.
- Automatically identify recipients that are both nearby and suitable.
- Display distance and available additional capacity clearly.
- Notify eligible recipients and expand the search radius when needed.
- Support direct pickup or a delivery partner.
- Track a donation from listing to completion.
- Show trustworthy, aggregated impact statistics.
- Support English, Kannada and Hindi.

## 4. V1 scope

### Included
- Guest browsing of public pages.
- Authentication and role-based access.
- Donor, recipient organization, delivery partner and admin workflows.
- Organization/partner verification.
- Structured food/material listing.
- Suitability-based recipient matching.
- Initial 1.5 km radius, 2-hour wait and configurable expansion (example: 3 km).
- In-app notifications and optional web push.
- Recipient accept/decline.
- Recipient capacity management.
- Direct pickup or delivery-partner request.
- Agreed delivery-cost contribution recording.
- Pickup/delivery confirmations and history.
- English, Kannada and Hindi.
- Karnataka-focused public globe visualization.
- Verified public impact metrics.

### Explicitly excluded
- AI chatbot.
- Food-waste prediction.
- Ratings/leaderboards.
- Wallet, escrow or payment gateway.
- Bidding for deliveries.
- Social feed.
- QR verification.
- Volunteer reward system.
- Continuous live tracking.
- Complex analytics.

## 5. Roles and permissions

| Role | Main permissions |
|---|---|
| Guest | View public pages and aggregate impact |
| Donor | Create/manage own listings; view matched recipient and status; coordinate pickup; confirm handover |
| Recipient organization | Maintain organization profile/capacity; view eligible listings; accept/decline; confirm receipt |
| Delivery partner | Set availability; view eligible delivery requests; accept assigned request; update delivery states |
| Admin | Verify/suspend organizations and partners; review disputes; inspect operational records; audit actions |

Admin status must only be assigned through a trusted, controlled bootstrap process.

## 6. Functional requirements

### FR-01 Authentication
Users can register, sign in, reset passwords and sign out. Operational pages require authentication and role authorization.

### FR-02 Verification
Recipient organizations and delivery partners submit required information. Pending entities cannot accept donations or real delivery assignments.

### FR-03 Listing
Donors can publish, edit where permitted, and cancel listings. Required fields include quantity, pickup location/window, safe-use or collection deadline, relevant handling information and suitability attributes.

### FR-04 Suitability
The backend evaluates which recipient categories may receive a listing. Donor selection is an input, not a guarantee of eligibility.

### FR-05 Matching
The backend filters verified recipients by category, accepted materials, availability, capacity and distance.

### FR-06 Radius expansion
Matching begins at a configurable radius (default 1.5 km). If no eligible recipient accepts after the configured wait (default 2 hours), the radius expands (example: 3 km). Only newly eligible recipients are notified.

### FR-07 Recipient response
Recipients can accept or decline eligible listings. A listing can be accepted by only one recipient in V1.

### FR-08 Capacity
The system displays available additional capacity and prevents acceptance that would exceed it.

### FR-09 Delivery
Donor and recipient can choose direct pickup or request a verified delivery partner. Delivery costs are agreed by both sides and recorded as contributions; payment occurs directly between parties in V1.

### FR-10 Confirmation
Delivery status changes are validated by the backend. Donor/partner/recipient confirmations are recorded. Completion requires the configured confirmation set.

### FR-11 Notifications
In-app notifications are mandatory. Web push is optional based on browser support and user permission.

### FR-12 Public impact
Only verified completed records contribute to public totals. Sensitive data is never exposed.

### FR-13 Localization
All user-facing interface text is available in English, Kannada and Hindi.

## 7. Non-functional requirements

- Responsive from small mobile screens through desktop.
- Accessible keyboard navigation, focus states, semantic labels and sufficient contrast.
- Fast initial load; globe must be lazy-loaded.
- Secure by default; server-side authorization and Firestore/Storage rules.
- Idempotent scheduled jobs and notification dispatch.
- Clear loading, empty, error and offline states.
- Auditable admin actions and donation status history.
- No secrets in source control.
- Maintainable JavaScript codebase with tests.

## 8. Core success measures

- Number of completed, verified donations.
- Quantity redistributed by compatible unit.
- Percentage of listings matched before deadline.
- Median time from listing to acceptance.
- Percentage of accepted donations successfully completed.
- Number of active verified recipient organizations.
- Delivery completion rate.

Do not publish targets or fabricated values until the pilot defines baselines.
