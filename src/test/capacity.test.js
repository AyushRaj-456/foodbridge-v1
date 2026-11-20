import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateAvailableCapacity,
  reserveRecipientCapacity,
  releaseRecipientCapacity
} from '../services/capacityService';

// Module-level mock state
let mockRecipientData = {};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}` })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  runTransaction: vi.fn(async (db, updateFunction) => {
    const transaction = {
      get: vi.fn(async () => ({
        exists: () => Boolean(mockRecipientData.exists),
        data: () => mockRecipientData.data
      })),
      update: vi.fn((ref, updates) => {
        mockRecipientData.data = { ...mockRecipientData.data, ...updates };
      })
    };
    return await updateFunction(transaction);
  })
}));

describe('Recipient Capability and Capacity Model', () => {
  beforeEach(() => {
    mockRecipientData = {
      exists: true,
      data: {
        verificationStatus: 'verified',
        totalCapacity: 500,
        committedCapacity: 100,
        availableAdditionalCapacity: 400
      }
    };
  });

  describe('calculateAvailableCapacity (Pure Function)', () => {
    it('correctly calculates remaining capacity: max - committed', () => {
      const available = calculateAvailableCapacity(500, 200);
      expect(available).toBe(300);
    });

    it('prevents negative available capacity when committed exceeds max', () => {
      const available = calculateAvailableCapacity(500, 550);
      expect(available).toBe(0);
    });

    it('applies operationalLimit when set to a smaller figure than physical capacity', () => {
      const available = calculateAvailableCapacity(500, 100, 80);
      expect(available).toBe(80);
    });

    it('handles zero or invalid numbers gracefully', () => {
      expect(calculateAvailableCapacity(0, 0)).toBe(0);
      expect(calculateAvailableCapacity(null, undefined)).toBe(0);
    });
  });

  describe('Transactional Capacity Operations', () => {
    it('successfully reserves capacity when sufficient', async () => {
      const result = await reserveRecipientCapacity({}, 'rec-123', 50);

      expect(result.previousAvailable).toBe(400);
      expect(result.newAvailable).toBe(350);
      expect(mockRecipientData.data.committedCapacity).toBe(150);
      expect(mockRecipientData.data.availableAdditionalCapacity).toBe(350);
    });

    it('throws an error and rejects reservation if quantity exceeds available capacity', async () => {
      mockRecipientData.data = {
        verificationStatus: 'verified',
        totalCapacity: 100,
        committedCapacity: 80,
        availableAdditionalCapacity: 20
      };

      await expect(
        reserveRecipientCapacity({}, 'rec-123', 50)
      ).rejects.toThrow(/insufficient additional capacity/i);
    });

    it('throws an error if recipient organization is not verified', async () => {
      mockRecipientData.data = {
        verificationStatus: 'pending',
        totalCapacity: 500,
        committedCapacity: 0,
        availableAdditionalCapacity: 500
      };

      await expect(
        reserveRecipientCapacity({}, 'rec-unverified', 25)
      ).rejects.toThrow(/not verified to receive donations/i);
    });

    it('releases previously committed capacity when a listing is cancelled', async () => {
      mockRecipientData.data = {
        verificationStatus: 'verified',
        totalCapacity: 500,
        committedCapacity: 150,
        availableAdditionalCapacity: 350
      };

      const result = await releaseRecipientCapacity({}, 'rec-123', 50);

      expect(result.newAvailable).toBe(400);
      expect(mockRecipientData.data.committedCapacity).toBe(100);
      expect(mockRecipientData.data.availableAdditionalCapacity).toBe(400);
    });
  });
});
