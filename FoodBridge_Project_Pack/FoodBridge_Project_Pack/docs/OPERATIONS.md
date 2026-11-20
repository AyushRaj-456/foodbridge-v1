# Operational Playbook

## 1. Roles that must be staffed

A real pilot needs people responsible for:
- Reviewing recipient organization applications.
- Reviewing delivery partner applications.
- Responding to unsafe/incorrect listings.
- Handling delivery disputes and cancellations.
- Updating recipient availability and capacity policies.
- Reviewing service health and failed scheduled jobs.

Automation does not replace organization verification or safety escalation.

## 2. Pilot recommendation

Start with a limited geographic area and a small number of verified donors and recipients. Confirm that each recipient category has a real partner capable of receiving the relevant material. Test the complete process with supervised, low-risk listings before widening the radius or publicizing the platform.

## 3. Operational configuration

Make these values configurable:
- initial matching radius (default 1.5 km)
- radius expansion steps (example 3 km, then further)
- waiting period before expansion (default 2 hours)
- maximum matching radius
- listing expiry/safe-use deadline rules
- allowed material categories
- capacity unit and capacity accounting policy
- notification retry policy

## 4. Incident handling

For unsafe or misleading listings:
1. Place listing on hold.
2. Stop further notifications.
3. Notify already matched parties where necessary.
4. Record reason and actor.
5. Review and resolve.

For delivery disputes:
1. Freeze automatic completion.
2. Collect event history and statements from parties.
3. Admin reviews evidence.
4. Record an audited resolution.

## 5. Monitoring

Monitor:
- Cloud Function errors and retries.
- Scheduled matching jobs that fail or run late.
- Notification dispatch failures.
- Acceptance transaction conflicts.
- Capacity inconsistencies.
- Storage upload failures.
- Authentication abuse.
- Firestore usage and map provider usage/cost.

Set alerts for repeated failures and define an owner for each alert.

## 6. Service boundaries

FoodBridge coordinates donations. It does not guarantee food safety, recipient conduct, delivery performance or direct payments between parties. Product copy and operating procedures must communicate the actual responsibilities accurately.
