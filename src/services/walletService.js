import { runTransaction } from 'firebase/firestore';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp
} from './firebase';
import { REWARD_RULES, SUPPORT_PLANS } from '../config/membershipConfig';
import { getUserMembership } from './membershipService';

/**
 * Retrieves the complete wallet profile for a user, including token aggregates,
 * individual FIFO reward batches, plan distribution, and estimated redeemable ₹ value.
 *
 * @param {Object} [dbInstance=db]
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getUserWallet(dbInstance = db, userId) {
  if (!userId) {
    return {
      userId: '',
      totalTokensEarned: 0,
      availableTokens: 0,
      reservedTokens: 0,
      redeemedTokens: 0,
      totalRedeemedValue: 0,
      estimatedRedeemableValue: 0,
      batches: [],
      batchesByPlan: {
        fuel_support: { planName: 'Fuel Support', tokensEarned: 0, remainingTokens: 0, valueINR: 0, ratePer100: 2 },
        corridor_help: { planName: 'Corridor Help', tokensEarned: 0, remainingTokens: 0, valueINR: 0, ratePer100: 6 }
      },
      membership: null
    };
  }

  const database = dbInstance || db;

  try {
    // 1. Fetch wallet doc, ledger batches, and current membership in parallel
    const walletRef = doc(database, 'wallets', userId);
    const ledgerQuery = query(collection(database, 'rewardLedger'), where('userId', '==', userId));

    const [walletSnap, ledgerSnap, membership] = await Promise.all([
      getDoc(walletRef),
      getDocs(ledgerQuery).catch(() => ({ docs: [] })),
      getUserMembership(database, userId)
    ]);

    const walletData = walletSnap.exists() ? walletSnap.data() : {};

    // 2. Parse reward ledger batches (FIFO sorted by timestampMs asc)
    const batches = ledgerSnap.docs
      ? ledgerSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      : [];

    batches.sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

    // 3. Compute plan-based valuation and batch grouping
    let estimatedRedeemableValue = 0;
    const batchesByPlan = {
      fuel_support: {
        planName: 'Fuel Support',
        tokensEarned: 0,
        redeemedTokens: 0,
        reservedTokens: 0,
        remainingTokens: 0,
        valueINR: 0,
        ratePer100: 2
      },
      corridor_help: {
        planName: 'Corridor Help',
        tokensEarned: 0,
        redeemedTokens: 0,
        reservedTokens: 0,
        remainingTokens: 0,
        valueINR: 0,
        ratePer100: 6
      }
    };

    for (const batch of batches) {
      const remaining = Number(batch.remainingTokens) || 0;
      const rate = Number(batch.redemptionRate) || 0;
      const batchValue = remaining * rate;
      estimatedRedeemableValue += batchValue;

      const planKey = batch.planAtEarning === 'corridor_help' ? 'corridor_help' : 'fuel_support';
      if (batchesByPlan[planKey]) {
        batchesByPlan[planKey].tokensEarned += Number(batch.tokensEarned) || 0;
        batchesByPlan[planKey].redeemedTokens += Number(batch.redeemedTokens) || 0;
        batchesByPlan[planKey].reservedTokens += Number(batch.reservedTokens) || 0;
        batchesByPlan[planKey].remainingTokens += remaining;
        batchesByPlan[planKey].valueINR += batchValue;
      }
    }

    // Round monetary value to 2 decimal places
    estimatedRedeemableValue = Math.round(estimatedRedeemableValue * 100) / 100;
    batchesByPlan.fuel_support.valueINR = Math.round(batchesByPlan.fuel_support.valueINR * 100) / 100;
    batchesByPlan.corridor_help.valueINR = Math.round(batchesByPlan.corridor_help.valueINR * 100) / 100;

    return {
      userId,
      totalTokensEarned: walletData.totalTokensEarned || 0,
      availableTokens: walletData.availableTokens || 0,
      reservedTokens: walletData.reservedTokens || 0,
      redeemedTokens: walletData.redeemedTokens || 0,
      totalRedeemedValue: Math.round((walletData.totalRedeemedValue || 0) * 100) / 100,
      estimatedRedeemableValue,
      batches,
      batchesByPlan,
      membership
    };
  } catch (err) {
    console.warn('Notice reading user wallet:', err.message);
    return {
      userId,
      totalTokensEarned: 0,
      availableTokens: 0,
      reservedTokens: 0,
      redeemedTokens: 0,
      totalRedeemedValue: 0,
      estimatedRedeemableValue: 0,
      batches: [],
      batchesByPlan: {
        fuel_support: { planName: 'Fuel Support', tokensEarned: 0, remainingTokens: 0, valueINR: 0, ratePer100: 2 },
        corridor_help: { planName: 'Corridor Help', tokensEarned: 0, remainingTokens: 0, valueINR: 0, ratePer100: 6 }
      },
      membership: null
    };
  }
}

/**
 * Real-time subscription to user wallet document.
 */
export function subscribeToUserWallet(dbInstance = db, userId, callback) {
  if (!userId) {
    callback(null);
    return () => {};
  }
  const walletRef = doc(dbInstance || db, 'wallets', userId);
  return onSnapshot(walletRef, async (snap) => {
    // Re-fetch aggregate when wallet changes
    const fullWallet = await getUserWallet(dbInstance, userId);
    callback(fullWallet);
  });
}

/**
 * Creates a token redemption request using strict FIFO deduction across reward batches.
 *
 * Rules:
 * - User must have an active membership. Expired members cannot redeem.
 * - Minimum redemption: 100 tokens, in multiples of 100.
 * - Cannot redeem more tokens than available.
 * - Deducts from oldest available reward batches first (FIFO).
 * - Exact payout is calculated from each batch's original redemption rate.
 * - Tokens are moved to reservedTokens in both wallet and batches.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.tokensToRedeem
 * @param {string} params.upiId
 * @returns {Promise<Object>}
 */
export async function requestTokenRedemption(dbInstance = db, {
  userId,
  tokensToRedeem,
  upiId
}) {
  if (!userId) throw new Error('User must be authenticated to redeem tokens');

  const count = Number(tokensToRedeem);
  if (isNaN(count) || count < REWARD_RULES.MIN_REDEMPTION_TOKENS) {
    throw new Error(`Minimum redemption is ${REWARD_RULES.MIN_REDEMPTION_TOKENS} tokens`);
  }
  if (count % 100 !== 0) {
    throw new Error('Redemption quantity must be in multiples of 100 tokens');
  }

  const cleanUpi = (upiId || '').trim();
  if (!cleanUpi || !cleanUpi.includes('@')) {
    throw new Error('Please enter a valid UPI ID (e.g. username@okhdfcbank)');
  }

  const database = dbInstance || db;

  // 1. Verify Active Membership
  const membership = await getUserMembership(database, userId);
  if (!membership.isActive) {
    throw new Error('Active membership required to redeem tokens. Please renew your support membership.');
  }

  // 2. Fetch available reward batches (FIFO ordered by timestampMs asc)
  const ledgerQuery = query(collection(database, 'rewardLedger'), where('userId', '==', userId));
  const ledgerSnap = await getDocs(ledgerQuery);
  const batches = ledgerSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => (b.remainingTokens || 0) > 0)
    .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

  const totalRemainingInBatches = batches.reduce((sum, b) => sum + (b.remainingTokens || 0), 0);
  if (totalRemainingInBatches < count) {
    throw new Error(`Insufficient available tokens in reward ledger. Available: ${totalRemainingInBatches}, Requested: ${count}`);
  }

  // 3. FIFO Allocation Calculation
  let needed = count;
  const batchAllocations = [];
  let totalCalculatedAmount = 0;

  for (const batch of batches) {
    if (needed <= 0) break;
    const take = Math.min(batch.remainingTokens, needed);
    const rate = Number(batch.redemptionRate) || 0;
    const payout = Math.round(take * rate * 100) / 100;

    batchAllocations.push({
      batchId: batch.batchId || batch.id,
      planAtEarning: batch.planAtEarning,
      planNameAtEarning: batch.planNameAtEarning || batch.planAtEarning,
      redemptionRate: rate,
      redemptionRatePer100: batch.redemptionRatePer100 || (rate * 100),
      tokensDeducted: take,
      amountINR: payout
    });

    totalCalculatedAmount += payout;
    needed -= take;
  }

  if (needed > 0) {
    throw new Error('Unable to fully allocate tokens across reward batches');
  }

  totalCalculatedAmount = Math.round(totalCalculatedAmount * 100) / 100;
  const requestId = `RED_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // 4. Atomic Firestore Transaction: Reserve tokens and create redemption request
  const walletRef = doc(database, 'wallets', userId);
  const requestRef = doc(database, 'redemptionRequests', requestId);

  await runTransaction(database, async (transaction) => {
    // Check wallet balance inside transaction
    const wSnap = await transaction.get(walletRef);
    if (!wSnap.exists()) throw new Error('Wallet not initialized');
    const wData = wSnap.data();

    const currentAvail = wData.availableTokens || 0;
    if (currentAvail < count) {
      throw new Error(`Insufficient wallet tokens. Available: ${currentAvail}, Requested: ${count}`);
    }

    // Reserve wallet tokens
    transaction.update(walletRef, {
      availableTokens: currentAvail - count,
      reservedTokens: (wData.reservedTokens || 0) + count,
      updatedAt: serverTimestamp()
    });

    // Update each ledger batch to reserve tokens
    for (const alloc of batchAllocations) {
      const bRef = doc(database, 'rewardLedger', alloc.batchId);
      const bSnap = await transaction.get(bRef);
      if (bSnap.exists()) {
        const bData = bSnap.data();
        const rem = bData.remainingTokens || 0;
        const res = bData.reservedTokens || 0;
        transaction.update(bRef, {
          remainingTokens: Math.max(0, rem - alloc.tokensDeducted),
          reservedTokens: res + alloc.tokensDeducted,
          updatedAt: serverTimestamp()
        });
      }
    }

    // Create redemption request record
    transaction.set(requestRef, {
      requestId,
      userId,
      requestedTokens: count,
      calculatedAmount: totalCalculatedAmount,
      currency: 'INR',
      upiId: cleanUpi,
      batchAllocations,
      status: 'pending', // 'pending' | 'approved' | 'rejected' | 'paid'
      createdAt: serverTimestamp(),
      timestampMs: Date.now()
    });
  });

  return {
    success: true,
    requestId,
    requestedTokens: count,
    calculatedAmount: totalCalculatedAmount,
    batchAllocations,
    status: 'pending'
  };
}

/**
 * Queries redemption requests for a user or across the platform (for admins).
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} [options]
 * @param {string} [options.userId] Filter by user
 * @param {string} [options.status] Filter by status ('pending'|'approved'|'rejected'|'paid')
 * @param {number} [options.limitCount=50]
 * @returns {Promise<Array<Object>>}
 */
export async function getRedemptionRequests(dbInstance = db, { userId = null, status = null, limitCount = 50 } = {}) {
  try {
    const col = collection(dbInstance || db, 'redemptionRequests');
    let q;

    if (userId && status) {
      q = query(col, where('userId', '==', userId), where('status', '==', status), limit(limitCount));
    } else if (userId) {
      q = query(col, where('userId', '==', userId), limit(limitCount));
    } else if (status) {
      q = query(col, where('status', '==', status), limit(limitCount));
    } else {
      q = query(col, limit(limitCount));
    }

    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  } catch (err) {
    console.warn('Notice fetching redemption requests:', err.message);
    return [];
  }
}

/**
 * Admin Action: Approves a pending redemption request.
 */
export async function approveRedemptionRequest(dbInstance = db, requestId, adminUid) {
  const reqRef = doc(dbInstance || db, 'redemptionRequests', requestId);
  await updateDoc(reqRef, {
    status: 'approved',
    reviewedBy: adminUid || 'admin',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { success: true, requestId, status: 'approved' };
}

/**
 * Admin Action: Marks an approved/pending request as PAID (Simulated demo payout).
 * Deducts reserved tokens permanently and credits redeemed tokens in wallet and batches.
 */
export async function markRedemptionAsPaid(dbInstance = db, requestId, adminUid, { transactionRef = '' } = {}) {
  const database = dbInstance || db;
  const reqRef = doc(database, 'redemptionRequests', requestId);

  await runTransaction(database, async (transaction) => {
    const rSnap = await transaction.get(reqRef);
    if (!rSnap.exists()) throw new Error('Redemption request not found');
    const req = rSnap.data();

    if (req.status === 'paid') return; // Already paid
    if (req.status === 'rejected') throw new Error('Cannot mark a rejected request as paid');

    const userId = req.userId;
    const tokens = req.requestedTokens;
    const amount = req.calculatedAmount;
    const allocations = req.batchAllocations || [];

    // 1. Update wallet: move from reservedTokens to redeemedTokens, update totalRedeemedValue
    const walletRef = doc(database, 'wallets', userId);
    const wSnap = await transaction.get(walletRef);
    if (wSnap.exists()) {
      const wData = wSnap.data();
      transaction.update(walletRef, {
        reservedTokens: Math.max(0, (wData.reservedTokens || 0) - tokens),
        redeemedTokens: (wData.redeemedTokens || 0) + tokens,
        totalRedeemedValue: (wData.totalRedeemedValue || 0) + amount,
        updatedAt: serverTimestamp()
      });
    }

    // 2. Update each ledger batch: move from reservedTokens to redeemedTokens
    for (const alloc of allocations) {
      const bRef = doc(database, 'rewardLedger', alloc.batchId);
      const bSnap = await transaction.get(bRef);
      if (bSnap.exists()) {
        const bData = bSnap.data();
        transaction.update(bRef, {
          reservedTokens: Math.max(0, (bData.reservedTokens || 0) - alloc.tokensDeducted),
          redeemedTokens: (bData.redeemedTokens || 0) + alloc.tokensDeducted,
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3. Mark request as PAID
    transaction.update(reqRef, {
      status: 'paid',
      paidBy: adminUid || 'admin',
      paidAt: serverTimestamp(),
      transactionRef: transactionRef || `PAY_DEMO_${Date.now()}`,
      updatedAt: serverTimestamp()
    });
  });

  return { success: true, requestId, status: 'paid' };
}

/**
 * Admin Action: Rejects a redemption request with a reason.
 * Returns reserved tokens back to available in wallet and back to remainingTokens in original batches!
 */
export async function rejectRedemptionRequest(dbInstance = db, requestId, adminUid, reason = 'Administrative decision') {
  const database = dbInstance || db;
  const reqRef = doc(database, 'redemptionRequests', requestId);

  await runTransaction(database, async (transaction) => {
    const rSnap = await transaction.get(reqRef);
    if (!rSnap.exists()) throw new Error('Redemption request not found');
    const req = rSnap.data();

    if (req.status === 'rejected') return; // Already rejected
    if (req.status === 'paid') throw new Error('Cannot reject a request that has already been marked as paid');

    const userId = req.userId;
    const tokens = req.requestedTokens;
    const allocations = req.batchAllocations || [];

    // 1. Restore wallet: return reservedTokens back to availableTokens
    const walletRef = doc(database, 'wallets', userId);
    const wSnap = await transaction.get(walletRef);
    if (wSnap.exists()) {
      const wData = wSnap.data();
      transaction.update(walletRef, {
        availableTokens: (wData.availableTokens || 0) + tokens,
        reservedTokens: Math.max(0, (wData.reservedTokens || 0) - tokens),
        updatedAt: serverTimestamp()
      });
    }

    // 2. Return tokens to their original reward batches (preserving valuation!)
    for (const alloc of allocations) {
      const bRef = doc(database, 'rewardLedger', alloc.batchId);
      const bSnap = await transaction.get(bRef);
      if (bSnap.exists()) {
        const bData = bSnap.data();
        transaction.update(bRef, {
          remainingTokens: (bData.remainingTokens || 0) + alloc.tokensDeducted,
          reservedTokens: Math.max(0, (bData.reservedTokens || 0) - alloc.tokensDeducted),
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3. Update request status to rejected with reason
    transaction.update(reqRef, {
      status: 'rejected',
      rejectionReason: reason || 'Redemption rejected by administrator',
      reviewedBy: adminUid || 'admin',
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  return { success: true, requestId, status: 'rejected' };
}
