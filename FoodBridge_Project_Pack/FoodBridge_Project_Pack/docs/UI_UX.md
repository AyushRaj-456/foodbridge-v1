# UI/UX Guidelines

## 1. Design objective

The product should feel like a clear community utility, not a crowded admin template or generic AI-generated SaaS dashboard. A first-time user should understand the next action without training.

## 2. Visual system

- Primary accent: natural/deep green.
- Background: warm white or very light neutral.
- Text: dark charcoal with muted secondary text.
- Borders: subtle neutral.
- Use one consistent spacing scale and typography hierarchy.
- Use color meaningfully: green for success/available, amber for pending/attention, red for errors/unsafe/expired.
- Avoid purple/blue gradients, excessive shadows, glass effects, decorative blobs and too many card styles.
- Prefer whitespace and alignment over extra borders.

## 3. Public landing page

Order:
1. Header: logo, Home, How it works, Impact, language selector, Sign in.
2. Hero: “Good Food Deserves a Second Chance.”, concise explanation, Donate food and Explore actions.
3. Interactive globe: Karnataka focus, illustrative routes, accessible fallback.
4. Impact: verified totals only.
5. How it works: List → Match → Deliver.
6. Recipient categories: human, animal, composting, biogas.
7. Footer: About, Contact, FAQs, Privacy, Terms.

## 4. Dashboard navigation

Use a small role-aware navigation:
- Donor: Overview, My listings, Create listing, History, Profile.
- Recipient: Available donations, Accepted donations, Capacity, History, Profile.
- Delivery partner: Available deliveries, Active delivery, History, Profile.
- Admin: Verification, Listings, Deliveries/issues, Audit.

Do not show irrelevant role navigation.

## 5. Recipient donation card

The card should make the decision easy. Display:
- Food/material name and quantity.
- Distance.
- Available additional capacity.
- Deadline and pickup window.
- One or two relevant handling/suitability labels.
- Primary Accept and secondary Decline actions.
- Secondary details hidden behind “View details”.

Avoid placing every database field on the card.

## 6. Listing form

Use a short multi-step form with progress indication:
1. What is available?
2. Quantity and timing.
3. Suitability and handling.
4. Pickup location and photo.
5. Review and publish.

Show conditional fields only when relevant. Explain unfamiliar terms in short helper text. Preserve entered data if the user navigates back.

## 7. States

Every major screen must include:
- Loading state.
- Empty state with one clear next action.
- Error state with actionable recovery.
- Success confirmation.
- Offline/network failure state where relevant.
- Permission-denied state.

## 8. Accessibility and responsive design

- Semantic headings and landmarks.
- Keyboard-operable menus, dialogs and forms.
- Visible focus indicators.
- Proper labels and validation summaries.
- Sufficient contrast.
- Do not communicate status by color alone.
- Respect reduced-motion settings.
- Ensure globe is not required to complete any task.
- Mobile-first layout with touch targets of practical size.

## 9. Localization

Use translation keys, not hard-coded strings. Format dates, times, quantities and currency appropriately. Do not translate user-entered names or addresses. Keep Kannada and Hindi strings reviewed for clarity before a live pilot.
