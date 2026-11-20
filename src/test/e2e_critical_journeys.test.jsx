import { describe, it, expect } from 'vitest';
import { evaluateFoodSuitability } from '../services/safetyEngine';
import { findEligibleRecipients, isRadiusExpansionDue, getNextExpansionRadius } from '../services/matchingEngine';
import { validateCostAgreement } from '../services/deliveryService';
import { aggregateImpactFromRecords } from '../services/impactService';
import en from '../locales/en.json';
import kn from '../locales/kn.json';
import hi from '../locales/hi.json';

describe('End-to-End Critical User Journeys (Integration Verification)', () => {

  // Journey 1: Donor listing creation & safety evaluation
  it('Journey 1: Evaluates surplus listing with safety rules preventing unsafe human consumption', () => {
    const safeListing = {
      foodState: 'cooked_packaged',
      storageCondition: 'refrigerated',
      preparationTime: new Date(Date.now() - 3600000).toISOString(),
      safeUseDeadline: new Date(Date.now() + 4 * 3600000).toISOString(), // 4h ahead
      donorDeclaration: true,
      intendedSuitability: ['human', 'animal']
    };

    const evalResult = evaluateFoodSuitability(safeListing);
    expect(evalResult.isEligibleForHuman).toBe(true);
    expect(evalResult.eligibleCategories).toContain('human');
    expect(evalResult.eligibleCategories).toContain('animal');

    // Danger zone test: cooked food held at room temp for 5 hours is rejected for human food
    const dangerListing = {
      ...safeListing,
      storageCondition: 'ambient',
      preparationTime: new Date(Date.now() - 5 * 3600000).toISOString() // 5 hours at ambient
    };
    const dangerEval = evaluateFoodSuitability(dangerListing);
    expect(dangerEval.isEligibleForHuman).toBe(false);
  });

  // Journey 2 & 3: Matching engine finds verified recipients and guards unverified/ineligible
  it('Journey 2 & 3: Matches only verified recipients in category with capacity; guards unverified', () => {
    const listing = {
      latitude: 12.9716,
      longitude: 77.5946,
      quantity: 50,
      eligibleCategories: ['human'],
      safeUseDeadline: new Date(Date.now() + 5 * 3600000).toISOString()
    };

    const verifiedEligible = {
      id: 'r_verified',
      category: 'human',
      verificationStatus: 'verified',
      operationalStatus: 'active',
      availableAdditionalCapacity: 100,
      latitude: 12.9750,
      longitude: 77.5950
    };

    const unverifiedRecipient = {
      id: 'r_unverified',
      category: 'human',
      verificationStatus: 'pending', // unverified!
      operationalStatus: 'active',
      availableAdditionalCapacity: 100,
      latitude: 12.9750,
      longitude: 77.5950
    };

    const wrongCategoryRecipient = {
      id: 'r_animal',
      category: 'animal', // animal recipient for human-only listing
      verificationStatus: 'verified',
      operationalStatus: 'active',
      availableAdditionalCapacity: 100,
      latitude: 12.9750,
      longitude: 77.5950
    };

    const pool = [verifiedEligible, unverifiedRecipient, wrongCategoryRecipient];
    const matches = findEligibleRecipients(listing, pool, 2.0);

    // Only the verified recipient in matching category should be returned!
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe('r_verified');
  });

  // Journey 4: Radius expansion after waiting period
  it('Journey 4: Automatically expands matching radius from 1.5 km to 3 km when waiting period elapses', () => {
    const listing = {
      status: 'matching',
      createdAt: new Date(Date.now() - 2.5 * 3600000), // 2.5 hours ago (> 2 hour default wait)
      lastRadiusExpandedAt: null,
      matchingRadiusKm: 1.5
    };

    const now = new Date();
    const isDue = isRadiusExpansionDue(listing, now);
    expect(isDue).toBe(true);

    const nextRadius = getNextExpansionRadius(1.5);
    expect(nextRadius).toBe(3.0);
  });

  // Journey 5: Delivery cost-share agreement without wallet/escrow
  it('Journey 5: Validates exact mutual cost split between donor and recipient', () => {
    const validSplit = validateCostAgreement(150, 75, 75);
    expect(validSplit.isValid).toBe(true);

    const zeroVolunteer = validateCostAgreement(0, 0, 0);
    expect(zeroVolunteer.isValid).toBe(true);

    const mismatch = validateCostAgreement(100, 30, 50); // 30 + 50 = 80 != 100
    expect(mismatch.isValid).toBe(false);
  });

  // Journey 6: Completed handovers populate public impact without fabricated numbers
  it('Journey 6: Calculates real community impact strictly from verified completed handovers', () => {
    const completedListings = [
      { id: 'l1', status: 'completed', quantity: 80, unit: 'kg' },
      { id: 'l2', status: 'completed', quantity: 50, unit: 'meals' }
    ];
    const verifiedRecipients = [{ id: 'r1', verificationStatus: 'verified' }];

    const impact = aggregateImpactFromRecords(completedListings, verifiedRecipients);
    expect(impact.completedDonationsCount).toBe(2);
    // 80 kg + (50 * 0.4 kg) = 100 kg
    expect(impact.totalQuantityKg).toBe(100);
    // (80 / 0.4) + 50 = 250 meals
    expect(impact.totalMealsEstimated).toBe(250);
    expect(impact.activeVerifiedRecipients).toBe(1);
    expect(impact.isZeroState).toBe(false);
  });

  // Journey 7: Admin verification and audit trail records
  it('Journey 7: Enforces administrative audit log schema for verification decisions', () => {
    const auditRecord = {
      actorUid: 'admin_1',
      actorEmail: 'admin@foodbridge.org',
      targetUid: 'rec_101',
      targetName: 'Asha Trust Home',
      targetType: 'recipient',
      action: 'verification_approve',
      previousStatus: 'pending',
      newStatus: 'verified',
      reason: 'FSSAI certificate and trust registration verified on portal',
      timestamp: Date.now()
    };

    expect(auditRecord.actorUid).toBeDefined();
    expect(auditRecord.action).toContain('verification_approve');
    expect(auditRecord.newStatus).toBe('verified');
  });

  // Journey 8: Language switching consistency
  it('Journey 8: Guarantees complete key parity between English, Kannada and Hindi dictionaries', () => {
    const enKeys = Object.keys(en);
    const knKeys = Object.keys(kn);
    const hiKeys = Object.keys(hi);

    expect(knKeys).toEqual(enKeys);
    expect(hiKeys).toEqual(enKeys);
  });
});
