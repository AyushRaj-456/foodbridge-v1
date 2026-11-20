# Product and Technical Decisions

This document records the V1 decisions so implementation does not drift.

| Topic | V1 decision |
|---|---|
| Product focus | Surplus food/material matching and delivery coordination |
| Initial geography | Karnataka-focused experience; pilot region configurable (e.g. Tumakuru) |
| Recipient categories | Human-food recipients, animal-food recipients, composting facilities, biogas facilities |
| Matching | Backend-driven eligibility and distance matching |
| Initial radius | 1.5 km, configurable |
| Expansion wait | 2 hours, configurable |
| Example next radius | 3 km, configurable |
| Listing acceptance | One recipient per listing in V1 |
| Capacity | Show available additional capacity, not total capacity alone |
| Notifications | In-app required; web push optional |
| Delivery | Direct pickup or verified delivery partner |
| Delivery costs | Donor and recipient agree contributions; recorded in app; direct settlement in V1 |
| Payment gateway | Out of scope |
| Live tracking | Out of scope |
| Languages | English, Kannada, Hindi |
| Public visualization | Interactive 3D globe highlighting Karnataka |
| Operational routing | Conventional map, separate from decorative globe |
| Public statistics | Verified completed records only |
| Frontend | React + Vite + JavaScript |
| Backend | Firebase Auth, Firestore, Cloud Functions, Storage, FCM |
| TypeScript | Do not use |
| UI style | Minimal, accessible, calm, green/neutral, low clutter |
| AI features | No chatbot or prediction features in V1 |

## Open configuration decisions before pilot

These are operational choices, not reasons to expand V1:
- Exact food-safety eligibility thresholds and local policy.
- Which food/material types each recipient category accepts.
- Whether capacity is daily intake, per-pickup load or current storage capacity.
- Maximum radius and later expansion intervals.
- Exact map/geocoding/routing provider.
- Admin verification evidence and review process.
- Donation record retention period.
- Local privacy, food-safety and waste-handling policy review.
