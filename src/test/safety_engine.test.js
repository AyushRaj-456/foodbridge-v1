import { describe, it, expect } from 'vitest';
import {
  evaluateFoodSafety,
  FOOD_STATES,
  STORAGE_CONDITIONS,
  RECIPIENT_CATEGORIES
} from '../services/safetyEngine';

describe('Food Safety and Material Suitability Engine', () => {
  const baseReferenceTime = new Date('2026-11-20T12:00:00Z');

  it('approves freshly cooked hot-held vegetarian food for human and animal consumption', () => {
    const listing = {
      foodState: FOOD_STATES.FRESHLY_PREPARED,
      preparedAt: '2026-11-20T11:00:00Z', // 1 hour ago
      safeUseDeadline: '2026-11-20T18:00:00Z', // 6 hours remaining
      storageCondition: STORAGE_CONDITIONS.HOT_HELD,
      isVegetarian: true,
      donorDeclaration: true,
      intendedSuitability: ['human', 'animal', 'compost', 'biogas']
    };

    const result = evaluateFoodSafety(listing, baseReferenceTime);

    expect(result.isEligible).toBe(true);
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.HUMAN);
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.ANIMAL);
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.BIOGAS);
  });

  it('strictly disqualifies expired food from human and animal consumption', () => {
    const listing = {
      foodState: FOOD_STATES.FRESHLY_PREPARED,
      preparedAt: '2026-11-19T10:00:00Z',
      safeUseDeadline: '2026-11-20T10:00:00Z', // 2 hours in the past relative to 12:00
      storageCondition: STORAGE_CONDITIONS.ROOM_TEMP,
      isVegetarian: true,
      donorDeclaration: true,
      intendedSuitability: ['human', 'animal', 'compost', 'biogas']
    };

    const result = evaluateFoodSafety(listing, baseReferenceTime);

    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.HUMAN);
    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.ANIMAL);
    // Still eligible for biological waste recovery
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.BIOGAS);
  });

  it('strictly disqualifies spoiled or expired state from human and animal consumption', () => {
    const listing = {
      foodState: FOOD_STATES.SPOILED_EXPIRED,
      safeUseDeadline: '2026-11-20T18:00:00Z',
      storageCondition: STORAGE_CONDITIONS.ROOM_TEMP,
      isVegetarian: true,
      donorDeclaration: true,
      intendedSuitability: ['human', 'animal']
    };

    const result = evaluateFoodSafety(listing, baseReferenceTime);

    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.HUMAN);
    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.ANIMAL);
  });

  it('prevents donor from forcing human eligibility on spoiled food', () => {
    const maliciousDonorListing = {
      foodState: FOOD_STATES.SPOILED_EXPIRED,
      safeUseDeadline: '2026-11-20T10:00:00Z', // Expired
      storageCondition: STORAGE_CONDITIONS.ROOM_TEMP,
      isVegetarian: true,
      donorDeclaration: true,
      intendedSuitability: ['human'] // Donor insists on human consumption
    };

    const result = evaluateFoodSafety(maliciousDonorListing, baseReferenceTime);

    // Platform rules must override donor choice
    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.HUMAN);
    expect(result.eligibleCategories.length).toBe(0);
    expect(result.isEligible).toBe(false);
  });

  it('disqualifies non-vegetarian food from animal feed (gaushalas)', () => {
    const nonVegListing = {
      foodState: FOOD_STATES.FRESHLY_PREPARED,
      preparedAt: '2026-11-20T11:00:00Z',
      safeUseDeadline: '2026-11-20T18:00:00Z',
      storageCondition: STORAGE_CONDITIONS.HOT_HELD,
      isVegetarian: false, // Chicken / fish / mutton curry
      donorDeclaration: true,
      intendedSuitability: ['human', 'animal', 'compost', 'biogas']
    };

    const result = evaluateFoodSafety(nonVegListing, baseReferenceTime);

    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.HUMAN);
    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.ANIMAL);
  });

  it('enforces 4-hour room temperature danger zone for cooked food', () => {
    const sittingAtRoomTempListing = {
      foodState: FOOD_STATES.FRESHLY_PREPARED,
      preparedAt: '2026-11-20T07:00:00Z', // 5 hours ago
      safeUseDeadline: '2026-11-20T18:00:00Z',
      storageCondition: STORAGE_CONDITIONS.ROOM_TEMP,
      isVegetarian: true,
      donorDeclaration: true,
      intendedSuitability: ['human']
    };

    const result = evaluateFoodSafety(sittingAtRoomTempListing, baseReferenceTime);

    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.HUMAN);
    const dangerZoneCheck = result.safetyChecks.find((c) => c.rule === 'HUMAN_TEMP_DANGER_ZONE');
    expect(dangerZoneCheck?.passed).toBe(false);
  });

  it('allows kitchen prep trims for animal feed (if vegetarian), compost, and biogas', () => {
    const rawScrapsListing = {
      foodState: FOOD_STATES.TRIMMED_SCRAPS,
      safeUseDeadline: '2026-11-20T18:00:00Z',
      storageCondition: STORAGE_CONDITIONS.ROOM_TEMP,
      isVegetarian: true,
      donorDeclaration: true,
      intendedSuitability: ['human', 'animal', 'compost', 'biogas']
    };

    const result = evaluateFoodSafety(rawScrapsListing, baseReferenceTime);

    expect(result.eligibleCategories).not.toContain(RECIPIENT_CATEGORIES.HUMAN);
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.ANIMAL);
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.COMPOST);
    expect(result.eligibleCategories).toContain(RECIPIENT_CATEGORIES.BIOGAS);
  });
});
