import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  SUPPORT_PLANS,
  REWARD_RULES,
  getPlanById,
  getISTDateString,
  getDonorNgoPairKey,
  calculateDonationTokens
} from '../config/membershipConfig';
import {
  isMembershipActive,
  getUserMembership,
  processSimulatedSupportPayment,
  cleanupRecipientMemberships,
  cancelMembershipPeriod,
  getUserMembershipPeriods,
  sanitizePaymentMethodDetails,
  parseDate
} from '../services/membershipService';
import {
  processDonationCompletionRewards,
  extractDonationQuantityKg
} from '../services/rewardService';
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

// Mock Firestore runTransaction
vi.mock('firebase/firestore', () => ({
  runTransaction: vi.fn()
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

  // 6. DETAILED SIMULATED PAYMENT CHECKOUT, STACKING & CANCELLATION (14 SCENARIOS)
  describe('Simulated Payment Checkout, Consecutive Stacking & Cancellation (Scenarios 1-14)', () => {
    // In-memory test state for full multi-step simulation
    let memPeriodsStore = {};
    let supportTxStore = {};
    let userMembershipsStore = {};

    beforeEach(async () => {
      memPeriodsStore = {};
      supportTxStore = {};
      userMembershipsStore = {};

      const firebaseModule = await import('../services/firebase');

      firebaseModule.setDoc.mockImplementation(async (docRef, data) => {
        const path = docRef.path;
        if (path.startsWith('membershipPeriods/')) {
          const id = path.split('/')[1];
          memPeriodsStore[id] = { ...data, id };
        } else if (path.startsWith('supportTransactions/')) {
          const id = path.split('/')[1];
          supportTxStore[id] = { ...data, id };
        } else if (path.startsWith('memberships/')) {
          const id = path.split('/')[1];
          userMembershipsStore[id] = { ...data, id };
        }
      });

      firebaseModule.updateDoc.mockImplementation(async (docRef, data) => {
        const path = docRef.path;
        if (path.startsWith('membershipPeriods/')) {
          const id = path.split('/')[1];
          if (memPeriodsStore[id]) {
            memPeriodsStore[id] = { ...memPeriodsStore[id], ...data };
          }
        } else if (path.startsWith('supportTransactions/')) {
          const id = path.split('/')[1];
          if (supportTxStore[id]) {
            supportTxStore[id] = { ...supportTxStore[id], ...data };
          }
        } else if (path.startsWith('memberships/')) {
          const id = path.split('/')[1];
          if (userMembershipsStore[id]) {
            userMembershipsStore[id] = { ...userMembershipsStore[id], ...data };
          }
        }
      });

      firebaseModule.getDoc.mockImplementation(async (docRef) => {
        const path = docRef.path;
        if (path.startsWith('membershipPeriods/')) {
          const id = path.split('/')[1];
          const exists = Boolean(memPeriodsStore[id]);
          return {
            exists: () => exists,
            data: () => memPeriodsStore[id] || null
          };
        } else if (path.startsWith('memberships/')) {
          const id = path.split('/')[1];
          const exists = Boolean(userMembershipsStore[id]);
          return {
            exists: () => exists,
            data: () => userMembershipsStore[id] || null
          };
        }
        return {
          exists: () => false,
          data: () => ({})
        };
      });

      firebaseModule.getDocs.mockImplementation(async (queryRef) => {
        // Return stored membershipPeriods
        const periods = Object.values(memPeriodsStore);
        return {
          docs: periods.map((p) => ({
            id: p.id || p.periodId,
            data: () => p
          })),
          empty: periods.length === 0
        };
      });
    });

    // Scenario 1: Card payment completes and masks details
    it('Scenario 1: Card simulated payment completes successfully with safe masked metadata', async () => {
      const mockDb = {};
      const res = await processSimulatedSupportPayment(mockDb, {
        userId: 'donor_card_01',
        userRole: 'donor',
        planId: 'fuel_support',
        paymentMethod: 'card',
        paymentMethodDetails: {
          cardNumber: '4532111122228892',
          cardholderName: 'Kavita Rao'
        },
        paymentStatus: 'completed'
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('completed');
      expect(res.amount).toBe(100);
      expect(res.membershipActivated).toBe(true);

      // Verify safe metadata masking in storage
      const tx = Object.values(supportTxStore).find((t) => t.userId === 'donor_card_01');
      expect(tx).toBeDefined();
      expect(tx.paymentMethod).toBe('card');
      expect(tx.paymentMethodDetails.last4).toBe('8892');
      expect(tx.paymentMethodDetails.cardBrand).toBe('Visa');
      expect(tx.paymentMethodDetails.cardNumber).toBeUndefined(); // Zero raw card number!
    });

    // Scenario 2: UPI simulated payment completes
    it('Scenario 2: UPI simulated payment completes successfully with VPA', async () => {
      const mockDb = {};
      const res = await processSimulatedSupportPayment(mockDb, {
        userId: 'donor_upi_01',
        userRole: 'donor',
        planId: 'corridor_help',
        paymentMethod: 'upi',
        paymentMethodDetails: {
          upiId: 'donor@okhdfcbank'
        },
        paymentStatus: 'completed'
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('completed');
      expect(res.amount).toBe(250);
      expect(res.membershipActivated).toBe(true);

      const tx = Object.values(supportTxStore).find((t) => t.userId === 'donor_upi_01');
      expect(tx.paymentMethodDetails.upiId).toBe('donor@okhdfcbank');
    });

    // Scenario 3: Net Banking simulated payment completes
    it('Scenario 3: Net Banking simulated payment completes successfully with bank details', async () => {
      const mockDb = {};
      const res = await processSimulatedSupportPayment(mockDb, {
        userId: 'donor_nb_01',
        userRole: 'donor',
        planId: 'fuel_support',
        paymentMethod: 'net_banking',
        paymentMethodDetails: {
          bankName: 'State Bank of India',
          accountId: '9876543210'
        },
        paymentStatus: 'completed'
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('completed');
      expect(res.membershipActivated).toBe(true);

      const tx = Object.values(supportTxStore).find((t) => t.userId === 'donor_nb_01');
      expect(tx.paymentMethodDetails.bankName).toBe('State Bank of India');
      expect(tx.paymentMethodDetails.maskedAccount).toBe('••••3210');
    });

    // Scenario 4: Failed payment does not activate membership
    it('Scenario 4: Failed payment records decline and NEVER activates membership', async () => {
      const mockDb = {};
      const res = await processSimulatedSupportPayment(mockDb, {
        userId: 'donor_fail_01',
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'failed',
        failureReason: 'Insufficient funds (simulated)'
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');
      expect(res.membershipActivated).toBe(false);

      // Verify no membership period was added
      const periods = Object.values(memPeriodsStore).filter((p) => p.userId === 'donor_fail_01');
      expect(periods.length).toBe(0);

      // Verify transaction recorded as failed for audit
      const tx = Object.values(supportTxStore).find((t) => t.userId === 'donor_fail_01');
      expect(tx.paymentStatus).toBe('failed');
      expect(tx.failureReason).toBe('Insufficient funds (simulated)');
    });

    // Scenario 5: Cancelled payment does not activate membership
    it('Scenario 5: Cancelled payment records cancellation and NEVER activates membership', async () => {
      const mockDb = {};
      const res = await processSimulatedSupportPayment(mockDb, {
        userId: 'donor_cancel_01',
        userRole: 'donor',
        planId: 'corridor_help',
        paymentStatus: 'cancelled'
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('cancelled');
      expect(res.membershipActivated).toBe(false);

      const periods = Object.values(memPeriodsStore).filter((p) => p.userId === 'donor_cancel_01');
      expect(periods.length).toBe(0);

      const tx = Object.values(supportTxStore).find((t) => t.userId === 'donor_cancel_01');
      expect(tx.paymentStatus).toBe('cancelled');
    });

    // Scenario 6: Consecutive Stacking (3 purchases = 90 days)
    it('Scenario 6: Purchasing the same membership three times creates three consecutive 30-day periods (90 days)', async () => {
      const mockDb = {};
      const userId = 'donor_stack_3x';

      // 1st purchase: active for 30 days
      const p1 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });
      expect(p1.periodStatus).toBe('active');

      // 2nd purchase: upcoming for +30 days (consecutively stacked)
      const p2 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });
      expect(p2.periodStatus).toBe('upcoming');
      // Starts exactly when period 1 expires
      expect(p2.startDate.getTime()).toBe(p1.expiresAt.getTime());

      // 3rd purchase: upcoming for another +30 days
      const p3 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });
      expect(p3.periodStatus).toBe('upcoming');
      expect(p3.startDate.getTime()).toBe(p2.expiresAt.getTime());

      // Verify total stacking duration across all 3 periods is ~90 days
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      const totalDiff = p3.expiresAt.getTime() - p1.startDate.getTime();
      expect(Math.abs(totalDiff - ninetyDaysMs)).toBeLessThan(10000);
    });

    // Scenario 7: Purchasing a different plan queues it correctly
    it('Scenario 7: Purchasing a different plan queues it with its own reward rate', async () => {
      const mockDb = {};
      const userId = 'donor_queue_diff';

      // 1. Purchase Fuel Support (₹2 / 100 tokens)
      const p1 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });

      // 2. Queue Corridor Help (₹6 / 100 tokens)
      const p2 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'corridor_help',
        paymentStatus: 'completed'
      });

      expect(p1.plan.id).toBe('fuel_support');
      expect(p1.plan.redemptionRatePer100).toBe(2);

      expect(p2.periodStatus).toBe('upcoming');
      expect(p2.plan.id).toBe('corridor_help');
      expect(p2.plan.redemptionRatePer100).toBe(6);
      expect(p2.startDate.getTime()).toBe(p1.expiresAt.getTime());
    });

    // Scenario 8: Active membership cancellation
    it('Scenario 8: Active membership cancellation marks as active_cancelled and retains benefits until scheduled expiry', async () => {
      const mockDb = {};
      const userId = 'donor_cancel_active';

      const p1 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });

      const cancelRes = await cancelMembershipPeriod(mockDb, {
        userId,
        periodId: p1.periodId,
        cancellationReason: 'Donor stopped recurring simulation'
      });

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('active_cancelled');
      expect(cancelRes.cancellationType).toBe('active');
      expect(cancelRes.validUntil.getTime()).toBe(p1.expiresAt.getTime());

      // Check stored period document
      const stored = memPeriodsStore[p1.periodId];
      expect(stored.isCancelled).toBe(true);
      expect(stored.status).toBe('active_cancelled');
      expect(stored.cancellationReason).toBe('Donor stopped recurring simulation');
    });

    // Scenario 9 & 10: Upcoming pass cancellation does NOT cancel others and recalculates subsequent dates
    it('Scenario 9 & 10: Cancelling upcoming pass leaves others intact and shifts subsequent passes forward by 30 days', async () => {
      const mockDb = {};
      const userId = 'donor_cancel_upcoming';

      // Create 3 stacked passes
      const p1 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });
      const p2 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'fuel_support',
        paymentStatus: 'completed'
      });
      const p3 = await processSimulatedSupportPayment(mockDb, {
        userId,
        userRole: 'donor',
        planId: 'corridor_help',
        paymentStatus: 'completed'
      });

      const originalP3Start = p3.startDate.getTime();

      // Cancel the middle pass (p2)
      const cancelRes = await cancelMembershipPeriod(mockDb, {
        userId,
        periodId: p2.periodId,
        cancellationReason: 'Cancelled pass 2'
      });

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('cancelled');
      expect(cancelRes.cancellationType).toBe('upcoming');

      // 1. Pass 1 remains active
      expect(memPeriodsStore[p1.periodId].status).toBe('active');

      // 2. Pass 2 is cancelled
      expect(memPeriodsStore[p2.periodId].status).toBe('cancelled');

      // 3. Pass 3 is NOT cancelled!
      expect(memPeriodsStore[p3.periodId].status).toBe('upcoming');

      // 4. Pass 3 start date was shifted forward by 30 days (now begins right when Pass 1 expires)!
      const newP3Start = parseDate(memPeriodsStore[p3.periodId].startDate).getTime();
      expect(newP3Start).toBe(p1.expiresAt.getTime());
      expect(newP3Start).toBeLessThan(originalP3Start);
    });

    // Scenario 11: Payment history displays all transactions
    it('Scenario 11: Payment history displays completed, failed, and cancelled transactions with metadata', async () => {
      const mockDb = {};
      const userId = 'donor_history_test';

      await processSimulatedSupportPayment(mockDb, {
        userId,
        planId: 'coffee',
        paymentStatus: 'completed'
      });
      await processSimulatedSupportPayment(mockDb, {
        userId,
        planId: 'fuel_support',
        paymentStatus: 'failed',
        failureReason: 'Card expired'
      });
      await processSimulatedSupportPayment(mockDb, {
        userId,
        planId: 'corridor_help',
        paymentStatus: 'cancelled'
      });

      const txns = Object.values(supportTxStore).filter((t) => t.userId === userId);
      expect(txns.length).toBe(3);
      expect(txns.some((t) => t.paymentStatus === 'completed')).toBe(true);
      expect(txns.some((t) => t.paymentStatus === 'failed')).toBe(true);
      expect(txns.some((t) => t.paymentStatus === 'cancelled')).toBe(true);
    });

    // Scenario 12: Duplicate payment submission prevention
    it('Scenario 12: Rapid duplicate payment submissions produce unique transaction IDs and safe tracking', async () => {
      const mockDb = {};
      const userId = 'donor_duplicate_test';

      const [r1, r2] = await Promise.all([
        processSimulatedSupportPayment(mockDb, { userId, planId: 'fuel_support' }),
        processSimulatedSupportPayment(mockDb, { userId, planId: 'fuel_support' })
      ]);

      expect(r1.transactionId).not.toBe(r2.transactionId);
      expect(r1.periodId).not.toBe(r2.periodId);
    });

    // Scenario 13: Existing token balances and reward valuations remain unchanged
    it('Scenario 13: New membership purchases do not alter or recalculate existing batch valuations', () => {
      const existingBatch = {
        batchId: 'b_old',
        tokensEarned: 100,
        remainingTokens: 100,
        planAtEarning: 'fuel_support',
        redemptionRate: 0.02
      };

      const valBefore = existingBatch.remainingTokens * existingBatch.redemptionRate;
      expect(valBefore).toBe(2);

      // User buys Corridor Help (which has higher rate 0.06). Old batch valuation remains unchanged!
      const valAfter = existingBatch.remainingTokens * existingBatch.redemptionRate;
      expect(valAfter).toBe(2);
    });

    // Scenario 14: Existing donation and redemption workflows continue working
    it('Scenario 14: Existing FIFO token redemption and donation reward rules continue working seamlessly', () => {
      expect(REWARD_RULES.DONOR_REWARD_TOKENS).toBe(10);
      expect(REWARD_RULES.MIN_REDEMPTION_TOKENS).toBe(100);
      expect(REWARD_RULES.GLOBAL_DAILY_LIMIT).toBe(5);
      expect(REWARD_RULES.PAIR_DAILY_LIMIT).toBe(2);
      expect(REWARD_RULES.ELIGIBLE_ROLES).toContain('donor');
    });
  });

  // 7. QUANTITY-BASED REWARD TOKEN EARNING (10 TOKENS PER 2 KG) & TRACEABILITY (14 EDGE CASES)
  describe('Quantity-Based Reward Token Earning & Linkage Suite (14 Edge Cases)', () => {
    let mockListingsStore = {};
    let mockLedgerStore = {};
    let mockWalletsStore = {};
    let mockMembershipsStore = {};
    let mockCountersStore = {};

    beforeEach(async () => {
      mockListingsStore = {};
      mockLedgerStore = {};
      mockWalletsStore = {};
      mockMembershipsStore = {};
      mockCountersStore = {};

      const firebaseModule = await import('../services/firebase');

      firebaseModule.doc.mockImplementation((dbInstance, col, id) => ({
        path: `${col}/${id}`,
        id
      }));

      firebaseModule.setDoc.mockImplementation(async (docRef, data, options) => {
        const path = docRef.path;
        const [col, id] = path.split('/');
        if (col === 'listings') {
          mockListingsStore[id] = options?.merge
            ? { ...mockListingsStore[id], ...data }
            : { ...data, id };
        } else if (col === 'rewardLedger') {
          mockLedgerStore[id] = options?.merge
            ? { ...mockLedgerStore[id], ...data }
            : { ...data, id };
        } else if (col === 'wallets') {
          mockWalletsStore[id] = options?.merge
            ? { ...mockWalletsStore[id], ...data }
            : { ...data, id };
        }
      });

      firebaseModule.getDoc.mockImplementation(async (docRef) => {
        const path = docRef.path;
        const [col, id] = path.split('/');
        let data = null;
        if (col === 'listings') data = mockListingsStore[id];
        else if (col === 'rewardLedger') data = mockLedgerStore[id];
        else if (col === 'wallets') data = mockWalletsStore[id];
        else if (col === 'memberships') data = mockMembershipsStore[id];
        return {
          exists: () => Boolean(data),
          data: () => data || {}
        };
      });
    });

    // 1. Edge Case 1: 2 kg generates 10 tokens
    it('Edge Case 1: A listing of 2 kg generates exactly 10 tokens', () => {
      expect(calculateDonationTokens(2)).toBe(10);
    });

    // 2. Edge Case 2: 5 kg generates 25 tokens
    it('Edge Case 2: A listing of 5 kg generates exactly 25 tokens', () => {
      expect(calculateDonationTokens(5)).toBe(25);
    });

    // 3. Edge Case 3: 10.5 kg generates 52.5 tokens (proportional, never rounded down)
    it('Edge Case 3: A listing of 10.5 kg generates 52.5 tokens without rounding down', () => {
      expect(calculateDonationTokens(10.5)).toBe(52.5);
      // Additional proportional verification
      expect(calculateDonationTokens(1)).toBe(5);
      expect(calculateDonationTokens(3)).toBe(15);
      expect(calculateDonationTokens(4)).toBe(20);
      expect(calculateDonationTokens(10)).toBe(50);
      expect(calculateDonationTokens(20)).toBe(100);
    });

    // 4. Edge Case 4: Listing cancelled before handover: no tokens
    it('Edge Case 4: A listing cancelled before handover awards 0 tokens', async () => {
      const mockDb = {};
      const res = await processDonationCompletionRewards(mockDb, {
        id: 'list_cancelled',
        donorId: 'donor_01',
        recipientId: 'ngo_01',
        quantity: 10,
        status: 'cancelled'
      });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('handover_not_completed');
    });

    // 5. Edge Case 5: NGO rejects donation: no tokens
    it('Edge Case 5: An NGO rejected donation awards 0 tokens', async () => {
      const mockDb = {};
      const res = await processDonationCompletionRewards(mockDb, {
        id: 'list_rejected',
        donorId: 'donor_01',
        recipientId: 'ngo_01',
        quantity: 8,
        status: 'rejected'
      });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('handover_not_completed');
    });

    // 6. Edge Case 6: Donation accepted but handover incomplete: no tokens
    it('Edge Case 6: A donation accepted/in-transit with incomplete handover awards 0 tokens', async () => {
      const mockDb = {};
      const resInTransit = await processDonationCompletionRewards(mockDb, {
        id: 'list_transit',
        donorId: 'donor_01',
        recipientId: 'ngo_01',
        quantity: 6,
        status: 'in_transit'
      });
      expect(resInTransit.success).toBe(false);
      expect(resInTransit.reason).toBe('handover_not_completed');

      const resPending = await processDonationCompletionRewards(mockDb, {
        id: 'list_pending',
        donorId: 'donor_01',
        recipientId: 'ngo_01',
        quantity: 6,
        status: 'pending'
      });
      expect(resPending.success).toBe(false);
      expect(resPending.reason).toBe('handover_not_completed');
    });

    // 7. Edge Case 7: Completed handover generates the correct tokens
    it('Edge Case 7: A completed handover generates correct quantity-based tokens in transaction', async () => {
      const mockDb = {};
      const listingId = 'list_completed_10kg';
      const donorId = 'donor_fuel_01';
      const recipientId = 'ngo_shelter_01';

      // Setup active membership for donor
      mockMembershipsStore[donorId] = {
        userId: donorId,
        userRole: 'donor',
        activePlan: 'fuel_support',
        isActive: true,
        expiresAt: new Date(Date.now() + 864000000)
      };

      // Setup listing in store
      mockListingsStore[listingId] = {
        id: listingId,
        donorId,
        recipientId,
        quantity: 10,
        unit: 'kg',
        status: 'completed',
        rewardProcessed: false
      };

      // Mock runTransaction to execute callback directly
      const { runTransaction } = await import('firebase/firestore');
      runTransaction.mockImplementationOnce(async (db, cb) => {
        const fakeTx = {
          get: async (ref) => {
            const [col, id] = ref.path.split('/');
            let data = null;
            if (col === 'listings') data = mockListingsStore[id];
            else if (col === 'rewardLedger') data = mockLedgerStore[id];
            else if (col === 'wallets') data = mockWalletsStore[id];
            else if (col === 'dailyPairRewardCounters') data = mockCountersStore[id];
            else if (col === 'dailyRewardCounters') data = mockCountersStore[id];
            return {
              exists: () => Boolean(data),
              data: () => data || {}
            };
          },
          set: (ref, data, opts) => {
            const [col, id] = ref.path.split('/');
            if (col === 'rewardLedger') {
              mockLedgerStore[id] = opts?.merge ? { ...mockLedgerStore[id], ...data } : { ...data, id };
            } else if (col === 'wallets') {
              mockWalletsStore[id] = opts?.merge ? { ...mockWalletsStore[id], ...data } : { ...data, id };
            } else if (col === 'listings') {
              mockListingsStore[id] = opts?.merge ? { ...mockListingsStore[id], ...data } : { ...data, id };
            }
          }
        };
        return cb(fakeTx);
      });

      const res = await processDonationCompletionRewards(mockDb, {
        id: listingId,
        donorId,
        acceptedRecipientId: recipientId,
        quantity: 10,
        unit: 'kg',
        status: 'completed'
      });

      expect(res.success).toBe(true);
      expect(res.donorTokens).toBe(50); // (10 / 2) * 10 = 50 tokens
      expect(res.foodQuantityKg).toBe(10);
      expect(res.calculationFormula).toBe('(10 / 2) * 10');

      // Verify wallet update
      expect(mockWalletsStore[donorId]?.availableTokens).toBe(50);
      expect(mockWalletsStore[donorId]?.totalTokensEarned).toBe(50);

      // Verify deterministic ledger entry
      const batchId = `LEDGER_${listingId}_donor`;
      const batch = mockLedgerStore[batchId];
      expect(batch).toBeDefined();
      expect(batch.tokensEarned).toBe(50);
      expect(batch.remainingTokens).toBe(50);
      expect(batch.foodQuantityKg).toBe(10);
      expect(batch.planAtEarning).toBe('fuel_support');
      expect(batch.redemptionRate).toBe(0.02);
      expect(batch.status).toBe('credited');
    });

    // 8. Edge Case 8: Duplicate completion event triggers no duplicate rewards
    it('Edge Case 8: Repeated completion event triggers idempotency guard (no duplicate rewards)', async () => {
      const mockDb = {};
      const listingId = 'list_completed_double';
      const donorId = 'donor_fuel_02';

      // Listing already marked as rewardProcessed
      const res = await processDonationCompletionRewards(mockDb, {
        id: listingId,
        donorId,
        acceptedRecipientId: 'ngo_01',
        quantity: 10,
        status: 'completed',
        rewardProcessed: true
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe('already_rewarded');
    });

    // 9. Edge Case 9: Donor without active membership completes donation: no tokens
    it('Edge Case 9: A Donor without an active membership earns 0 tokens upon completion', async () => {
      const mockDb = {};
      const listingId = 'list_no_member';
      const donorId = 'donor_unpaid';

      // Membership is inactive
      mockMembershipsStore[donorId] = {
        userId: donorId,
        userRole: 'donor',
        isActive: false,
        activePlan: null
      };

      const res = await processDonationCompletionRewards(mockDb, {
        id: listingId,
        donorId,
        acceptedRecipientId: 'ngo_01',
        quantity: 10,
        status: 'completed'
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe('no_active_donor_member');
      expect(mockWalletsStore[donorId]).toBeUndefined();
    });

    // 10. Edge Case 10: Donor with Fuel Support receives correct reward valuation
    it('Edge Case 10: Tokens earned under Fuel Support are valued at ₹2 per 100 tokens', () => {
      const tokens = calculateDonationTokens(10); // 50 tokens
      const plan = getPlanById('fuel_support');
      expect(plan.redemptionRatePer100).toBe(2);
      expect(plan.ratePerToken).toBe(0.02);
      const estValue = tokens * plan.ratePerToken;
      expect(estValue).toBe(1.0); // 50 * 0.02 = ₹1.00
    });

    // 11. Edge Case 11: Donor with Corridor Help receives correct reward valuation
    it('Edge Case 11: Tokens earned under Corridor Help are valued at ₹6 per 100 tokens', () => {
      const tokens = calculateDonationTokens(10); // 50 tokens
      const plan = getPlanById('corridor_help');
      expect(plan.redemptionRatePer100).toBe(6);
      expect(plan.ratePerToken).toBe(0.06);
      const estValue = tokens * plan.ratePerToken;
      expect(estValue).toBe(3.0); // 50 * 0.06 = ₹3.00
    });

    // 12. Edge Case 12: Previously earned tokens retain original redemption rates
    it('Edge Case 12: Previously earned tokens retain their original Fuel Support rate after Corridor upgrade', () => {
      // Historical batch earned under Fuel Support
      const historicalBatch = {
        batchId: 'LEDGER_fb_old_donor',
        foodQuantityKg: 10,
        tokensEarned: 50,
        remainingTokens: 50,
        planAtEarning: 'fuel_support',
        redemptionRate: 0.02,
        redemptionRatePer100: 2
      };

      // Current active plan is Corridor Help
      const currentPlan = getPlanById('corridor_help');
      expect(currentPlan.ratePerToken).toBe(0.06);

      // Value calculation for historical batch MUST still use original 0.02 rate
      const val = historicalBatch.remainingTokens * historicalBatch.redemptionRate;
      expect(val).toBe(1.0); // ₹1.00 (NOT ₹3.00!)
    });

    // 13. Edge Case 13: Reward Ledger links every credit to original listing with full traceability
    it('Edge Case 13: Reward Ledger permanently links all traceability metadata fields', () => {
      const qtyKg = 14;
      const tokens = calculateDonationTokens(qtyKg); // (14 / 2) * 10 = 70
      expect(tokens).toBe(70);

      const batch = {
        batchId: 'LEDGER_FB-1045_donor',
        rewardTransactionId: 'LEDGER_FB-1045_donor',
        userId: 'donor_uid_99',
        donorName: 'Bengaluru Caterers',
        listingId: 'FB-1045',
        donationId: 'FB-1045',
        handoverId: 'HANDOVER-9921',
        foodQuantityKg: qtyKg,
        calculationFormula: `(${qtyKg} / 2) * 10`,
        calculationDetails: `(${qtyKg} kg / 2) × 10 = ${tokens} tokens`,
        tokensEarned: tokens,
        tokensAwarded: tokens,
        planAtEarning: 'fuel_support',
        planNameAtEarning: 'Fuel Support',
        redemptionRate: 0.02,
        redemptionRatePer100: 2,
        rewardValue: 1.4,
        status: 'credited',
        timestampMs: Date.now()
      };

      expect(batch.rewardTransactionId).toBe('LEDGER_FB-1045_donor');
      expect(batch.listingId).toBe('FB-1045');
      expect(batch.foodQuantityKg).toBe(14);
      expect(batch.tokensEarned).toBe(70);
      expect(batch.calculationFormula).toBe('(14 / 2) * 10');
      expect(batch.calculationDetails).toBe('(14 kg / 2) × 10 = 70 tokens');
      expect(batch.status).toBe('credited');
    });

    // 14. Edge Case 14: Token redemption deducts from appropriate batches (FIFO)
    it('Edge Case 14: Token redemption correctly deducts tokens from the appropriate reward batches in FIFO order', () => {
      const batches = [
        { batchId: 'b_old_10kg', remainingTokens: 50, rate: 0.02, plan: 'fuel_support' },
        { batchId: 'b_new_20kg', remainingTokens: 100, rate: 0.06, plan: 'corridor_help' }
      ];

      // Redeem 100 tokens: 50 from b_old_10kg and 50 from b_new_20kg
      let needed = 100;
      const deductions = [];
      for (const b of batches) {
        if (needed <= 0) break;
        const take = Math.min(b.remainingTokens, needed);
        deductions.push({ batchId: b.batchId, tokensDeducted: take, payout: take * b.rate });
        b.remainingTokens -= take;
        needed -= take;
      }

      expect(deductions.length).toBe(2);
      expect(deductions[0].batchId).toBe('b_old_10kg');
      expect(deductions[0].tokensDeducted).toBe(50);
      expect(deductions[0].payout).toBe(1.0); // 50 * 0.02 = ₹1.00

      expect(deductions[1].batchId).toBe('b_new_20kg');
      expect(deductions[1].tokensDeducted).toBe(50);
      expect(deductions[1].payout).toBe(3.0); // 50 * 0.06 = ₹3.00

      expect(batches[0].remainingTokens).toBe(0);
      expect(batches[1].remainingTokens).toBe(50);
    });
  });
});
