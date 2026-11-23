import {
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp
} from './firebase';
import { SUPPORT_PLANS, getPlanById } from '../config/membershipConfig';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MEMBERSHIP_DURATION_DAYS = 30;

/**
 * Checks whether a timestamp/date is currently active (greater than now).
 * @param {any} expiresAtDate
 * @returns {boolean}
 */
export function isMembershipActive(expiresAtDate) {
  if (!expiresAtDate) return false;
  const expTime = expiresAtDate instanceof Date
    ? expiresAtDate.getTime()
    : typeof expiresAtDate.toDate === 'function'
    ? expiresAtDate.toDate().getTime()
    : typeof expiresAtDate === 'number'
    ? expiresAtDate
    : new Date(expiresAtDate).getTime();

  return !isNaN(expTime) && expTime > Date.now();
}

/**
 * Retrieves a user's current membership document from Firestore and computes live validity.
 *
 * @param {Object} [dbInstance=db]
 * @param {string} userId
 * @returns {Promise<{
 *   exists: boolean,
 *   userId: string,
 *   activePlan: string|null,
 *   planDetails: Object|null,
 *   status: 'active'|'expired'|'none',
 *   isActive: boolean,
 *   activatedAt: Date|null,
 *   expiresAt: Date|null,
 *   daysRemaining: number,
 *   canEarnTokens: boolean,
 *   redemptionRatePer100: number
 * }>}
 */
export async function getUserMembership(dbInstance = db, userId) {
  if (!userId) {
    return {
      exists: false,
      userId: '',
      activePlan: null,
      planDetails: null,
      status: 'none',
      isActive: false,
      activatedAt: null,
      expiresAt: null,
      daysRemaining: 0,
      canEarnTokens: false,
      redemptionRatePer100: 0
    };
  }

  try {
    const memRef = doc(dbInstance || db, 'memberships', userId);
    const snap = await getDoc(memRef);

    if (!snap.exists()) {
      return {
        exists: false,
        userId,
        activePlan: null,
        planDetails: null,
        status: 'none',
        isActive: false,
        activatedAt: null,
        expiresAt: null,
        daysRemaining: 0,
        canEarnTokens: false,
        redemptionRatePer100: 0
      };
    }

    const data = snap.data();
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null);
    const activatedAt = data.activatedAt?.toDate ? data.activatedAt.toDate() : (data.activatedAt ? new Date(data.activatedAt) : null);

    const now = Date.now();
    const expTime = expiresAt ? expiresAt.getTime() : 0;
    const isActive = expTime > now;
    const status = isActive ? 'active' : 'expired';
    const daysRemaining = isActive ? Math.max(0, Math.ceil((expTime - now) / MS_PER_DAY)) : 0;

    const planDetails = getPlanById(data.activePlan);

    return {
      exists: true,
      userId,
      activePlan: data.activePlan || null,
      planDetails,
      status,
      isActive,
      activatedAt,
      expiresAt,
      daysRemaining,
      canEarnTokens: isActive && Boolean(planDetails?.canEarnTokens),
      redemptionRatePer100: planDetails?.redemptionRatePer100 || 0,
      latestTransactionId: data.latestTransactionId || null
    };
  } catch (err) {
    console.warn('Notice reading membership:', err.message);
    return {
      exists: false,
      userId,
      activePlan: null,
      planDetails: null,
      status: 'none',
      isActive: false,
      activatedAt: null,
      expiresAt: null,
      daysRemaining: 0,
      canEarnTokens: false,
      redemptionRatePer100: 0
    };
  }
}

/**
 * Real-time listener for user membership document.
 */
export function subscribeToUserMembership(dbInstance = db, userId, callback) {
  if (!userId) {
    callback(null);
    return () => {};
  }

  const memRef = doc(dbInstance || db, 'memberships', userId);
  return onSnapshot(
    memRef,
    (snap) => {
      if (!snap.exists()) {
        callback({
          exists: false,
          userId,
          activePlan: null,
          planDetails: null,
          status: 'none',
          isActive: false,
          daysRemaining: 0
        });
        return;
      }

      const data = snap.data();
      const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null);
      const activatedAt = data.activatedAt?.toDate ? data.activatedAt.toDate() : (data.activatedAt ? new Date(data.activatedAt) : null);

      const now = Date.now();
      const expTime = expiresAt ? expiresAt.getTime() : 0;
      const isActive = expTime > now;
      const status = isActive ? 'active' : 'expired';
      const daysRemaining = isActive ? Math.max(0, Math.ceil((expTime - now) / MS_PER_DAY)) : 0;
      const planDetails = getPlanById(data.activePlan);

      callback({
        exists: true,
        userId,
        activePlan: data.activePlan || null,
        planDetails,
        status,
        isActive,
        activatedAt,
        expiresAt,
        daysRemaining,
        canEarnTokens: isActive && Boolean(planDetails?.canEarnTokens),
        redemptionRatePer100: planDetails?.redemptionRatePer100 || 0,
        latestTransactionId: data.latestTransactionId || null
      });
    },
    (err) => {
      console.warn('Membership subscription error notice:', err.message);
    }
  );
}

/**
 * Processes a simulated support contribution.
 *
 * Workflows:
 * - Coffee (₹50): creates transaction record, no membership activation.
 * - Fuel Support (₹100) / Corridor Help (₹250): creates transaction record, activates or extends 30-day membership.
 * - Renewal before expiry: extends existing expiry by 30 days from current expiry.
 * - Renewal after expiry: sets expiry to 30 days from now.
 * - Upgraded/new plan becomes active plan immediately.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.userEmail]
 * @param {string} [params.userName]
 * @param {string} params.planId 'coffee' | 'fuel_support' | 'corridor_help'
 * @param {number} [params.customAmount]
 * @returns {Promise<Object>}
 */
export async function processSimulatedSupportPayment(dbInstance = db, {
  userId,
  userEmail = '',
  userName = 'Community Supporter',
  planId,
  customAmount = null
}) {
  if (!userId) throw new Error('User must be authenticated to contribute');
  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Invalid support plan: "${planId}"`);

  const amount = Number(customAmount) || plan.amount;
  const now = new Date();
  const txId = `TXN_DEMO_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const database = dbInstance || db;

  // 1. Record support contribution transaction
  const txRef = doc(database, 'supportTransactions', txId);
  const txData = {
    transactionId: txId,
    userId,
    userEmail: userEmail || '',
    userName: userName || 'Community Supporter',
    planId: plan.id,
    planName: plan.name,
    amount,
    currency: 'INR',
    paymentStatus: 'completed',
    paymentMethod: 'simulated_demo',
    isDemo: true,
    activatesMembership: plan.activatesMembership,
    createdAt: serverTimestamp(),
    timestampMs: now.getTime()
  };

  await setDoc(txRef, txData);

  // 2. If plan activates membership, update or extend the user's membership document
  let newExpiresAt = null;
  if (plan.activatesMembership) {
    const memRef = doc(database, 'memberships', userId);
    const existingSnap = await getDoc(memRef);

    let baseTime = now.getTime();

    if (existingSnap.exists()) {
      const existing = existingSnap.data();
      const existingExp = existing.expiresAt?.toDate
        ? existing.expiresAt.toDate().getTime()
        : existing.expiresAt ? new Date(existing.expiresAt).getTime() : 0;

      // If existing membership is currently active, extend from existing expiry date!
      if (existingExp > baseTime) {
        baseTime = existingExp;
      }
    }

    // 30 days extension from the later of current expiry or now
    newExpiresAt = new Date(baseTime + (MEMBERSHIP_DURATION_DAYS * MS_PER_DAY));

    const membershipData = {
      userId,
      activePlan: plan.id,
      planName: plan.name,
      status: 'active',
      activatedAt: serverTimestamp(),
      expiresAt: newExpiresAt,
      latestTransactionId: txId,
      updatedAt: serverTimestamp()
    };

    await setDoc(memRef, membershipData, { merge: true });
  }

  return {
    success: true,
    transactionId: txId,
    amount,
    plan,
    membershipActivated: plan.activatesMembership,
    expiresAt: newExpiresAt
  };
}

/**
 * Queries support contribution transactions.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} [options]
 * @param {string} [options.userId] Filter by user
 * @param {number} [options.limitCount=50]
 * @returns {Promise<Array<Object>>}
 */
export async function getSupportTransactions(dbInstance = db, { userId = null, limitCount = 50 } = {}) {
  try {
    const col = collection(dbInstance || db, 'supportTransactions');
    let q;

    if (userId) {
      q = query(col, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(limitCount));
    } else {
      q = query(col, orderBy('createdAt', 'desc'), limit(limitCount));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Notice fetching support transactions:', err.message);
    // Fallback: query without compound index if needed
    try {
      const col = collection(dbInstance || db, 'supportTransactions');
      const snap = await getDocs(query(col, limit(limitCount)));
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (userId) {
        docs = docs.filter((d) => d.userId === userId);
      }
      return docs.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
    } catch (e2) {
      return [];
    }
  }
}
