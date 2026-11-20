import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistance,
  checkRecipientEligibility,
  findEligibleRecipients,
  isRadiusExpansionDue,
  getNextExpansionRadius,
  INITIAL_RADIUS_KM
} from '../services/matchingEngine';

describe('Geospatial Matching and Radius Expansion Engine', () => {
  // Test coordinates in Bengaluru
  const donorCoords = { lat: 12.9716, lon: 77.5946 }; // Bengaluru central
  const nearbyCoords = { lat: 12.9780, lon: 77.5990 }; // ~0.85 km away
  const midCoords = { lat: 12.9900, lon: 77.6100 }; // ~2.6 km away
  const farCoords = { lat: 13.3409, lon: 77.1010 }; // Tumakuru, ~68 km away

  describe('Haversine Distance Calculations', () => {
    it('calculates 0 km distance for identical coordinates', () => {
      const dist = calculateHaversineDistance(donorCoords.lat, donorCoords.lon, donorCoords.lat, donorCoords.lon);
      expect(dist).toBe(0);
    });

    it('accurately calculates distance for nearby points in Bengaluru', () => {
      const dist = calculateHaversineDistance(donorCoords.lat, donorCoords.lon, nearbyCoords.lat, nearbyCoords.lon);
      expect(dist).toBeGreaterThan(0.7);
      expect(dist).toBeLessThan(1.2);
    });

    it('calculates long distance across regional Karnataka hubs', () => {
      const dist = calculateHaversineDistance(donorCoords.lat, donorCoords.lon, farCoords.lat, farCoords.lon);
      expect(dist).toBeGreaterThan(60);
      expect(dist).toBeLessThan(75);
    });
  });

  describe('Recipient Eligibility and Safety Filtering', () => {
    const baseListing = {
      latitude: donorCoords.lat,
      longitude: donorCoords.lon,
      quantity: 50,
      eligibleCategories: ['human', 'animal'],
      status: 'matching'
    };

    it('matches verified, active recipient in correct category with sufficient capacity within radius', () => {
      const recipient = {
        userId: 'rec-1',
        verificationStatus: 'verified',
        operationalStatus: 'active',
        category: 'human',
        availableAdditionalCapacity: 100,
        latitude: nearbyCoords.lat,
        longitude: nearbyCoords.lon,
        serviceRadiusKm: 10
      };

      const result = checkRecipientEligibility(baseListing, recipient, INITIAL_RADIUS_KM);
      expect(result.isEligible).toBe(true);
      expect(result.distanceKm).toBeLessThan(INITIAL_RADIUS_KM);
    });

    it('STRICTLY rejects unverified recipient even if nearby with large capacity', () => {
      const unverifiedRecipient = {
        userId: 'rec-unverified',
        verificationStatus: 'pending',
        operationalStatus: 'active',
        category: 'human',
        availableAdditionalCapacity: 500,
        latitude: nearbyCoords.lat,
        longitude: nearbyCoords.lon
      };

      const result = checkRecipientEligibility(baseListing, unverifiedRecipient, INITIAL_RADIUS_KM);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('not verified');
    });

    it('rejects paused recipient', () => {
      const pausedRecipient = {
        userId: 'rec-paused',
        verificationStatus: 'verified',
        operationalStatus: 'paused',
        category: 'human',
        availableAdditionalCapacity: 200,
        latitude: nearbyCoords.lat,
        longitude: nearbyCoords.lon
      };

      const result = checkRecipientEligibility(baseListing, pausedRecipient, INITIAL_RADIUS_KM);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('paused');
    });

    it('rejects recipient with insufficient available additional capacity', () => {
      const lowCapacityRecipient = {
        userId: 'rec-low-cap',
        verificationStatus: 'verified',
        operationalStatus: 'active',
        category: 'human',
        availableAdditionalCapacity: 20, // Listing requires 50
        latitude: nearbyCoords.lat,
        longitude: nearbyCoords.lon
      };

      const result = checkRecipientEligibility(baseListing, lowCapacityRecipient, INITIAL_RADIUS_KM);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Insufficient additional capacity');
    });

    it('rejects recipient outside current matching radius', () => {
      const outsideRadiusRecipient = {
        userId: 'rec-mid-dist',
        verificationStatus: 'verified',
        operationalStatus: 'active',
        category: 'human',
        availableAdditionalCapacity: 200,
        latitude: midCoords.lat, // ~2.6 km away
        longitude: midCoords.lon
      };

      // At 1.5 km initial radius: should be excluded
      const resultInitial = checkRecipientEligibility(baseListing, outsideRadiusRecipient, INITIAL_RADIUS_KM);
      expect(resultInitial.isEligible).toBe(false);
      expect(resultInitial.reason).toContain('Outside current radius');

      // At 3.0 km expanded radius: should be eligible!
      const resultExpanded = checkRecipientEligibility(baseListing, outsideRadiusRecipient, 3.0);
      expect(resultExpanded.isEligible).toBe(true);
    });

    it('strictly segregates recipient categories (human vs composting/biogas)', () => {
      const compostingRecipient = {
        userId: 'rec-compost',
        verificationStatus: 'verified',
        operationalStatus: 'active',
        category: 'compost', // baseListing is only eligible for human, animal
        availableAdditionalCapacity: 500,
        latitude: nearbyCoords.lat,
        longitude: nearbyCoords.lon
      };

      const result = checkRecipientEligibility(baseListing, compostingRecipient, INITIAL_RADIUS_KM);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('not eligible for recipient category');
    });
  });

  describe('Idempotent Radius Expansion', () => {
    it('progresses radius through configurable steps: 1.5 -> 3.0 -> 6.0 -> 10.0 -> 15.0', () => {
      expect(getNextExpansionRadius(1.5)).toBe(3.0);
      expect(getNextExpansionRadius(3.0)).toBe(6.0);
      expect(getNextExpansionRadius(6.0)).toBe(10.0);
      expect(getNextExpansionRadius(10.0)).toBe(15.0);
      expect(getNextExpansionRadius(15.0)).toBe(15.0); // Capped at max
    });

    it('detects when 2 hours have elapsed to trigger expansion', () => {
      const now = new Date('2026-11-20T12:00:00Z');
      const freshListing = {
        status: 'matching',
        matchingRadiusKm: 1.5,
        createdAt: '2026-11-20T11:00:00Z' // 1 hour ago
      };
      expect(isRadiusExpansionDue(freshListing, now, 2.0)).toBe(false);

      const dueListing = {
        status: 'matching',
        matchingRadiusKm: 1.5,
        createdAt: '2026-11-20T09:30:00Z' // 2.5 hours ago
      };
      expect(isRadiusExpansionDue(dueListing, now, 2.0)).toBe(true);
    });

    it('stops expansion if listing is accepted or cancelled', () => {
      const now = new Date('2026-11-20T12:00:00Z');
      const acceptedListing = {
        status: 'accepted',
        matchingRadiusKm: 1.5,
        createdAt: '2026-11-20T08:00:00Z'
      };
      expect(isRadiusExpansionDue(acceptedListing, now, 2.0)).toBe(false);
    });
  });
});
