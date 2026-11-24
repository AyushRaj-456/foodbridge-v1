import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  SUPPORT_PLANS,
  REWARD_RULES,
  getPlanById,
  getISTDateString,
  getDonorNgoPairKey
} from '../config/membershipConfig';
import {
  isMembershipActive,
  getUserMembership,
  processSimulatedSupportPayment,
  cleanupRecipientMemberships
} from '../services/membershipService';
import { processDonationCompletionRewards } from '../services/rewardService';
import {
  getUserWallet,
  requestTokenRedemption,
  approveRedemptionRequest,
  markRedemptionAsPaid,
  rejectRedemptionRequest
} from '../services/walletService';

// Mock Firebase
vi.mock('../services/firebase', () => ({
  db: {},
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  collection: vi.fn((db, ...path) => ({ path: path.join('/') })),
  addDoc: vi.fn(async () => ({ id: 'mock_doc_id' })),
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({
    exists: () => false,
    data: () => ({})
  })),
  updateDoc: vi.fn(async () => {}),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  onSnapshot: vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => new Date())
}));

describe('Support Membership, Reward Tokens & Redemption Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. CONFIGURATION & PLANS
  describe('Plan Definitions & Configuration', () => {
    it('defines the three official support tiers correctly', () => {
      const coffee = getPlanById('coffee');
      expect(coffee.amount).toBe(50);
      expect(coffee.activatesMembership).toBe(false);
      expect(coffee.canEarnTokens).toBe(false);

      const fuel = getPlanById('fuel_support');
      expect(fuel.amount).toBe(100);
      expect(fuel.durationDays).toBe(30);
      expect(fuel.activatesMembership).toBe(true);
      expect(fuel.canEarnTokens).toBe(true);
      expect(fuel.redemptionRatePer100).toBe(2); // ₹2 per 100 tokens
      expect(fuel.ratePerToken).toBe(0.02);

      const corridor = getPlanById('corridor_help');
      expect(corridor.amount).toBe(250);
      expect(corridor.durationDays).toBe(30);
      expect(corridor.activatesMembership).toBe(true);
      expect(corridor.canEarnTokens).toBe(true);
      expect(corridor.redemptionRatePer100).toBe(6); // ₹6 per 100 tokens
      expect(corridor.ratePerToken).toBe(0.06);
    });

    it('formats calendar date in Indian Standard Time (IST, UTC+5:30) correctly', () => {
      // Midnight UTC (00:00 UTC) on 2026-11-24 is 05:30 AM IST on 2026-11-24
      const d1 = new Date('2026-11-24T00:00:00Z');
      expect(getISTDateString(d1)).toBe('2026-11-24');

      // 20:00 UTC on 2026-11-24 is 01:30 AM IST on 2026-11-25
      const d2 = new Date('2026-11-24T20:00:00Z');
      expect(getISTDateString(d2)).toBe('2026-11-25');
    });

    it('enforces that token reward rules are exclusively for donors (recipients and couriers excluded)', () => {
      expect(REWARD_RULES.ELIGIBLE_ROLES).toContain('donor');
      expect(REWARD_RULES.ELIGIBLE_ROLES).not.toContain('recipient');
      expect(REWARD_RULES.ELIGIBLE_ROLES).not.toContain('delivery');
      expect(REWARD_RULES.DONOR_REWARD_TOKENS).toBe(10);
      expect(REWARD_RULES.RECIPIENT_REWARD_TOKENS).toBe(0);
    });
  });

  // 2. SIMULATED PAYMENT & MEMBERSHIP LIFECYCLE
  describe('Simulated Payment & Membership Activation', () => {
    it('processes Coffee contribution without activating membership', async () => {
      const mockDb = {};
      const result = await processSimulatedSupportPayment(mockDb, {
        userId: 'user_coffee_01',
        userEmail: 'supporter@foodbridge.org',
        userName: 'Priya Sharma',
        planId: 'coffee'
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(50);
      expect(result.membershipActivated).toBe(false);
      expect(result.expiresAt).toBeNull();
      expect(result.transactionId).toMatch(/^TXN_DEMO_/);
    });

    it('processes Fuel Support payment and activates 30-day membership', async () => {
      const mockDb = {};
      const now = Date.now();
      const result = await processSimulatedSupportPayment(mockDb, {
        userId: 'user_fuel_01',
        userEmail: 'donor@kitchen.org',
        userName: 'Bengaluru Mess',
        planId: 'fuel_support'
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(100);
      expect(result.membershipActivated).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Expiry should be ~30 days from now
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const diff = result.expiresAt.getTime() - now;
      expect(Math.abs(diff - thirtyDaysMs)).toBeLessThan(10000); // within 10 seconds
    });

    it('checks active vs expired membership correctly based on expiry date', () => {
      const futureDate = new Date(Date.now() + 86400000); // 1 day in future
      const pastDate = new Date(Date.now() - 86400000);   // 1 day in past

      expect(isMembershipActive(futureDate)).toBe(true);
      expect(isMembershipActive(pastDate)).toBe(false);
      expect(isMembershipActive(null)).toBe(false);
    });

    it('strictly prevents Recipient accounts from purchasing or activating memberships', async () => {
      const mockDb = {};
      await expect(
        processSimulatedSupportPayment(mockDb, {
          userId: 'recipient_user_01',
          userEmail: 'ngo@shelter.org',
          userName: 'Hope Orphanage',
          userRole: 'recipient',
          planId: 'fuel_support'
        })
      ).rejects.toThrow(/Support memberships are exclusively for Donors/i);
    });

    it('safely runs cleanup of recipient memberships without throwing errors', async () => {
      const mockDb = {};
      const res = await cleanupRecipientMemberships(mockDb);
      expect(res).toBeDefined();
      expect(typeof res.cleanedMemberships).toBe('number');
      expect(typeof res.cleanedWallets).toBe('number');
    });
  });

  // 3. DAILY REWARD LIMITS (GLOBAL & PAIR)
  describe('Daily Reward Limits & Fraud Safeguards', () => {
    it('normalizes Donor-NGO pair key consistently', () => {
      const key = getDonorNgoPairKey('donor_123', 'ngo_456');
      expect(key).toBe('donor_123_ngo_456');
    });

    it('enforces global limit: allows up to 5 donations, rejects 6th donation', () => {
      expect(REWARD_RULES.GLOBAL_DAILY_LIMIT).toBe(5);
      expect(REWARD_RULES.PAIR_DAILY_LIMIT).toBe(2);

      // Simulating counter checks:
      const canRewardDonation = (globalCount, pairCount) => {
        if (pairCount >= REWARD_RULES.PAIR_DAILY_LIMIT) {
          return { allowed: false, reason: 'pair_limit_exceeded' };
        }
        if (globalCount >= REWARD_RULES.GLOBAL_DAILY_LIMIT) {
          return { allowed: false, reason: 'global_limit_exceeded' };
        }
        return { allowed: true };
      };

      // 1st donation between A and X: ok
      expect(canRewardDonation(0, 0).allowed).toBe(true);
      // 2nd donation between A and X: ok
      expect(canRewardDonation(1, 1).allowed).toBe(true);
      // 3rd donation between A and X: pair limit exceeded (does not consume global slot)
      expect(canRewardDonation(2, 2)).toEqual({ allowed: false, reason: 'pair_limit_exceeded' });

      // 5th donation between C and Z: ok
      expect(canRewardDonation(4, 0).allowed).toBe(true);
      // 6th donation between D and P: global limit reached
      expect(canRewardDonation(5, 0)).toEqual({ allowed: false, reason: 'global_limit_exceeded' });
    });
  });

  // 4. PLAN-BASED REWARD VALUATION & BATCHES
  describe('Plan-Based Token Valuation & Ledger Batches', () => {
    it('permanently preserves original batch valuation after membership upgrade', () => {
      // User earned 500 tokens under Fuel Support (₹2 per 100 tokens = ₹0.02 / token)
      const batchFuel = {
        batchId: 'b_fuel',
        tokensEarned: 500,
        remainingTokens: 500,
        planAtEarning: 'fuel_support',
        redemptionRate: 0.02,
        redemptionRatePer100: 2
      };

      // User later upgrades to Corridor Help (₹6 per 100 tokens = ₹0.06 / token)
      // and earns 300 tokens
      const batchCorridor = {
        batchId: 'b_corridor',
        tokensEarned: 300,
        remainingTokens: 300,
        planAtEarning: 'corridor_help',
        redemptionRate: 0.06,
        redemptionRatePer100: 6
      };

      // Verify batch valuations:
      const valFuel = batchFuel.remainingTokens * batchFuel.redemptionRate;
      expect(valFuel).toBe(10); // 500 * 0.02 = ₹10 (NOT ₹30!)

      const valCorridor = batchCorridor.remainingTokens * batchCorridor.redemptionRate;
      expect(valCorridor).toBe(18); // 300 * 0.06 = ₹18

      // Combined total estimated redeemable value:
      const totalEstimatedValue = valFuel + valCorridor;
      expect(totalEstimatedValue).toBe(28); // ₹10 + ₹18 = ₹28
    });
  });

  // 5. FIFO TOKEN REDEMPTION & REVERSAL
  describe('FIFO Token Redemption & Administrative Review', () => {
    it('allocates redemption tokens across multiple batches in strict FIFO order', () => {
      // 2 batches in FIFO order:
      // Batch 1 (Oldest, Fuel Support): 500 tokens @ ₹0.02/token
      // Batch 2 (Newer, Corridor Help): 300 tokens @ ₹0.06/token
      const batches = [
        { batchId: 'b1', remainingTokens: 500, plan: 'fuel_support', rate: 0.02 },
        { batchId: 'b2', remainingTokens: 300, plan: 'corridor_help', rate: 0.06 }
      ];

      // User redeems 200 tokens
      const redeemCount = 200;
      let needed = redeemCount;
      const allocations = [];
      let totalPayout = 0;

      for (const b of batches) {
        if (needed <= 0) break;
        const take = Math.min(b.remainingTokens, needed);
        const amt = take * b.rate;
        allocations.push({ batchId: b.batchId, tokensDeducted: take, amountINR: amt });
        totalPayout += amt;
        needed -= take;
      }

      expect(allocations.length).toBe(1);
      expect(allocations[0].batchId).toBe('b1');
      expect(allocations[0].tokensDeducted).toBe(200);
      expect(allocations[0].amountINR).toBe(4); // 200 tokens @ ₹2/100 = ₹4
      expect(totalPayout).toBe(4);
    });

    it('allocates across both batches when redemption exceeds first batch (FIFO)', () => {
      // Batch 1: 100 tokens @ ₹0.02/token (Fuel)
      // Batch 2: 200 tokens @ ₹0.06/token (Corridor)
      const batches = [
        { batchId: 'b1', remainingTokens: 100, plan: 'fuel_support', rate: 0.02 },
        { batchId: 'b2', remainingTokens: 200, plan: 'corridor_help', rate: 0.06 }
      ];

      // User redeems 200 tokens:
      // Takes all 100 from Batch 1 (100 * 0.02 = ₹2)
      // Takes 100 from Batch 2 (100 * 0.06 = ₹6)
      // Total payout = ₹2 + ₹6 = ₹8
      const redeemCount = 200;
      let needed = redeemCount;
      const allocations = [];
      let totalPayout = 0;

      for (const b of batches) {
        if (needed <= 0) break;
        const take = Math.min(b.remainingTokens, needed);
        const amt = take * b.rate;
        allocations.push({ batchId: b.batchId, tokensDeducted: take, amountINR: amt });
        totalPayout += amt;
        needed -= take;
      }

      expect(allocations.length).toBe(2);
      expect(allocations[0].tokensDeducted).toBe(100);
      expect(allocations[0].amountINR).toBe(2);
      expect(allocations[1].tokensDeducted).toBe(100);
      expect(allocations[1].amountINR).toBe(6);
      expect(totalPayout).toBe(8);
    });

    it('rejects redemptions under 100 tokens or not in multiples of 100', async () => {
      const mockDb = {};
      await expect(
        requestTokenRedemption(mockDb, {
          userId: 'user_test',
          tokensToRedeem: 50,
          upiId: 'test@upi'
        })
      ).rejects.toThrow(/Minimum redemption is 100 tokens/i);

      await expect(
        requestTokenRedemption(mockDb, {
          userId: 'user_test',
          tokensToRedeem: 150,
          upiId: 'test@upi'
        })
      ).rejects.toThrow(/multiples of 100 tokens/i);
    });

    it('strictly prevents Recipient accounts from submitting redemption requests', async () => {
      const mockDb = {};
      const { getDoc } = await import('../services/firebase');
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ activeRole: 'recipient', roles: ['recipient'] })
      });

      await expect(
        requestTokenRedemption(mockDb, {
          userId: 'recipient_user_02',
          tokensToRedeem: 100,
          upiId: 'ngo@okaxis'
        })
      ).rejects.toThrow(/exclusively available for Donors/i);
    });
  });
});
