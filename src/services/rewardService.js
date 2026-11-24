import { runTransaction } from 'firebase/firestore';
import {
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from './firebase';
import {
  SUPPORT_PLANS,
  REWARD_RULES,
  getPlanById,
  getISTDateString,
  getDonorNgoPairKey,
  calculateDonationTokens
} from '../config/membershipConfig';
import { getUserMembership } from './membershipService';

/**
 * Extracts and normalizes food quantity in kilograms from donation data.
 * Supports explicit kg, grams, meal portions (0.4 kg/meal), or actual handover weight.
 *
 * @param {Object} donation
 * @returns {number} Quantity in kilograms
 */
export function extractDonationQuantityKg(donation) {
  if (!donation) return 0;
  // If actual verified handover weight was recorded (e.g. partial or weighed handover)
  if (typeof donation.actualHandoverKg === 'number' && donation.actualHandoverKg > 0) {
    return donation.actualHandoverKg;
  }
  if (typeof donation.foodQuantityKg === 'number' && donation.foodQuantityKg > 0) {
    return donation.foodQuantityKg;
  }
  if (typeof donation.weightKg === 'number' && donation.weightKg > 0) {
    return donation.weightKg;
  }
  if (typeof donation.quantityKg === 'number' && donation.quantityKg > 0) {
    return donation.quantityKg;
  }

  const rawQty = Number(donation.quantity ?? donation.foodQuantity ?? 0);
  if (isNaN(rawQty) || rawQty <= 0) return 0;

  const unit = (donation.unit || 'kg').toLowerCase().trim();
  if (unit === 'kg') return rawQty;
  if (unit === 'g' || unit === 'grams') return Math.round((rawQty / 1000) * 100) / 100;
  if (unit === 'meals' || unit === 'servings' || unit === 'portions') {
    // FSSAI / FAO baseline: 1 standard meal portion = 0.4 kg
    return Math.round(rawQty * 0.4 * 100) / 100;
  }
  if (unit === 'liters' || unit === 'l') {
    // 1 liter liquid food ~= 1 kg
    return rawQty;
  }
  // Default fallback to numeric quantity as kg
  return rawQty;
}

/**
 * Evaluates and awards tokens for a successfully completed donation.
 *
 * Rules:
 * - Only triggered when donation handover reaches final COMPLETED state.
 * - Never credited when created, published, accepted, matched, in-transit, or cancelled.
 * - Quantity-based reward formula: Tokens Earned = (Food Quantity in KG / 2) * 10.
 * - Must have valid donorId and acceptedRecipientId.
 * - Idempotency: verified via listing.rewardProcessed flag and deterministic ledger doc ID.
 * - Eligible roles: Exclusively Donors with an ACTIVE membership.
 * - Couriers and NGOs/Recipients receive 0 tokens.
 * - Global daily limit: first 5 reward-eligible donations per IST calendar day.
 * - Pair daily limit: max 2 reward-eligible donations per Donor-NGO pair per IST calendar day.
 * - Pair limit reached DOES NOT consume a global slot.
 * - Permanent plan-based valuation: tokens permanently record planAtEarning and redemptionRate.
 * - Permanent traceability: links donor, listing, quantity, calculation formula, and timestamp.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} donation Listing document data
 * @returns {Promise<Object>}
 */
export async function processDonationCompletionRewards(dbInstance = db, donation) {
  if (!donation || !donation.id) {
    return { success: false, reason: 'invalid_donation' };
  }

  // Guard: tokens must NOT be credited unless handover is COMPLETED
  if (donation.status && donation.status !== 'completed') {
    return { success: false, reason: 'handover_not_completed', status: donation.status };
  }

  const database = dbInstance || db;
  const donationId = donation.id;
  const donorId = donation.donorId;
  const recipientId = donation.acceptedRecipientId || donation.recipientId;

  if (!donorId || !recipientId) {
    return { success: false, reason: 'missing_participants' };
  }

  // 1. Check if already processed (fast-path check)
  if (donation.rewardProcessed) {
    return { success: false, reason: 'already_rewarded', donationId };
  }

  // 2. Check Donor membership at this exact completion moment (Recipient does not need membership)
  const donorMem = await getUserMembership(database, donorId);
  const donorEligible = donorMem.isActive && Boolean(donorMem.canEarnTokens);

  // If Donor does not have an active membership with token benefits, no tokens to award
  if (!donorEligible) {
    try {
      await setDoc(doc(database, 'listings', donationId), {
        rewardProcessed: true,
        rewardEligibility: {
          status: 'no_active_donor_member',
          donorEligible: false,
          checkedAt: serverTimestamp()
        }
      }, { merge: true });
    } catch (e) {}
    return { success: false, reason: 'no_active_donor_member', donationId };
  }

  const dateIST = getISTDateString(new Date());
  const pairKey = `${dateIST}_${getDonorNgoPairKey(donorId, recipientId)}`;

  const globalCounterRef = doc(database, 'dailyRewardCounters', dateIST);
  const pairCounterRef = doc(database, 'dailyPairRewardCounters', pairKey);
  const listingRef = doc(database, 'listings', donationId);

  // Deterministic batch ID enforces idempotency at the database storage layer
  const donorBatchId = `LEDGER_${donationId}_donor`;
  const donorLedgerRef = doc(database, 'rewardLedger', donorBatchId);

  // 3. Execute atomic transaction to prevent race conditions and duplicate rewards
  try {
    const result = await runTransaction(database, async (transaction) => {
      // Re-read listing inside transaction for strict status & idempotency
      const listSnap = await transaction.get(listingRef);
      if (!listSnap.exists()) {
        return { success: false, reason: 'listing_not_found' };
      }

      const listData = listSnap.data();

      // Ensure donation is strictly completed in database
      if (listData.status !== 'completed' && donation.status !== 'completed') {
        return { success: false, reason: 'handover_not_completed', currentStatus: listData.status };
      }

      // Check listing rewardProcessed flag
      if (listData.rewardProcessed) {
        return { success: false, reason: 'already_rewarded' };
      }

      // Check deterministic ledger document for absolute duplicate prevention
      const existingLedgerSnap = await transaction.get(donorLedgerRef);
      if (existingLedgerSnap.exists()) {
        return { success: false, reason: 'already_rewarded', batchId: donorBatchId };
      }

      // Read food quantity and compute tokens
      const foodQuantityKg = extractDonationQuantityKg(listData.quantity != null ? listData : donation);
      const donorTokensAwarded = calculateDonationTokens(foodQuantityKg);

      if (donorTokensAwarded <= 0) {
        transaction.set(listingRef, {
          rewardProcessed: true,
          rewardEligibility: {
            status: 'zero_quantity_no_tokens',
            foodQuantityKg,
            checkedAt: serverTimestamp()
          }
        }, { merge: true });
        return { success: false, reason: 'zero_quantity_no_tokens', foodQuantityKg };
      }

      // Read pair limit counter first
      const pairSnap = await transaction.get(pairCounterRef);
      const currentPairCount = pairSnap.exists() ? (pairSnap.data().rewardedDonationCount || 0) : 0;

      // Pair Limit Check: Max 2 donations per pair per IST day
      if (currentPairCount >= REWARD_RULES.PAIR_DAILY_LIMIT) {
        transaction.set(listingRef, {
          rewardProcessed: true,
          rewardEligibility: {
            status: 'pair_limit_exceeded',
            dateIST,
            pairCount: currentPairCount,
            limit: REWARD_RULES.PAIR_DAILY_LIMIT
          }
        }, { merge: true });
        return { success: false, reason: 'pair_limit_exceeded', dateIST, currentPairCount };
      }

      // Read global limit counter
      const globalSnap = await transaction.get(globalCounterRef);
      const currentGlobalCount = globalSnap.exists() ? (globalSnap.data().totalRewardedDonations || 0) : 0;

      // Global Limit Check: First 5 donations platform-wide per IST day
      if (currentGlobalCount >= REWARD_RULES.GLOBAL_DAILY_LIMIT) {
        transaction.set(listingRef, {
          rewardProcessed: true,
          rewardEligibility: {
            status: 'global_limit_exceeded',
            dateIST,
            globalCount: currentGlobalCount,
            limit: REWARD_RULES.GLOBAL_DAILY_LIMIT
          }
        }, { merge: true });
        return { success: false, reason: 'global_limit_exceeded', dateIST, currentGlobalCount };
      }

      // Both limits satisfied! Increment counters
      const newGlobalCount = currentGlobalCount + 1;
      const newPairCount = currentPairCount + 1;

      transaction.set(globalCounterRef, {
        dateIST,
        totalRewardedDonations: newGlobalCount,
        updatedAt: serverTimestamp()
      }, { merge: true });

      transaction.set(pairCounterRef, {
        dateIST,
        donorId,
        ngoId: recipientId,
        pairKey: getDonorNgoPairKey(donorId, recipientId),
        rewardedDonationCount: newPairCount,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const now = new Date();
      const timestampMs = now.getTime();

      // Award Donor Tokens based on quantity: (kg / 2) * 10
      const donorRate = donorMem.planDetails.ratePerToken;
      const donorRatePer100 = donorMem.planDetails.redemptionRatePer100;
      const donorName = donation.donorName || listData.donorName || donation.contactPerson || listData.contactPerson || 'Donor';
      const calculationFormula = `(${foodQuantityKg} / 2) * 10`;
      const calculationDetails = `(${foodQuantityKg} kg / 2) × 10 = ${donorTokensAwarded} tokens`;

      // Complete traceability linkage in rewardLedger
      transaction.set(donorLedgerRef, {
        batchId: donorBatchId,
        rewardTransactionId: donorBatchId,
        userId: donorId,
        donorName,
        role: 'donor',
        listingId: donationId,
        donationId,
        handoverId: donation.handoverId || listData.handoverId || donationId,
        donationTitle: donation.title || listData.title || 'Food Donation',
        foodQuantityKg,
        calculationFormula,
        calculationDetails,
        tokensEarned: donorTokensAwarded,
        tokensAwarded: donorTokensAwarded,
        planAtEarning: donorMem.activePlan,
        planNameAtEarning: donorMem.planDetails.name,
        redemptionRate: donorRate,
        redemptionRatePer100: donorRatePer100,
        rewardValue: Math.round(donorTokensAwarded * donorRate * 100) / 100,
        redeemedTokens: 0,
        reservedTokens: 0,
        remainingTokens: donorTokensAwarded,
        status: 'credited',
        timestampMs,
        createdAt: serverTimestamp()
      });

      const donorWalletRef = doc(database, 'wallets', donorId);
      const donorWalletSnap = await transaction.get(donorWalletRef);
      const dWallet = donorWalletSnap.exists() ? donorWalletSnap.data() : {};

      transaction.set(donorWalletRef, {
        userId: donorId,
        userRole: 'donor',
        totalTokensEarned: (dWallet.totalTokensEarned || 0) + donorTokensAwarded,
        availableTokens: (dWallet.availableTokens || 0) + donorTokensAwarded,
        reservedTokens: dWallet.reservedTokens || 0,
        redeemedTokens: dWallet.redeemedTokens || 0,
        totalRedeemedValue: dWallet.totalRedeemedValue || 0,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Mark listing as rewarded with full traceability data
      transaction.set(listingRef, {
        rewardProcessed: true,
        rewardEligibility: {
          status: 'rewarded',
          dateIST,
          donorAwarded: true,
          donorTokens: donorTokensAwarded,
          foodQuantityKg,
          calculationFormula,
          calculationDetails,
          recipientAwarded: false,
          recipientTokens: 0,
          globalCount: newGlobalCount,
          pairCount: newPairCount,
          batchId: donorBatchId,
          awardedAt: serverTimestamp()
        }
      }, { merge: true });

      return {
        success: true,
        dateIST,
        donorAwarded: true,
        donorTokens: donorTokensAwarded,
        foodQuantityKg,
        calculationFormula,
        batchId: donorBatchId,
        recipientAwarded: false,
        recipientTokens: 0,
        globalCount: newGlobalCount,
        pairCount: newPairCount
      };
    });

    return result;
  } catch (err) {
    console.error('Error processing donation completion rewards:', err);
    return { success: false, reason: 'transaction_error', error: err.message };
  }
}
