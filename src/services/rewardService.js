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
  getDonorNgoPairKey
} from '../config/membershipConfig';
import { getUserMembership } from './membershipService';

/**
 * Evaluates and awards tokens for a successfully completed donation.
 *
 * Rules:
 * - Only triggered when donation status is 'completed'.
 * - Must have valid donorId and acceptedRecipientId.
 * - Idempotency: verified via listing.rewardProcessed flag and atomic transaction.
 * - Eligible roles: Donor (10 tokens) and NGO/Recipient (5 tokens).
 * - Couriers/delivery partners are completely excluded.
 * - Participant must have an ACTIVE membership at completion time.
 * - Global daily limit: first 5 reward-eligible donations per IST calendar day.
 * - Pair daily limit: max 2 reward-eligible donations per Donor-NGO pair per IST calendar day.
 * - Pair limit reached DOES NOT consume a global slot.
 * - Permanent plan-based valuation: tokens permanently record planAtEarning and redemptionRate.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} donation Listing document data
 * @returns {Promise<Object>}
 */
export async function processDonationCompletionRewards(dbInstance = db, donation) {
  if (!donation || !donation.id) {
    return { success: false, reason: 'invalid_donation' };
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

  // 2. Check memberships at this exact completion moment
  const [donorMem, recipientMem] = await Promise.all([
    getUserMembership(database, donorId),
    getUserMembership(database, recipientId)
  ]);

  const donorEligible = donorMem.isActive && Boolean(donorMem.canEarnTokens);
  const recipientEligible = recipientMem.isActive && Boolean(recipientMem.canEarnTokens);

  // If neither participant has an active membership with token benefits, no tokens to award
  if (!donorEligible && !recipientEligible) {
    try {
      await setDoc(doc(database, 'listings', donationId), {
        rewardProcessed: true,
        rewardEligibility: {
          status: 'no_active_members',
          donorEligible: false,
          recipientEligible: false,
          checkedAt: serverTimestamp()
        }
      }, { merge: true });
    } catch (e) {}
    return { success: false, reason: 'no_active_members', donationId };
  }

  const dateIST = getISTDateString(new Date());
  const pairKey = `${dateIST}_${getDonorNgoPairKey(donorId, recipientId)}`;

  const globalCounterRef = doc(database, 'dailyRewardCounters', dateIST);
  const pairCounterRef = doc(database, 'dailyPairRewardCounters', pairKey);
  const listingRef = doc(database, 'listings', donationId);

  // 3. Execute atomic transaction to prevent race conditions on daily limits
  try {
    const result = await runTransaction(database, async (transaction) => {
      // Re-read listing inside transaction for strict idempotency
      const listSnap = await transaction.get(listingRef);
      if (listSnap.exists() && listSnap.data().rewardProcessed) {
        return { success: false, reason: 'already_rewarded' };
      }

      // Read pair limit counter first
      const pairSnap = await transaction.get(pairCounterRef);
      const currentPairCount = pairSnap.exists() ? (pairSnap.data().rewardedDonationCount || 0) : 0;

      // Pair Limit Check: Max 2 donations per pair per IST day
      if (currentPairCount >= REWARD_RULES.PAIR_DAILY_LIMIT) {
        // Mark listing as processed without consuming global slot
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
      let donorTokensAwarded = 0;
      let recipientTokensAwarded = 0;

      // Award Donor Tokens (10 tokens) if Donor has active membership
      if (donorEligible) {
        donorTokensAwarded = REWARD_RULES.DONOR_REWARD_TOKENS;
        const donorRate = donorMem.planDetails.ratePerToken;
        const donorRatePer100 = donorMem.planDetails.redemptionRatePer100;
        const donorBatchId = `LEDGER_${timestampMs}_donor_${donationId}`;
        const donorLedgerRef = doc(database, 'rewardLedger', donorBatchId);

        transaction.set(donorLedgerRef, {
          batchId: donorBatchId,
          userId: donorId,
          role: 'donor',
          donationId,
          donationTitle: donation.title || 'Food Donation',
          tokensEarned: donorTokensAwarded,
          planAtEarning: donorMem.activePlan,
          planNameAtEarning: donorMem.planDetails.name,
          redemptionRate: donorRate,
          redemptionRatePer100: donorRatePer100,
          rewardValue: Math.round(donorTokensAwarded * donorRate * 100) / 100,
          redeemedTokens: 0,
          reservedTokens: 0,
          remainingTokens: donorTokensAwarded,
          timestampMs,
          createdAt: serverTimestamp()
        });

        const donorWalletRef = doc(database, 'wallets', donorId);
        const donorWalletSnap = await transaction.get(donorWalletRef);
        const dWallet = donorWalletSnap.exists() ? donorWalletSnap.data() : {};

        transaction.set(donorWalletRef, {
          userId: donorId,
          totalTokensEarned: (dWallet.totalTokensEarned || 0) + donorTokensAwarded,
          availableTokens: (dWallet.availableTokens || 0) + donorTokensAwarded,
          reservedTokens: dWallet.reservedTokens || 0,
          redeemedTokens: dWallet.redeemedTokens || 0,
          totalRedeemedValue: dWallet.totalRedeemedValue || 0,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Award NGO / Recipient Tokens (5 tokens) if NGO has active membership
      if (recipientEligible) {
        recipientTokensAwarded = REWARD_RULES.RECIPIENT_REWARD_TOKENS;
        const recipRate = recipientMem.planDetails.ratePerToken;
        const recipRatePer100 = recipientMem.planDetails.redemptionRatePer100;
        const recipBatchId = `LEDGER_${timestampMs}_recip_${donationId}`;
        const recipLedgerRef = doc(database, 'rewardLedger', recipBatchId);

        transaction.set(recipLedgerRef, {
          batchId: recipBatchId,
          userId: recipientId,
          role: 'recipient',
          donationId,
          donationTitle: donation.title || 'Food Donation',
          tokensEarned: recipientTokensAwarded,
          planAtEarning: recipientMem.activePlan,
          planNameAtEarning: recipientMem.planDetails.name,
          redemptionRate: recipRate,
          redemptionRatePer100: recipRatePer100,
          rewardValue: Math.round(recipientTokensAwarded * recipRate * 100) / 100,
          redeemedTokens: 0,
          reservedTokens: 0,
          remainingTokens: recipientTokensAwarded,
          timestampMs,
          createdAt: serverTimestamp()
        });

        const recipWalletRef = doc(database, 'wallets', recipientId);
        const recipWalletSnap = await transaction.get(recipWalletRef);
        const rWallet = recipWalletSnap.exists() ? recipWalletSnap.data() : {};

        transaction.set(recipWalletRef, {
          userId: recipientId,
          totalTokensEarned: (rWallet.totalTokensEarned || 0) + recipientTokensAwarded,
          availableTokens: (rWallet.availableTokens || 0) + recipientTokensAwarded,
          reservedTokens: rWallet.reservedTokens || 0,
          redeemedTokens: rWallet.redeemedTokens || 0,
          totalRedeemedValue: rWallet.totalRedeemedValue || 0,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Mark listing as rewarded
      transaction.set(listingRef, {
        rewardProcessed: true,
        rewardEligibility: {
          status: 'rewarded',
          dateIST,
          donorAwarded: donorEligible,
          donorTokens: donorTokensAwarded,
          recipientAwarded: recipientEligible,
          recipientTokens: recipientTokensAwarded,
          globalCount: newGlobalCount,
          pairCount: newPairCount,
          awardedAt: serverTimestamp()
        }
      }, { merge: true });

      return {
        success: true,
        dateIST,
        donorAwarded: donorEligible,
        donorTokens: donorTokensAwarded,
        recipientAwarded: recipientEligible,
        recipientTokens: recipientTokensAwarded,
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
