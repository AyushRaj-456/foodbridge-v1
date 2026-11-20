# FoodBridge — Project Blueprint

FoodBridge is a community food redistribution platform that helps surplus-food donors connect with suitable, nearby recipients and arrange reliable transportation.

This pack contains the product requirements, architecture, data model, workflows, UI guidance, security rules, testing/deployment guidance, and a phased set of implementation prompts for Gemini.

## Product goal

Reduce avoidable food waste by routing each listed surplus item to an appropriate destination:

1. **Human-food recipients** — verified NGOs, orphanages, shelters and similar organizations.
2. **Animal-food recipients** — verified cattle farms, animal shelters and other eligible animal-care organizations.
3. **Composting facilities** — facilities that accept suitable organic material.
4. **Biogas facilities** — facilities that accept suitable organic material for processing.

FoodBridge must not assume that all surplus food is suitable for human or animal consumption. Matching must consider food condition, preparation time, storage, expiry/safe-use deadline, recipient capabilities and applicable safety rules. When suitability is uncertain, the system must not recommend the item for consumption.

## V1 product principles

- Keep the interface clean, calm, minimal and easy to explain to a first-time user.
- Keep the core workflow short: **List → Match → Accept → Arrange pickup → Confirm delivery**.
- Let the system do the matching; users should not have to browse long lists of organizations.
- Display distance and available additional capacity clearly wherever recipients are shown.
- Avoid feature bloat. Do not add chat, ratings, wallets, bidding, AI chatbots, leaderboards or prediction features in V1.
- The public homepage includes an interactive 3D globe focused on Karnataka, plus real impact statistics.
- The operational map and route tracking must use accurate map coordinates; the decorative globe is not the source of truth for delivery navigation.
- English, Kannada and Hindi are the initial interface languages.
- Use JavaScript, not TypeScript.

## Recommended implementation stack

This blueprint chooses a practical JavaScript-first stack:

- **Frontend:** React + Vite, JavaScript, React Router.
- **Styling:** CSS Modules or a small, consistent global design system. Avoid a large UI component dependency unless needed.
- **Backend/platform:** Firebase Authentication, Cloud Firestore, Cloud Functions for Firebase (JavaScript), Firebase Cloud Messaging, Firebase App Check.
- **Hosting:** Firebase Hosting (or another static host if the team has a reason).
- **Maps:** MapLibre GL JS with a suitable tile/geocoding/routing provider. Keep provider keys and terms in mind; do not assume every tile or routing service is free for production.
- **Globe:** globe.gl / Three.js for the public homepage visualization. Lazy-load it and provide a reduced-motion/static fallback.
- **Testing:** Vitest + React Testing Library; Firebase Emulator Suite for backend/rules integration; Playwright for critical end-to-end journeys.
- **Validation:** Zod or equivalent runtime validation in JavaScript at all client/server boundaries.

The stack is a recommendation, not a requirement to use paid services. Keep external map, geocoding, email and SMS providers behind adapters so they can be changed later.

## Repository structure target

```text
foodbridge/
├── README.md
├── prompt.md
├── docs/
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── WORKFLOWS.md
│   ├── UI_UX.md
│   ├── SECURITY_PRIVACY.md
│   ├── DEPLOYMENT.md
│   ├── TESTING.md
│   ├── OPERATIONS.md
│   └── DECISIONS.md
├── public/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── hooks/
│   ├── lib/
│   ├── locales/
│   ├── pages/
│   ├── styles/
│   └── main.jsx
├── functions/
├── tests/
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── .env.example
└── package.json
```

## How to use this pack

1. Read `docs/PRODUCT_REQUIREMENTS.md` and `docs/DECISIONS.md`.
2. Open `prompt.md`.
3. Give Gemini the **Project Context / Rules** section first.
4. Run the seven phases in order, in the same Gemini coding workspace/repository.
5. After each phase, ask Gemini to run the listed checks and report changed files, commands and remaining issues.
6. Do not deploy with demo credentials, permissive Firestore rules, placeholder verification or fake impact numbers.
7. Before a real pilot, have local food-safety and legal requirements reviewed by the responsible college/community authority.

## Important production note

“Production-ready” is not achieved by generating code alone. Before public launch, configure Firebase projects and secrets, verify organizations, test security rules, configure backups/monitoring, validate map-provider terms, conduct real-device testing, and complete a controlled pilot. The prompts explicitly require Gemini to distinguish implemented functionality from configuration still required by the project owner.
