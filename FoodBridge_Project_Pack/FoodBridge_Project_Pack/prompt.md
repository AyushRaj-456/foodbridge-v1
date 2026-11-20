# FoodBridge — Gemini Build Prompts (7 Phases)

Use these prompts in order in one Gemini coding workspace that has access to the project repository. The prompts are deliberately broad so each phase completes a meaningful, testable slice instead of requiring many small follow-ups.

## How to use

1. Create/open a repository named `foodbridge`.
2. Paste the **Project Context / Rules** prompt below once.
3. Then paste Phase 1 through Phase 7 sequentially.
4. Keep Gemini in the same repository/workspace so it can inspect existing code.
5. After every phase, review the diff and run the commands Gemini reports. Do not proceed while a phase has failing tests or broken build.
6. If Gemini reaches a response limit, tell it to continue from the last unfinished checklist item without replacing completed files.

---

# A. Project Context / Rules — paste first

You are the lead product engineer and senior full-stack developer building **FoodBridge**, a production-minded community food redistribution web application. Build the actual working application in the currently open repository, not just a mockup, tutorial or static design.

## Mission

FoodBridge connects places that have surplus food (college/hostel messes, marriage halls, restaurants, caterers and other donors) with verified, suitable recipients and delivery partners. Its purpose is to reduce food waste by matching food to the right destination.

## V1 recipient categories

1. **Human-food recipients:** verified NGOs, orphanages, shelters and similar organizations.
2. **Animal-food recipients:** verified cattle farms, animal shelters and other approved animal-care organizations.
3. **Composting facilities:** facilities that accept suitable organic material.
4. **Biogas facilities:** facilities that accept suitable organic material for processing.

Do not treat these categories as interchangeable. A food item must only be matched to recipients whose accepted material types and safety/capability rules fit that item. Never automatically classify questionable or expired food as safe for people or animals. If suitability is unknown, require a safe review path or restrict it to a non-consumption destination that explicitly accepts it.

## Main roles

- **Guest:** can browse the public landing page, public impact totals and general explanation. Guest cannot create donations or accept them.
- **Donor:** creates and manages food listings, sees matching/acceptance status, arranges pickup and confirms handover.
- **Recipient organization:** registers, submits verification information, defines recipient category, service area, accepted food/material types, operating hours and current additional capacity; can accept or decline eligible donations.
- **Delivery partner:** registers, sets availability, sees eligible delivery requests, accepts a delivery and updates pickup/delivery status.
- **Administrator:** verifies organizations and delivery partners, manages reported issues, monitors listings and can suspend accounts. Admin actions must be audited.

A person may have more than one role only if the data model and UI support it safely. Do not assume that every user is an NGO.

## Core workflow

1. Donor signs in and creates a listing with food/material name, category/suitability details, quantity, preparation/collection time where relevant, safe-use deadline, storage/handling details, allergens where relevant, photo, pickup location and contact/coordination preferences.
2. Backend validates the listing and determines eligible recipient categories from structured fields and safety rules. Donor input is not the only safety check.
3. Backend finds verified, active recipients within the initial configurable radius (default 1.5 km), filters by category, accepted material types, operating status and available additional capacity, and ranks by distance.
4. Eligible recipients receive a notification. The recipient sees the key facts in a compact card: distance, requested quantity, available additional capacity, deadline and accept/decline actions.
5. If no eligible recipient accepts within the configurable waiting period (default 2 hours), expand the radius (for example 3 km, then configurable further steps) and notify only newly eligible recipients. Never send duplicate notifications for the same listing/recipient/radius cycle.
6. Stop matching when the listing is accepted, cancelled, expired or otherwise closed. A recipient acceptance must be atomic so two recipients cannot both claim the same single-recipient listing. If partial allocations are implemented, make them explicit and tested; otherwise use one recipient per listing in V1.
7. Donor and recipient choose direct pickup or request a delivery partner. Delivery cost is agreed between donor and recipient, with each able to contribute a share. V1 records the agreed amount and each party's contribution; do not build a wallet, escrow or payment gateway unless explicitly configured in a later scope.
8. Delivery partner accepts a delivery request, confirms pickup, and marks arrival/delivery. Donor confirms handover; recipient confirms receipt. Listing becomes completed only after required confirmations.
9. Keep a traceable status history and donation history for relevant users.

## Key product requirements

- Display recipient distance and **available additional capacity** clearly. Capacity means how much more the recipient can accept now, not total facility capacity.
- Use a clean, minimal, accessible interface. One clear primary action per screen. Avoid clutter, oversized dashboard cards, unnecessary gradients, excessive colors, unnecessary animations and feature bloat.
- Public homepage order: navigation; hero; interactive globe focused on Karnataka; impact statistics; “How it works”; concise community/recipient explanation; footer.
- Globe: rotatable Earth, Karnataka highlighted/zoomed, animated delivery routes/vehicle markers. It is an illustrative public visualization driven by safe aggregate/demo data or anonymized active route data. Do not expose exact private pickup/drop-off addresses. Lazy-load it, respect reduced-motion preference, and provide a fallback.
- Use a normal accurate map for operational pickup/drop-off and route information. Never use the decorative globe as navigation.
- Public statistics must be computed from verified completed records. Do not ship invented production statistics. If there is no real data, show zero-state copy or clearly labelled demo content in development only.
- Languages: English, Kannada and Hindi. Translate all user-facing strings, validation messages, navigation, status labels and notifications. Keep translation files organized. Do not machine-translate user-entered names/addresses.
- Responsive desktop, tablet and mobile layouts.
- Use accessible labels, keyboard navigation, visible focus, sufficient contrast and clear error states.
- Include loading, empty, error, success and offline/permission-denied states.
- Do not implement V1 chatbot, ratings, leaderboards, wallet, bidding, social feed, AI prediction, QR verification or volunteer rewards.
- Do not create fake users, fake NGOs, fake donations or fake impact data in production.

## Technology constraints

Use **JavaScript only — no TypeScript**.

Recommended stack:
- React + Vite + React Router.
- Firebase Authentication.
- Cloud Firestore.
- Cloud Functions for Firebase in JavaScript for trusted server-side workflows.
- Firebase Cloud Messaging for web push notifications, with in-app notification fallback.
- Firebase App Check.
- MapLibre GL JS with a configurable tile/geocoding/routing provider.
- globe.gl / Three.js for the homepage globe.
- Vitest, React Testing Library, Firebase Emulator Suite and Playwright.
- Runtime validation (e.g. Zod) at client/server boundaries.

Use current stable compatible package versions. Keep external services behind small adapters. Never expose Firebase Admin credentials, service account keys, private API keys or secrets in browser code. Use `.env.example` with placeholder names only.

## Engineering rules

- First inspect the repository and existing files before changing anything.
- Preserve working code and conventions where reasonable. Do not blindly overwrite the repository.
- Build real functionality, not buttons that do nothing. If an external integration needs credentials, implement a clear adapter/configuration boundary and a safe local/emulator fallback; document exactly what remains to configure.
- Put trusted authorization, matching, radius expansion, acceptance locking, notification dispatch and audit writes in Cloud Functions or other trusted backend code, not only in the browser.
- Enforce authorization in Firestore/Storage rules as well as the UI.
- Validate and normalize all user input on the server.
- Use transactions/batched writes where consistency matters.
- Use server timestamps for authoritative events.
- Make scheduled matching/radius expansion idempotent. Prevent duplicate notifications and concurrent double-acceptance.
- Do not trust client-supplied role, verification state, capacity, distance, status, price or ownership.
- Do not store precise location publicly. Show approximate distance to authorized users and exact pickup details only to users who need them after acceptance.
- Keep logs free of passwords, tokens, private contact data and precise location unless strictly required and access-controlled.
- Add tests for business rules, permissions, matching, race conditions and critical user journeys.
- Keep code modular, readable and maintainable. Avoid unnecessary abstractions.
- Provide useful README setup instructions, `.env.example`, Firebase configuration, indexes, rules and deployment instructions.
- Never claim the app is production-ready if required secrets, provider accounts, verification operations, legal review or security checks are incomplete.

## Required output after each phase

At the end of each phase:
1. Summarize what was implemented.
2. List files created/changed.
3. Give exact install, emulator, test and build commands.
4. Report test/build results honestly.
5. List external configuration still needed.
6. List any known limitations and the next phase's starting point.

Now wait for the phase prompts. Do not start implementing until I provide Phase 1.

---

# B. Phase 1 — Foundation, design system and public landing page

Build the application foundation and complete the public-facing experience.

## Scope

1. Inspect the repository. Initialize or repair a React + Vite JavaScript application.
2. Set up routing, app layout, reusable components, global styles and a restrained design system.
3. Create a polished, responsive landing page with:
   - Minimal navigation: FoodBridge mark, Home, How it works, Impact, language selector and Sign in.
   - Hero headline: **“Good Food Deserves a Second Chance.”**
   - Short supporting copy explaining surplus-food redistribution.
   - Clear calls to action: “Donate food” and “Explore how it works”. For signed-out users, the donate action should route to sign-in/create-account rather than pretending to create a listing.
   - Interactive 3D Earth globe focused on Karnataka, with a restrained visual treatment, animated illustrative routes and moving delivery markers.
   - Globe zoom/rotation controls only if they remain simple. On zoom-out, hide small route/vehicle details; on zoom-in, reveal more detail.
   - Respect `prefers-reduced-motion`; lazy-load globe assets; show a static fallback if WebGL is unavailable.
   - Impact section with real-data zero states until backend data is connected. Do not invent metrics.
   - “How it works” in three steps: List food → Find a suitable recipient → Arrange pickup and confirm.
   - Concise explanation of the four recipient categories.
   - Clean footer with About, Contact, FAQs, Privacy and Terms placeholders clearly marked for project-owner completion.
4. Add English, Kannada and Hindi locale structure. Translate all static landing-page content and navigation. Language selection must work and persist.
5. Add accessible responsive navigation and reusable buttons, form controls, status badges, section headings, cards and empty states.
6. Add a small design-system document or code comments explaining spacing, typography, colors and component conventions.

## Visual direction

Use a clean, trustworthy, community-focused design. Prefer warm white/off-white surfaces, deep natural green as the main accent, neutral text and subtle borders. Avoid the generic “AI SaaS” look, purple/blue gradients, excessive rounded cards, glassmorphism, decorative clutter and unnecessary motion. The globe is the one visually prominent element; the rest of the page should stay calm.

## Completion criteria

- `npm run build` succeeds.
- Landing page works on mobile and desktop.
- Globe has a graceful fallback and does not block page loading.
- Language switching changes all visible static strings on the page.
- No fake impact values or dead-end primary buttons.
- Basic component and locale tests are added.

Do not implement authenticated dashboards or donation workflows yet.

---

# C. Phase 2 — Authentication, roles, organization onboarding and admin verification

Implement authentication and the role-specific onboarding foundation.

## Scope

1. Configure Firebase client initialization using environment variables and add `.env.example`.
2. Implement email/password authentication and a password-reset flow. If adding Google sign-in, make it optional and configure it cleanly.
3. Create account, sign-in, sign-out and protected-route flows with understandable validation and error messages.
4. After registration, let the user choose one or more applicable account roles:
   - Donor
   - Recipient organization
   - Delivery partner
   - Guest access is public browsing, not a registered operational role.
5. Implement recipient organization onboarding:
   - Organization name and category (human-food recipient, animal-food recipient, composting facility, biogas facility).
   - Contact person and verified contact channel.
   - Address and map pin.
   - Service radius/area.
   - Accepted food/material types.
   - Operating hours and availability.
   - Total capacity and current available additional capacity, with units.
   - Required proof/document uploads and admin review status.
6. Implement delivery partner onboarding with necessary profile/contact details, service area, transport mode/capacity and availability. Keep sensitive personal data private.
7. Implement donor profile onboarding with organization/business type, contact details and default pickup location.
8. Create a minimal admin-only verification screen to approve, reject with reason, or request more information from recipient organizations and delivery partners.
9. Store roles and verification state in trusted server-controlled fields. A user must not be able to self-assign admin or mark their own organization verified.
10. Add Firestore rules and Storage rules for profile and verification documents. Only authorized admins may access sensitive verification documents.
11. Add audit records for verification decisions.
12. Add role-aware account navigation and a simple profile/settings page.

## Security requirements

- Role and verification changes must be performed by trusted backend code.
- A pending or rejected recipient must not receive donation notifications or accept donations.
- A delivery partner must be verified before accepting real delivery requests.
- Never expose verification documents publicly.
- Add rate limiting/abuse protections where practical and document Firebase App Check setup.

## Completion criteria

- Auth flows work with Firebase Emulator Suite.
- Protected pages enforce roles.
- Rules tests prove users cannot elevate their roles or verification status.
- Admin verification is functional and auditable.
- All screens are responsive and translated into English, Kannada and Hindi.

Do not implement donation matching yet.

---

# D. Phase 3 — Food listing, suitability rules, recipient capacity and donor dashboard

Implement the donor workflow and the structured food/material model.

## Donor listing form

Create a clear, step-by-step form that avoids overwhelming users. Use conditional fields so only relevant questions appear.

Required fields:
- Food/material title and description.
- Quantity and unit (support kg and suitable units where necessary).
- Donor category and contact method.
- Pickup address/map pin.
- Available pickup window.
- Preparation/collection time where applicable.
- Safe-use/collection deadline.
- Storage and handling conditions.
- Food state/condition.
- Vegetarian/non-vegetarian where relevant.
- Allergens where relevant and known.
- Timestamped photo upload and donor declaration.
- Intended suitability selection: human consumption, animal feed, composting, biogas/organic processing. The UI must explain that final matching is controlled by platform eligibility rules.

## Suitability and safety model

Implement explicit server-side eligibility rules:
- Human consumption: only eligible when donor declarations and required time/storage/condition fields pass the configured rules. Do not imply that a declaration guarantees safety. Allow an admin-configurable policy and conservative defaults.
- Animal feed: only match to recipients that explicitly accept the material type and whose handling rules allow it. Do not assume all cooked food or scraps are safe for all animals.
- Composting: match only accepted organic material types.
- Biogas: match only material types the facility declares it can process.
- Expired, spoiled, contaminated, unknown or unsafe items must not be matched for human or animal consumption.
- Do not create a medical/food-safety certification feature. Display a clear “donor-declared information; recipient must inspect before acceptance/collection” notice.

## Recipient capability and capacity

Store each recipient's:
- Accepted recipient category/material types.
- Accepted food/material state.
- Maximum capacity and current committed capacity.
- **Available additional capacity = maximum capacity − currently committed capacity**, adjusted by any explicitly configured operational limit.
- Availability status and operating hours.

Capacity must be updated transactionally when a donation is accepted and released if the donation is cancelled/expired before collection. Avoid negative capacity and concurrent overbooking.

## Donor dashboard

Show only the useful essentials:
- “Create food listing” primary action.
- Active listings with clear statuses.
- Accepted recipient and distance when authorized.
- Delivery arrangement/status.
- Donation history.

Include edit/cancel rules. Once accepted or in transit, changes must use a controlled cancellation/request flow so the recipient and delivery partner are informed.

## Completion criteria

- Listing create/edit/cancel works.
- Uploads are private or appropriately access-controlled.
- Server-side validation and suitability tests exist.
- Capacity calculations are correct under concurrent updates.
- No recipient is matched solely because the donor clicked a category checkbox.
- Donor dashboard has loading, empty, error and success states.

---

# E. Phase 4 — Smart matching, radius expansion, notifications and recipient dashboard

Implement the core FoodBridge automation.

## Matching engine

Create trusted backend matching logic that:
1. Runs when a valid listing is published.
2. Finds verified, active recipients in the correct category.
3. Filters by accepted material types, food/material suitability, operating status, service area and available additional capacity.
4. Calculates distance using coordinates on the server or a trusted geospatial approach.
5. Ranks eligible recipients by distance and operational fit.
6. Starts with a configurable radius, default **1.5 km**.
7. Notifies eligible recipients in that radius.
8. If nobody accepts within the configurable waiting period, default **2 hours**, expands to **3 km**, then follows configurable further radius steps.
9. Notifies only newly eligible recipients at each expansion. Maintain a per-listing/per-recipient notification record to prevent duplicates.
10. Stops on acceptance, cancellation, expiry, admin suspension or other terminal status.

Do not run radius expansion from a browser timer. Use scheduled Cloud Functions or a reliable scheduled backend process. Make every scheduled action idempotent and safe to retry.

## Recipient notification

Implement:
- In-app notifications as the reliable baseline.
- Web push via Firebase Cloud Messaging where the user grants permission and the browser supports it.
- Clear permission explanation; do not ask on first page load.
- Notification preference controls.
- Notification content in the recipient's selected language.
- A notification should link to a concise donation detail page.

If push permission is unavailable, the in-app inbox must still work.

## Recipient dashboard

Keep the screen uncluttered. Main areas:
- Available donations.
- Accepted donations.
- Organization availability/capacity control.
- Donation history.

Each available donation card must clearly show:
- Food/material name and category.
- Quantity.
- Distance from recipient.
- Available additional capacity of the recipient.
- Deadline and pickup window.
- Relevant safety/handling facts.
- Accept and Decline actions.

Do not show more than the information needed to make a decision. Put secondary details behind “View details”.

## Acceptance and concurrency

- Use a Firestore transaction or trusted callable function to claim a single-recipient listing atomically.
- If two organizations attempt to accept simultaneously, exactly one succeeds and the other receives a clear “already accepted” result.
- On acceptance, update listing status, recipient capacity commitment and notification status consistently.
- Decline must not cancel a listing for everyone.
- Prevent an organization from accepting an expired, ineligible or already accepted listing.

## Completion criteria

- Unit/integration tests cover category filters, distance, capacity, radius expansion, duplicate prevention, expiry and concurrent acceptance.
- Emulator tests verify rules and function authorization.
- Notifications are not sent to unverified or ineligible organizations.
- Recipient dashboard works on mobile and desktop.
- No duplicate notifications after retries or scheduled-function re-execution.

---

# F. Phase 5 — Delivery partner workflow, cost agreement and confirmation

Implement transportation without introducing a payment wallet or complicated marketplace.

## Delivery options

After a recipient accepts a listing, donor and recipient can choose:
1. Direct pickup / self-arranged transport.
2. Request a delivery partner.

## Delivery request

A delivery request should contain:
- Pickup and drop-off locations (private to the assigned parties).
- Approximate distance.
- Food/material quantity and handling notes.
- Pickup deadline/window.
- Proposed total delivery amount.
- Donor contribution.
- Recipient contribution.
- Agreement state.

The two parties must agree to the amount and split before a delivery request is published to delivery partners. Validate that contributions add up to the agreed total. Do not create a payment wallet, escrow, payment gateway or bidding system in V1. Record the agreed amounts and mark them as “payable directly between parties” unless a later, separately approved payment integration is implemented.

## Delivery partner dashboard

Keep three primary views:
- Available deliveries.
- My active delivery.
- Delivery history.

Each request card shows the essential facts, estimated distance, handling requirements and agreed amount. Do not expose exact addresses to every delivery partner; reveal them only to the assigned partner after acceptance.

## Delivery lifecycle

Use explicit states, for example:
`requested → assigned → picked_up → delivered_pending_confirmation → completed`

Also support:
`cancelled`, `failed`, `disputed`.

Required confirmations:
- Delivery partner confirms pickup.
- Donor confirms handover when appropriate.
- Delivery partner marks arrival/delivery.
- Recipient confirms receipt.
- Completion occurs only after required confirmations are satisfied.

Add a safe exception path for a party that does not respond. Do not silently mark a donation completed based only on the delivery partner's claim. Admin can review a dispute and record an audited resolution.

## Location and privacy

- Operational map shows accurate pickup/drop-off only to authorized participants.
- Public globe/impact views use aggregated or anonymized route data.
- Do not continuously track a person's live location in V1. Show status updates and route estimate; optional live tracking is out of scope unless separately approved with explicit consent and retention rules.

## Completion criteria

- Direct pickup and delivery-partner paths work.
- Cost agreement validation works.
- Delivery status transitions are enforced server-side.
- Only assigned users can see exact delivery addresses.
- Tests cover cancellation, failed delivery, dispute and confirmation cases.

---

# G. Phase 6 — Multilingual polish, impact dashboard, globe data and admin operations

Complete the public experience and operational visibility using real application data.

## Multilingual support

Finish English, Kannada and Hindi for:
- All navigation and page content.
- Authentication and onboarding.
- Donation forms and validation.
- Recipient and delivery dashboards.
- Notifications and status messages.
- Empty/error/success states.
- Admin screens where practical.

Keep translation keys centralized. Persist language preference. Provide sensible fallback to English for missing translations and add a test that detects missing keys.

## Public impact dashboard

Calculate statistics from completed, verified donation records only:
- Total food/material quantity rescued (do not combine incompatible units without a clear conversion).
- Completed donations.
- Active verified recipient organizations.
- Estimated meals supported only if the project defines and documents a transparent calculation method. Otherwise omit this metric.

Do not publish names, phone numbers, exact addresses or sensitive donation details. Avoid double-counting cancelled, disputed or incomplete donations.

## Globe integration

Connect the homepage globe to safe aggregate data:
- Highlight Karnataka and, when configured, the pilot region around Tumakuru.
- Animate representative routes or aggregated activity lines.
- Do not expose exact private locations.
- Use a stable, performant number of markers.
- Respect reduced motion and provide a static/mobile fallback.
- Globe must not block homepage interaction or harm Core Web Vitals.

Use real operational data only after privacy filtering. If there is insufficient data, use clearly labelled illustrative routes only in development/demo mode.

## Admin operations

Create a minimal admin workspace for:
- Pending organization/partner verification.
- Active and completed listings.
- Failed/expired/cancelled listings.
- Delivery disputes/reports.
- User/organization suspension.
- Audit history.
- Basic operational metrics.

Avoid a giant analytics dashboard. Use searchable tables, filters and concise detail panels.

## Completion criteria

- Language switching is complete across the product.
- Impact values are computed from trusted records.
- Globe data is privacy-safe and performant.
- Admin actions are role-protected and audited.
- Add tests for impact aggregation and translation-key completeness.

---

# H. Phase 7 — Production hardening, testing, documentation and deployment

Perform a full production-readiness pass. Do not merely add a “production ready” label.

## Security and reliability audit

Review:
- Firestore rules and indexes.
- Storage rules and upload limits/content types.
- Authentication and role escalation.
- Admin authorization.
- Organization verification.
- Function authorization and input validation.
- Rate limiting/abuse controls.
- App Check.
- Secrets and environment configuration.
- Notification idempotency.
- Scheduled-function retries.
- Concurrent acceptance and capacity updates.
- Private location and document access.
- XSS, unsafe rendering and dependency vulnerabilities.
- Error handling and logging.
- Data retention and account deletion/export requirements.

Fix discovered issues and add regression tests.

## Test suite

Add/complete:
- Unit tests for suitability and matching rules.
- Firestore rules tests.
- Cloud Function integration tests using emulators.
- Concurrent acceptance/capacity tests.
- Notification duplicate/retry tests.
- Playwright end-to-end tests for:
  1. Donor registers and creates a listing.
  2. Eligible recipient receives and accepts it.
  3. Ineligible/unverified recipient cannot accept it.
  4. Radius expands after the waiting period.
  5. Delivery partner accepts and completes a delivery.
  6. Recipient confirms receipt.
  7. Admin verifies an organization.
  8. Language switching works.
- Accessibility checks on primary journeys.
- Responsive checks for common mobile and desktop viewports.

## Deployment and operations

Provide:
- `.env.example` with placeholders only.
- Firebase project setup instructions.
- Firebase Hosting configuration.
- Cloud Functions deployment instructions.
- Firestore indexes and rules deployment instructions.
- Storage rules deployment instructions.
- FCM web-push setup instructions, including VAPID key configuration.
- Map tile/geocoding/routing provider setup and usage/terms warning.
- Admin bootstrap instructions that do not allow public self-promotion.
- Emulator setup and seed-data instructions for development only.
- Backup/export and restore guidance.
- Monitoring/error alert guidance.
- Rollback instructions.
- A pre-launch checklist and controlled pilot plan.

## Final acceptance criteria

- Clean install works from documented steps.
- Lint, unit tests, emulator tests and production build pass.
- No secrets or real personal data are committed.
- No production demo data or fabricated statistics.
- Firestore/Storage rules are not permissive.
- Every primary button works or is clearly disabled with an explanation.
- All critical user journeys are tested.
- README accurately distinguishes working features from provider setup and operational tasks still required.
- Report remaining risks honestly. Do not claim legal or food-safety compliance without qualified review.

At the end, provide a concise release report: implemented scope, commands run and results, known limitations, configuration still required, and recommended pilot steps.
