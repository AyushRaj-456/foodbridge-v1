import { describe, it, expect } from 'vitest';
import {
  aggregateImpactFromRecords,
  STANDARD_MEAL_KG,
  GHG_FACTOR_PER_KG,
  IMPACT_CALCULATION_METHOD
} from '../services/impactService';

describe('Public Impact Aggregation Service', () => {
  it('returns zero state when no records exist', () => {
    const impact = aggregateImpactFromRecords([], []);
    expect(impact.completedDonationsCount).toBe(0);
    expect(impact.totalQuantityKg).toBe(0);
    expect(impact.totalMealsEstimated).toBe(0);
    expect(impact.activeVerifiedRecipients).toBe(0);
    expect(impact.ghgEmissionsAvoidedKg).toBe(0);
    expect(impact.isZeroState).toBe(true);
    expect(impact.calculationMethod).toBe(IMPACT_CALCULATION_METHOD);
  });

  it('calculates metrics accurately for completed kg listings', () => {
    const listings = [
      { id: '1', status: 'completed', quantity: 100, unit: 'kg' },
      { id: '2', status: 'completed', quantity: 40, unit: 'kg' }
    ];
    const recipients = [{ id: 'r1', verificationStatus: 'verified' }];

    const impact = aggregateImpactFromRecords(listings, recipients);

    expect(impact.completedDonationsCount).toBe(2);
    expect(impact.totalQuantityKg).toBe(140);
    // 140 kg / 0.4 = 350 meals
    expect(impact.totalMealsEstimated).toBe(350);
    // 140 kg * 2.5 = 350 kg CO2e
    expect(impact.ghgEmissionsAvoidedKg).toBe(350);
    expect(impact.activeVerifiedRecipients).toBe(1);
    expect(impact.isZeroState).toBe(false);
  });

  it('calculates metrics accurately for completed meal units', () => {
    const listings = [
      { id: '1', status: 'completed', quantity: 100, unit: 'meals' }
    ];

    const impact = aggregateImpactFromRecords(listings, []);

    expect(impact.completedDonationsCount).toBe(1);
    // 100 meals * 0.4 = 40 kg
    expect(impact.totalQuantityKg).toBe(40);
    expect(impact.totalMealsEstimated).toBe(100);
    // 40 kg * 2.5 = 100 kg CO2e
    expect(impact.ghgEmissionsAvoidedKg).toBe(100);
  });

  it('accurately converts mixed units (kg, meals, liters) without double-counting', () => {
    const listings = [
      { id: '1', status: 'completed', quantity: 20, unit: 'kg' }, // 20 kg = 50 meals
      { id: '2', status: 'completed', quantity: 50, unit: 'meals' }, // 50 meals = 20 kg
      { id: '3', status: 'completed', quantity: 10, unit: 'liters' } // 10 L = 10 kg = 25 meals
    ];

    const impact = aggregateImpactFromRecords(listings, []);

    expect(impact.completedDonationsCount).toBe(3);
    // 20 + 20 + 10 = 50 kg
    expect(impact.totalQuantityKg).toBe(50);
    // 50 + 50 + 25 = 125 meals
    expect(impact.totalMealsEstimated).toBe(125);
    // 50 kg * 2.5 = 125 kg CO2e
    expect(impact.ghgEmissionsAvoidedKg).toBe(125);
  });

  it('strictly excludes cancelled, disputed, failed, in_transit, or matching donations', () => {
    const mixedListings = [
      { id: '1', status: 'completed', quantity: 50, unit: 'kg' },
      { id: '2', status: 'cancelled', quantity: 500, unit: 'kg' },
      { id: '3', status: 'disputed', quantity: 200, unit: 'kg' },
      { id: '4', status: 'failed', quantity: 150, unit: 'kg' },
      { id: '5', status: 'matching', quantity: 80, unit: 'kg' },
      { id: '6', status: 'accepted', quantity: 90, unit: 'kg' },
      { id: '7', status: 'in_transit', quantity: 100, unit: 'kg' },
      { id: '8', status: 'expired', quantity: 300, unit: 'kg' }
    ];

    const impact = aggregateImpactFromRecords(mixedListings, []);

    // Only the single 'completed' item should be counted!
    expect(impact.completedDonationsCount).toBe(1);
    expect(impact.totalQuantityKg).toBe(50);
    expect(impact.totalMealsEstimated).toBe(125);
  });
});
