import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
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
 * Parses any date, Firestore timestamp, or timestamp number into a JavaScript Date.
 * @param {any} dateValue
 * @returns {Date|null}
 */
export function parseDate(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue.toDate === 'function') return dateValue.toDate();
  if (typeof dateValue === 'number') return new Date(dateValue);
  const parsed = new Date(dateValue);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Checks whether a timestamp/date is currently active (greater than now).
 * @param {any} expiresAtDate
 * @returns {boolean}
 */
export function isMembershipActive(expiresAtDate) {
  if (!expiresAtDate) return false;
  const parsed = parseDate(expiresAtDate);
  return parsed ? parsed.getTime() > Date.now() : false;
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
      totalStackExpiry: null,
      totalStackDaysRemaining: 0,
      activePeriod: null,
      upcomingPeriods: [],
      allPeriods: [],
      canEarnTokens: false,
      redemptionRatePer100: 0,
      isCancelled: false,
      cancellationEffectiveDate: null
    };
  }

  const database = dbInstance || db;

  try {
    const now = Date.now();

    // 1. Fetch stacked periods for this user
    let periods = [];
    try {
      const pCol = collection(database, 'membershipPeriods');
      const pSnap = await getDocs(query(pCol, where('userId', '==', userId)));
      periods = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      periods = [];
    }

    // 2. If periods exist in membershipPeriods collection, evaluate programmatically
    if (periods.length > 0) {
      periods.sort((a, b) => {
        const tA = parseDate(a.startDate)?.getTime() || a.timestampMs || 0;
        const tB = parseDate(b.startDate)?.getTime() || b.timestampMs || 0;
        return tA - tB;
      });

      const evaluatedPeriods = periods.map((p) => {
        const start = parseDate(p.startDate);
        const exp = parseDate(p.expiryDate);
        const startTime = start ? start.getTime() : 0;
        const expTime = exp ? exp.getTime() : 0;
        const isCancelled = Boolean(p.isCancelled || p.status === 'cancelled' || p.status === 'active_cancelled');

        let computedStatus = p.status || 'active';
        if (p.status === 'cancelled') {
          computedStatus = 'cancelled';
        } else if (now >= startTime && now < expTime) {
          computedStatus = isCancelled ? 'active_cancelled' : 'active';
        } else if (startTime > now && !isCancelled) {
          computedStatus = 'upcoming';
        } else if (expTime <= now) {
          computedStatus = 'expired';
        }

        return {
          ...p,
          startDate: start,
          expiryDate: exp,
          startTime,
          expTime,
          computedStatus,
          isCancelled
        };
      });

      // Find current active period (active or active_cancelled where now is within bounds)
      const activePeriod = evaluatedPeriods.find(
        (p) => now >= p.startTime && now < p.expTime && p.computedStatus !== 'cancelled'
      );

      // Filter upcoming queued periods
      const upcomingPeriods = evaluatedPeriods.filter((p) => p.computedStatus === 'upcoming');

      // Calculate total stacked expiry (the latest expiry date among active and upcoming)
      const validFuturePeriods = evaluatedPeriods.filter(
        (p) => p.expTime > now && p.computedStatus !== 'cancelled'
      );
      const totalStackExpiryTime = validFuturePeriods.reduce(
        (max, p) => Math.max(max, p.expTime),
        activePeriod ? activePeriod.expTime : 0
      );
      const totalStackExpiry = totalStackExpiryTime > 0 ? new Date(totalStackExpiryTime) : null;
      const totalStackDaysRemaining = totalStackExpiry
        ? Math.max(0, Math.ceil((totalStackExpiry.getTime() - now) / MS_PER_DAY))
        : 0;

      if (activePeriod) {
        const planDetails = getPlanById(activePeriod.planId);
        const daysRemaining = Math.max(0, Math.ceil((activePeriod.expTime - now) / MS_PER_DAY));

        return {
          exists: true,
          userId,
          activePlan: activePeriod.planId,
          planDetails,
          status: activePeriod.computedStatus,
          isActive: true,
          activatedAt: activePeriod.startDate,
          expiresAt: activePeriod.expiryDate,
          daysRemaining,
          totalStackExpiry,
          totalStackDaysRemaining,
          activePeriod,
          upcomingPeriods,
          allPeriods: evaluatedPeriods,
          canEarnTokens: Boolean(planDetails?.canEarnTokens),
          redemptionRatePer100: planDetails?.redemptionRatePer100 || 0,
          isCancelled: Boolean(activePeriod.isCancelled),
          cancellationEffectiveDate: activePeriod.isCancelled ? activePeriod.expiryDate : null,
          latestTransactionId: activePeriod.transactionId || null,
          periodId: activePeriod.periodId || activePeriod.id
        };
      }

      // No currently active period (either expired or only upcoming periods in future)
      const isExpired = evaluatedPeriods.some((p) => p.computedStatus === 'expired');
      return {
        exists: true,
        userId,
        activePlan: null,
        planDetails: null,
        status: upcomingPeriods.length > 0 ? 'upcoming' : isExpired ? 'expired' : 'none',
        isActive: false,
        activatedAt: null,
        expiresAt: totalStackExpiry,
        daysRemaining: 0,
        totalStackExpiry,
        totalStackDaysRemaining,
        activePeriod: null,
        upcomingPeriods,
        allPeriods: evaluatedPeriods,
        canEarnTokens: false,
        redemptionRatePer100: 0,
        isCancelled: false,
        cancellationEffectiveDate: null,
        latestTransactionId: null
      };
    }

    // 3. Fallback to memberships/{userId} document (legacy/compatibility)
    const memRef = doc(database, 'memberships', userId);
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
        totalStackExpiry: null,
        totalStackDaysRemaining: 0,
        activePeriod: null,
        upcomingPeriods: [],
        allPeriods: [],
        canEarnTokens: false,
        redemptionRatePer100: 0,
        isCancelled: false,
        cancellationEffectiveDate: null
      };
    }

    const data = snap.data();
    // Exclusively Donors are eligible for memberships
    if (data.userRole && data.userRole !== 'donor') {
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
        totalStackExpiry: null,
        totalStackDaysRemaining: 0,
        activePeriod: null,
        upcomingPeriods: [],
        allPeriods: [],
        canEarnTokens: false,
        redemptionRatePer100: 0,
        isCancelled: false,
        cancellationEffectiveDate: null
      };
    }

    const expiresAt = parseDate(data.expiresAt);
    const activatedAt = parseDate(data.activatedAt);

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
      totalStackExpiry: expiresAt,
      totalStackDaysRemaining: daysRemaining,
      activePeriod: null,
      upcomingPeriods: [],
      allPeriods: [],
      canEarnTokens: isActive && Boolean(planDetails?.canEarnTokens),
      redemptionRatePer100: planDetails?.redemptionRatePer100 || 0,
      isCancelled: Boolean(data.isCancelled),
      cancellationEffectiveDate: parseDate(data.cancellationEffectiveDate),
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
      totalStackExpiry: null,
      totalStackDaysRemaining: 0,
      activePeriod: null,
      upcomingPeriods: [],
      allPeriods: [],
      canEarnTokens: false,
      redemptionRatePer100: 0,
      isCancelled: false,
      cancellationEffectiveDate: null
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
 * Sanitizes payment method details so that sensitive information
 * (CVV, raw card numbers, UPI PINs, passwords) is NEVER stored.
 *
 * @param {'card'|'upi'|'net_banking'|'simulated_demo'} method
 * @param {Object} details
 * @returns {Object} Safe masked metadata
 */
export function sanitizePaymentMethodDetails(method, details = {}) {
  if (!details || typeof details !== 'object') return {};
  if (method === 'card') {
    const rawNum = details.cardNumber ? String(details.cardNumber).replace(/\D/g, '') : '';
    const last4 = rawNum.length >= 4 ? rawNum.slice(-4) : (details.last4 || '4242');
    const brand = details.cardBrand || (rawNum.startsWith('4') ? 'Visa' : rawNum.startsWith('5') ? 'Mastercard' : rawNum.startsWith('6') ? 'RuPay' : 'Card');
    return {
      cardBrand: brand,
      last4,
      cardholderName: details.cardholderName || 'Cardholder'
    };
  }
  if (method === 'upi') {
    return {
      upiId: details.upiId || 'donor@upi'
    };
  }
  if (method === 'net_banking') {
    const acc = details.accountId ? String(details.accountId) : '';
    const maskedAccount = acc ? '••••' + acc.slice(-4) : '••••5678';
    return {
      bankName: details.bankName || 'State Bank of India',
      maskedAccount
    };
  }
  return {
    methodName: details.methodName || 'Simulated Checkout'
  };
}

/**
 * Processes a simulated support contribution.
 *
 * Workflows:
 * - Coffee (₹50): creates transaction record, no membership activation.
 * - Fuel Support (₹100) / Corridor Help (₹250): creates transaction record, activates or consecutively stacks 30-day membership periods.
 * - Consecutive Stacking: Multiple purchases extend duration consecutively (e.g., 3 passes = 90 days).
 * - Safe simulated checkout: accepts Card, UPI, Net Banking without storing raw credentials.
 * - Failed/Cancelled transactions are recorded for audit but never activate or queue memberships.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.userEmail]
 * @param {string} [params.userName]
 * @param {string} [params.userRole='donor']
 * @param {string} params.planId 'coffee' | 'fuel_support' | 'corridor_help'
 * @param {number} [params.customAmount]
 * @param {string} [params.paymentMethod='card'] 'card' | 'upi' | 'net_banking' | 'simulated_demo'
 * @param {Object} [params.paymentMethodDetails={}]
 * @param {string} [params.paymentStatus='completed'] 'completed' | 'failed' | 'cancelled'
 * @param {string} [params.failureReason=null]
 * @returns {Promise<Object>}
 */
export async function processSimulatedSupportPayment(dbInstance = db, {
  userId,
  userEmail = '',
  userName = 'Community Supporter',
  userRole = 'donor',
  planId,
  customAmount = null,
  paymentMethod = 'card',
  paymentMethodDetails = {},
  paymentStatus = 'completed',
  failureReason = null
}) {
  if (!userId) throw new Error('User must be authenticated to contribute');
  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Invalid support plan: "${planId}"`);

  const database = dbInstance || db;

  // Strict validation: Recipients/NGOs are never allowed to purchase or activate memberships
  let effectiveRole = userRole;
  if (effectiveRole === 'recipient') {
    throw new Error('Support memberships are exclusively for Donors. FoodBridge is 100% free for Recipient organizations.');
  }

  // Double check from users collection if not explicitly passed as recipient
  try {
    const userDocSnap = await getDoc(doc(database, 'users', userId));
    if (userDocSnap.exists()) {
      const uData = userDocSnap.data();
      if (uData.activeRole === 'recipient' || (uData.roles?.includes('recipient') && !uData.roles?.includes('donor'))) {
        throw new Error('Support memberships are exclusively for Donors. FoodBridge is 100% free for Recipient organizations.');
      }
    }
  } catch (err) {
    if (err.message.includes('Support memberships are exclusively for Donors')) throw err;
  }

  const amount = Number(customAmount) || plan.amount;
  const now = new Date();
  const txId = `TXN_DEMO_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const safeDetails = sanitizePaymentMethodDetails(paymentMethod, paymentMethodDetails);

  // 1. Record support contribution transaction
  const txRef = doc(database, 'supportTransactions', txId);
  const txData = {
    transactionId: txId,
    userId,
    userEmail: userEmail || '',
    userName: userName || 'Community Supporter',
    userRole: 'donor',
    planId: plan.id,
    planName: plan.name,
    amount,
    currency: 'INR',
    paymentStatus, // 'completed' | 'failed' | 'cancelled'
    paymentMethod,
    paymentMethodDetails: safeDetails,
    failureReason: failureReason || null,
    isDemo: true,
    activatesMembership: Boolean(plan.activatesMembership),
    createdAt: serverTimestamp(),
    timestampMs: now.getTime()
  };

  await setDoc(txRef, txData);

  // If payment failed or cancelled, NEVER activate or queue a membership!
  if (paymentStatus !== 'completed') {
    return {
      success: false,
      status: paymentStatus,
      transactionId: txId,
      amount,
      plan,
      membershipActivated: false,
      failureReason: failureReason || (paymentStatus === 'cancelled' ? 'Payment was cancelled by user' : 'Simulated payment failed')
    };
  }

  // 2. If plan activates membership and payment is completed:
  let newStartDate = now;
  let newExpiryDate = null;
  let periodId = null;
  let periodStatus = 'active';

  if (plan.activatesMembership) {
    // Check existing valid periods for this user to compute consecutive stacking
    let existingPeriods = [];
    try {
      const pCol = collection(database, 'membershipPeriods');
      const snap = await getDocs(query(pCol, where('userId', '==', userId)));
      existingPeriods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      existingPeriods = [];
    }

    // Filter valid non-cancelled periods that expire in the future
    const nowTime = now.getTime();
    const activeOrUpcoming = existingPeriods.filter((p) => {
      if (p.isCancelled || p.status === 'cancelled') return false;
      const exp = parseDate(p.expiryDate);
      return exp && exp.getTime() > nowTime;
    });

    if (activeOrUpcoming.length > 0) {
      // Find the latest expiry date among all active/upcoming periods
      activeOrUpcoming.sort((a, b) => {
        const tA = parseDate(a.expiryDate)?.getTime() || 0;
        const tB = parseDate(b.expiryDate)?.getTime() || 0;
        return tA - tB;
      });
      const latestExpDate = parseDate(activeOrUpcoming[activeOrUpcoming.length - 1].expiryDate);
      newStartDate = latestExpDate || now;
      newExpiryDate = new Date(newStartDate.getTime() + (MEMBERSHIP_DURATION_DAYS * MS_PER_DAY));
      periodStatus = 'upcoming';
    } else {
      newStartDate = now;
      newExpiryDate = new Date(now.getTime() + (MEMBERSHIP_DURATION_DAYS * MS_PER_DAY));
      periodStatus = 'active';
    }

    periodId = `PERIOD_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const periodRef = doc(database, 'membershipPeriods', periodId);
    const periodData = {
      periodId,
      userId,
      userRole: 'donor',
      planId: plan.id,
      planName: plan.name,
      amount,
      purchaseDate: now,
      startDate: newStartDate,
      expiryDate: newExpiryDate,
      status: periodStatus,
      transactionId: txId,
      paymentMethod,
      paymentMethodDetails: safeDetails,
      isCancelled: false,
      cancellationReason: null,
      cancellationEffectiveDate: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(periodRef, periodData);

    // Update transaction with period reference
    try {
      await updateDoc(txRef, {
        periodId,
        membershipStartDate: newStartDate,
        membershipExpiryDate: newExpiryDate
      });
    } catch (e) {}

    // Update summary memberships/{userId} document
    const memRef = doc(database, 'memberships', userId);
    const existingMemSnap = await getDoc(memRef);
    let activePlanId = plan.id;
    let activePlanName = plan.name;
    let activatedAt = newStartDate;

    if (periodStatus === 'upcoming' && existingMemSnap.exists()) {
      const emData = existingMemSnap.data();
      activePlanId = emData.activePlan || plan.id;
      activePlanName = emData.planName || plan.name;
      activatedAt = parseDate(emData.activatedAt) || now;
    }

    await setDoc(memRef, {
      userId,
      userRole: 'donor',
      activePlan: activePlanId,
      planName: activePlanName,
      status: 'active',
      activatedAt,
      expiresAt: newExpiryDate,
      latestTransactionId: txId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  return {
    success: true,
    status: 'completed',
    transactionId: txId,
    amount,
    plan,
    membershipActivated: Boolean(plan.activatesMembership),
    startDate: newStartDate,
    expiresAt: newExpiryDate,
    periodId,
    periodStatus
  };
}

/**
 * Cancels a specific membership period (either currently active or upcoming scheduled pass).
 *
 * Rules:
 * - Active membership: marks as cancelled; benefits remain valid until scheduled expiry; does not renew.
 * - Upcoming membership: cancels queued pass; shifts all subsequent queued passes forward by 30 days.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.periodId
 * @param {string} [params.cancellationReason]
 * @returns {Promise<Object>}
 */
export async function cancelMembershipPeriod(dbInstance = db, {
  userId,
  periodId,
  cancellationReason = 'User cancelled simulated pass'
}) {
  if (!userId || !periodId) throw new Error('User ID and Period ID are required');
  const database = dbInstance || db;

  const periodRef = doc(database, 'membershipPeriods', periodId);
  const snap = await getDoc(periodRef);
  if (!snap.exists()) {
    throw new Error('Membership period not found');
  }

  const pData = snap.data();
  if (pData.userId !== userId) {
    throw new Error('Unauthorized: cannot cancel another user membership');
  }

  const now = Date.now();
  const startDate = parseDate(pData.startDate);
  const expiryDate = parseDate(pData.expiryDate);
  const startTime = startDate ? startDate.getTime() : 0;
  const expTime = expiryDate ? expiryDate.getTime() : 0;

  const isCurrentlyActive = now >= startTime && now < expTime && !pData.isCancelled && pData.status !== 'cancelled';
  const isUpcoming = startTime > now && !pData.isCancelled && pData.status !== 'cancelled';

  if (!isCurrentlyActive && !isUpcoming) {
    throw new Error('Cannot cancel a period that is already expired or cancelled');
  }

  if (isCurrentlyActive) {
    // Active membership cancellation:
    // Mark as cancelled; benefits remain valid until scheduled expiry date; does not auto-renew.
    await updateDoc(periodRef, {
      isCancelled: true,
      status: 'active_cancelled',
      cancellationReason,
      cancellationEffectiveDate: expiryDate,
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Also update summary doc
    try {
      const memRef = doc(database, 'memberships', userId);
      await updateDoc(memRef, {
        isCancelled: true,
        cancellationEffectiveDate: expiryDate,
        updatedAt: serverTimestamp()
      });
    } catch (e) {}

    return {
      success: true,
      periodId,
      status: 'active_cancelled',
      cancellationType: 'active',
      validUntil: expiryDate,
      message: 'Active membership cancelled. Benefits remain active until the end of your billing cycle on ' + (expiryDate ? expiryDate.toLocaleDateString() : 'scheduled date') + '.'
    };
  }

  // Upcoming membership cancellation:
  // Cancels individual queued pass; removes from future schedule;
  // Recalculates start and expiry dates of subsequent queued memberships!
  await updateDoc(periodRef, {
    isCancelled: true,
    status: 'cancelled',
    cancellationReason,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Fetch all periods for this user to recalculate future timeline
  const pCol = collection(database, 'membershipPeriods');
  const allSnap = await getDocs(query(pCol, where('userId', '==', userId)));
  const allPeriods = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Separate non-cancelled periods
  const nonCancelled = allPeriods
    .filter((p) => p.id !== periodId && !p.isCancelled && p.status !== 'cancelled')
    .map((p) => ({
      ...p,
      startDateObj: parseDate(p.startDate),
      expiryDateObj: parseDate(p.expiryDate)
    }))
    .sort((a, b) => (a.startDateObj?.getTime() || 0) - (b.startDateObj?.getTime() || 0));

  // Determine the anchor date: the expiry date of the active period, or now if no active
  const activePeriod = nonCancelled.find(
    (p) => now >= (p.startDateObj?.getTime() || 0) && now < (p.expiryDateObj?.getTime() || 0)
  );

  let currentAnchor = activePeriod ? activePeriod.expiryDateObj : new Date();

  // Recalculate upcoming periods that start after the anchor
  let updatedUpcoming = [];
  for (const upPeriod of nonCancelled) {
    if (activePeriod && upPeriod.id === activePeriod.id) continue;
    // This is an upcoming period
    const newStart = new Date(currentAnchor.getTime());
    const newEnd = new Date(newStart.getTime() + (MEMBERSHIP_DURATION_DAYS * MS_PER_DAY));

    await updateDoc(doc(database, 'membershipPeriods', upPeriod.id), {
      startDate: newStart,
      expiryDate: newEnd,
      updatedAt: serverTimestamp()
    });

    updatedUpcoming.push({ id: upPeriod.id, startDate: newStart, expiryDate: newEnd });
    currentAnchor = newEnd;
  }

  // Update summary document expiry
  try {
    const memRef = doc(database, 'memberships', userId);
    await updateDoc(memRef, {
      expiresAt: currentAnchor,
      updatedAt: serverTimestamp()
    });
  } catch (e) {}

  return {
    success: true,
    periodId,
    status: 'cancelled',
    cancellationType: 'upcoming',
    recalculatedPeriods: updatedUpcoming,
    newTotalExpiryDate: currentAnchor,
    message: 'Upcoming membership pass cancelled. Subsequent scheduled periods have been shifted forward.'
  };
}

/**
 * Fetches all membership periods for a specific user.
 *
 * @param {Object} [dbInstance=db]
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
export async function getUserMembershipPeriods(dbInstance = db, userId) {
  if (!userId) return [];
  const database = dbInstance || db;
  try {
    const col = collection(database, 'membershipPeriods');
    const snap = await getDocs(query(col, where('userId', '==', userId)));
    const periods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    periods.sort((a, b) => {
      const tA = parseDate(a.startDate)?.getTime() || 0;
      const tB = parseDate(b.startDate)?.getTime() || 0;
      return tA - tB;
    });
    return periods;
  } catch (err) {
    console.warn('Notice querying membership periods:', err.message);
    return [];
  }
}

/**
 * Fetches all membership periods across users for administrative auditing.
 *
 * @param {Object} [dbInstance=db]
 * @param {Object} [options]
 * @param {number} [options.limitCount=100]
 * @returns {Promise<Array<Object>>}
 */
export async function getAllMembershipPeriods(dbInstance = db, { limitCount = 100 } = {}) {
  const database = dbInstance || db;
  try {
    const col = collection(database, 'membershipPeriods');
    const snap = await getDocs(query(col, limit(limitCount)));
    const periods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    periods.sort((a, b) => {
      const tA = parseDate(a.purchaseDate)?.getTime() || 0;
      const tB = parseDate(b.purchaseDate)?.getTime() || 0;
      return tB - tA;
    });
    return periods;
  } catch (err) {
    console.warn('Notice querying all membership periods:', err.message);
    return [];
  }
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

/**
 * Safely cleans up any legacy recipient membership or wallet documents without
 * altering donations, profiles, user records, or conversations.
 *
 * @param {Object} [dbInstance=db]
 * @returns {Promise<{ cleanedMemberships: number, cleanedWallets: number }>}
 */
export async function cleanupRecipientMemberships(dbInstance = db) {
  const database = dbInstance || db;
  let cleanedMemberships = 0;
  let cleanedWallets = 0;

  try {
    const memSnap = await getDocs(collection(database, 'memberships'));
    for (const memDoc of memSnap.docs) {
      const mData = memDoc.data();
      const uid = memDoc.id;
      let isRecipient = mData.userRole === 'recipient';
      if (!isRecipient) {
        try {
          const userSnap = await getDoc(doc(database, 'users', uid));
          if (userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.activeRole === 'recipient' || (uData.roles?.includes('recipient') && !uData.roles?.includes('donor'))) {
              isRecipient = true;
            }
          }
        } catch (e) {}
      }

      if (isRecipient) {
        try {
          await deleteDoc(doc(database, 'memberships', uid));
          cleanedMemberships++;
        } catch (e) {}
      }
    }

    const walletSnap = await getDocs(collection(database, 'wallets'));
    for (const wDoc of walletSnap.docs) {
      const uid = wDoc.id;
      try {
        const userSnap = await getDoc(doc(database, 'users', uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          if (uData.activeRole === 'recipient' || (uData.roles?.includes('recipient') && !uData.roles?.includes('donor'))) {
            await deleteDoc(doc(database, 'wallets', uid));
            cleanedWallets++;
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Notice during recipient membership cleanup:', err.message);
  }

  return { cleanedMemberships, cleanedWallets };
}
