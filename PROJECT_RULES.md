# FoodBridge — Non-Negotiable Core Project Rules

This document establishes the governing rules for the architecture, business logic, user interface, and deployment of **FoodBridge**. These rules apply to all phases of development, design, and documentation.

---

## 1. Zero-Cost Development & Deployment Rules

1. **Strictly Zero Paid Services & Zero Billing:**
   - Never use any paid APIs, subscriptions, paid SDKs, premium services, or services that require entering payment or credit card details.
   - Do not activate paid plans, enable billing, or configure services that can automatically accrue charges.
   - All development and testing must run locally using free and open-source tools (e.g., Firebase Local Emulator Suite) requiring zero external accounts or cards.
   - In production, utilize strictly free tiers (e.g., Firebase Spark Plan, Vercel Hobby, GitHub Pages) without entering billing info.

2. **No Paid Maps or Proprietary Geocoding:**
   - **Never** use Google Maps Platform, Google Places API, or Mapbox paid tokens.
   - Operational maps must use **MapLibre GL JS** (FOSS) paired with free OpenStreetMap/CARTO Voyager tile providers.
   - Geocoding and reverse geocoding must use free open-source services (e.g., Photon by Komoot or OSM Nominatim) with client-side caching and debouncing.
   - Distances and radii must be calculated using direct client/server mathematical formulas (Haversine) without external API costs.

3. **No Paid AI APIs:**
   - Do not introduce paid AI/LLM APIs (OpenAI, Gemini API billing, etc.).
   - Classification, safety checks, and matching must be driven by deterministic, transparent, and auditable rule engines.

4. **Zero-Cost Notifications:**
   - Use standard browser Web Notifications API and real-time Firestore listeners for instant in-app alerts. Web push via FCM is optional on the free tier.

5. **Resource Quotas & Graceful Handling:**
   - Respect Firestore free limits (50k reads/day, 20k writes/day, 1 GiB storage).
   - Optimize queries, use local state caching, and compress uploaded images client-side before storage.
   - Handle quota edge cases gracefully with clear, honest status messages.

---

## 2. UI/UX Rules: Unified Community Platform (No SaaS / No Plans)

1. **Absolute Ban on Plan and Billing Terminology:**
   - **Never** mention plan names, pricing tiers, subscriptions, premium features, upgrades, or billing terms anywhere in the application.
   - **Forbidden labels:** `Free`, `Basic`, `Pro`, `Premium`, `Enterprise`, `Upgrade`, `Trial`, `Pricing`, `Subscription`, `Billing`, `Tier`.
   - The application is a unified, public-benefit community platform for food redistribution—not a commercial SaaS product.

2. **Equal, Role-Specific Access Without Artificial Restrictions:**
   - Every registered user has full access to the features necessary for their role (Guest, Donor, Recipient, Delivery Partner, Admin).
   - No feature gating, lock icons on features, promotional banners, or upgrade prompts.

3. **Clean, Minimal, Calm Design:**
   - Avoid clutter, oversized dashboard cards, loud gradients, excessive colors, and unnecessary animations.
   - One primary action per screen.
   - Generous whitespace, readable typography, and calm, accessible colors (green/neutral palette).

4. **Information Relevance & Privacy:**
   - Show only information and actions strictly relevant to the active user's role.
   - Exact pickup addresses are kept private and revealed only after an eligible recipient accepts a listing.
   - Public landing page shows aggregated, verified impact totals only.

5. **Comprehensive Accessibility & States:**
   - Responsive layouts across mobile, tablet, and desktop.
   - Keyboard accessible navigation, visible focus indicators, and WCAG AA contrast.
   - Dedicated, thoughtful UI states for every view: **Loading**, **Empty State**, **Error**, **Success**, and **Permission Denied / Offline**.
   - Trilingual support: English, Kannada, and Hindi.

---

## 3. Product & Operational Integrity Rules

1. **Recipient Category Segregation:**
   - Human food, animal feed, composting, and biogas facilities have strictly separated eligibility rules.
   - Questionable or expired food must never be matched to human or animal recipients.
2. **Atomic Listing Claiming:**
   - Single-claim listings must be locked atomically so concurrent claims cannot result in double-allocation.
3. **Capacity Transparency:**
   - Recipient capacity displayed is always **available additional capacity** (how much more can be taken now), not just total facility capacity.
