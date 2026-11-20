# FoodBridge Design System Guide

FoodBridge is designed as a calm, accessible, and dependable community utility—not a commercial SaaS or marketing showcase. Its visual language reflects trust, civic cooperation, and food dignity.

---

## 1. Core Principles

- **Dignity & Restraint:** Generous whitespace, calm earth tones, and no unnecessary decorative distractions or noisy animations.
- **One Primary Action:** Every view guides the user toward a single primary intent without visual competition.
- **Zero Plan/Pricing Language:** Absolutely no commercial SaaS terms (`Pro`, `Free`, `Tier`, `Upgrade`, `Pricing`).
- **Inclusive Accessibility:** Built for diverse devices, screen sizes, lighting conditions, and languages (English, Kannada, Hindi).

---

## 2. Color Palette

### Brand Green (Natural, Foliage, Civic)
- `brand-950`: `#0B2218` — Deepest text / high contrast
- `brand-900`: `#143628` — Headings, prominent accents
- `brand-800`: `#1B4332` — Primary buttons, active brand elements
- `brand-700`: `#2D6A4F` — Interactive hover states
- `brand-600`: `#40916C` — Secondary focus / links
- `brand-500`: `#52B788` — Indicators / accents
- `brand-100`: `#D8F3DC` — Soft badge backgrounds
- `brand-50`: `#F0F9F5` — Light tint / highlighted cards

### Surfaces & Backgrounds
- `surface-DEFAULT`: `#FAFAF7` — Warm off-white background (softer than sterile #FFFFFF)
- `surface-card`: `#FFFFFF` — Elevated containers & cards
- `surface-muted`: `#F3F4F0` — Table headers, secondary segments, inactive pills
- `surface-subtle`: `#EEF0EB` — Dividers and subtle panel backdrops

### Neutrals & Text
- `neutral-900`: `#191C1A` — Primary body copy (high readability WCAG AAA)
- `neutral-700`: `#3F4943` — Supporting descriptions and subtitles
- `neutral-500`: `#6F7972` — Timestamps, metadata, placeholder text
- `neutral-300`: `#C2C8C1` — Borders and inactive controls
- `neutral-200`: `#E1E4DF` — Subtle separation lines

### Status Tones (Functional, Muted)
- **Safe / Active:** `#2D6A4F` (Forest Green)
- **Pending / In Review:** `#B45309` (Warm Amber)
- **Critical / Expired:** `#B91C1C` (Subdued Crimson)
- **Information:** `#0369A1` (Deep Cerulean)

---

## 3. Typography & Spacing

- **Primary Font Family:** System sans-serif stack (`Inter`, system-ui, -apple-system, Segoe UI, Roboto, sans-serif) for optimal rendering across multilingual scripts (Kannada, Devanagari, Latin).
- **Scale:**
  - Display / Hero: `text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight`
  - Section Headings: `text-2xl md:text-3xl font-bold tracking-tight`
  - Subheadings / Card Titles: `text-lg font-semibold`
  - Body: `text-base leading-relaxed`
  - Small / Metadata: `text-sm font-medium`
  - Micro / Badges: `text-xs font-semibold uppercase tracking-wider`
- **Spacing Units:** 4px grid (`p-2`, `p-3`, `p-4`, `p-6`, `p-8`, `p-12`). Standard card padding is `p-5` or `p-6`.

---

## 4. Component Conventions

1. **Buttons:**
   - `primary`: Solid `#1B4332`, hover `#2D6A4F`, text white, rounded-md or rounded-lg.
   - `secondary`: Neutral outline with subtle background on hover.
   - `ghost`: Transparent with text color hover.
   - Disabled states must have `opacity-50 cursor-not-allowed` and `aria-disabled="true"`.

2. **Badges / Status Pills:**
   - Rounded-full, compact padding (`px-2.5 py-0.5 text-xs`), with distinct category styles (Human, Animal, Compost, Biogas).

3. **Section Headings:**
   - Consistent semantic layout: optional small uppercase overline, primary heading (`h2`), and concise subtitle (`p`).

4. **Empty & Loading States:**
   - Always accompany missing data or initial states with an icon, explanatory heading, and clear next step or zero-state assurance. Never display raw empty white space.

5. **Motion & Transitions:**
   - Fast, subtle micro-interactions (`duration-150` or `duration-200`).
   - Automatically disabled when `prefers-reduced-motion` is detected.
