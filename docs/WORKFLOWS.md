# Core Workflows and State Machines

## 1. Donation lifecycle

```text
draft
  └── publish → matching
                   ├── recipient accepts → accepted
                   │                          ├── direct pickup → awaiting_handover
                   │                          └── delivery requested → delivery_requested
                   │                                                   └── assigned → in_transit
                   │                                                                  └── delivered_pending_confirmation
                   │                                                                           └── completed
                   ├── no recipient before deadline → unmatched / expired
                   ├── donor cancels → cancelled
                   └── admin suspends → on_hold
```

The exact states should be implemented as enums and transitions validated by trusted backend functions. Do not let the client set arbitrary statuses.

## 2. Matching and radius expansion

Default configurable values:
- Initial radius: 1.5 km.
- First wait: 2 hours.
- Next example radius: 3 km.
- Further radius steps: configured by admin/project owner.
- Listing deadline: based on donor-provided safe-use/collection deadline and policy.

Algorithm:
1. Listing is published and validated.
2. Backend computes eligible recipient categories.
3. Query candidates in current radius.
4. Exact distance is calculated server-side.
5. Filter recipients by verification, availability, accepted material, operating hours and capacity.
6. Create one notification record per listing/recipient/radius cycle using a dedupe key.
7. Dispatch in-app notification; attempt push if enabled.
8. Schedule the next expansion.
9. At expansion time, re-check listing status/deadline and re-run matching.
10. Notify only recipients not already notified for that listing.
11. Stop on acceptance, cancellation, expiry or administrative hold.

## 3. Acceptance transaction

Within one trusted transaction:
- Read listing and verify status is `matching`.
- Verify listing has not expired.
- Read recipient and verify approved/active.
- Re-check eligibility and available capacity.
- Create capacity reservation.
- Increase committed capacity.
- Set accepted recipient and listing status.
- Cancel future matching jobs logically.
- Write donation event and notification updates.

If any check fails, no partial write should occur.

## 4. Recipient decline

Declining means “this organization does not want this listing.” It must not cancel the listing for other recipients. Record the decline and do not re-notify that organization for the same listing unless an explicit new matching cycle policy permits it.

## 5. Delivery cost agreement

1. Donor and recipient select delivery-partner option.
2. One party proposes total delivery amount and contribution split.
3. Both parties explicitly confirm the same values.
4. Validate donor contribution + recipient contribution = agreed total.
5. Publish delivery request to eligible verified partners.
6. No wallet or payment processing is included in V1; parties settle directly.

## 6. Delivery state

```text
requested → assigned → picked_up → delivered_pending_confirmation → completed
     ├── cancelled
     └── failed / disputed → admin_review → resolved
```

Use server-side transition validation and event history. Exact addresses are visible only to assigned participants.

## 7. Capacity accounting

Available additional capacity is:

`availableCapacity = maxCapacity - committedCapacity`

On acceptance, reserve the listing quantity transactionally. On valid cancellation/expiry before handover, release reservation. On completion, convert reservation to consumed/fulfilled according to the organization's capacity policy. Document whether capacity represents daily intake, per-pickup load or current storage capacity; do not mix these meanings.

## 8. Food suitability guardrails

- Human consumption requires configured time, condition and handling criteria.
- Animal-feed eligibility must be recipient-specific; different animals have different dietary needs.
- Composting and biogas eligibility must use facility-declared accepted material types.
- Unknown, spoiled, contaminated or expired food must not be routed to people or animals.
- A recipient must inspect the item at handover and may reject it if it does not match the listing.
- Local food-safety and waste-handling requirements must be reviewed before pilot launch.
