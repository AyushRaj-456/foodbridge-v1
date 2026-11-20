import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Transparent methodology documentation:
 * Standard civic food recovery and nutritional portion guidelines (FSSAI / FAO baseline):
 * - 1 standard meal portion is defined as 0.4 kg of prepared nutritional food.
 * - Listings logged in 'kg' are converted to meals at: 1 kg = 2.5 meals.
 * - Listings logged in 'meals' are converted to kg at: 1 meal = 0.4 kg.
 * - Landfill diversion greenhouse gas factor: 1 kg food waste diverted avoids 2.5 kg CO2e (UNEP factor).
 */
export const IMPACT_CALCULATION_METHOD =
  'Transparent calculation method: 1 meal portion = 0.4 kg standard nutritional serving portion (FSSAI/FAO baseline). 1 kg surplus food diverted from landfill avoids 2.5 kg CO2e greenhouse gas emissions (UNEP factor). Statistics are strictly calculated from completed, verified handovers.';

export const STANDARD_MEAL_KG = 0.4; // 400g per meal
export const GHG_FACTOR_PER_KG = 2.5; // 2.5 kg CO2e per kg food saved

/**
 * Computes public impact metrics strictly from verified, completed donation records and active verified recipients.
 *
 * @param {Object} db Firestore database instance
 * @returns {Promise<{
 *   completedDonationsCount: number,
 *   totalQuantityKg: number,
 *   totalMealsEstimated: number,
 *   activeVerifiedRecipients: number,
 *   ghgEmissionsAvoidedKg: number,
 *   isZeroState: boolean,
 *   calculationMethod: string
 * }>}
 */
export async function calculatePublicImpact(db) {
  try {
    const listingsQuery = query(collection(db, 'listings'), where('status', '==', 'completed'));
    const recipientsQuery = query(collection(db, 'recipients'), where('verificationStatus', '==', 'verified'));

    // Concurrently fetch listings and recipients with a 3000ms safety timeout
    const fetchImpactPromise = Promise.all([
      getDocs(listingsQuery),
      getDocs(recipientsQuery)
    ]);

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
    const results = await Promise.race([fetchImpactPromise, timeoutPromise]);

    if (!results) {
      throw new Error('Public impact fetch timed out; using verified zero baseline');
    }

    const [listingsSnap, recipientsSnap] = results;
    const completedListings = listingsSnap.docs.map((d) => d.data());
    const verifiedRecipients = recipientsSnap.docs
      .map((d) => d.data())
      .filter((r) => r.operationalStatus !== 'paused' && !r.suspended);

    return aggregateImpactFromRecords(completedListings, verifiedRecipients);
  } catch (err) {
    console.warn('Public impact fallback notice:', err.message);
    // Safe fallback to zero state on error or offline
    return {
      completedDonationsCount: 0,
      totalQuantityKg: 0,
      totalMealsEstimated: 0,
      activeVerifiedRecipients: 0,
      ghgEmissionsAvoidedKg: 0,
      isZeroState: true,
      calculationMethod: IMPACT_CALCULATION_METHOD
    };
  }
}

/**
 * Pure aggregation function for trusted records.
 * Ensures cancelled, disputed, or pending records are never counted.
 *
 * @param {Array<Object>} completedListings
 * @param {Array<Object>} activeRecipients
 */
export function aggregateImpactFromRecords(completedListings = [], activeRecipients = []) {
  // Defensive filter: only count truly completed listings
  const validCompleted = completedListings.filter((l) => l.status === 'completed');

  let totalKg = 0;
  let totalMeals = 0;

  for (const item of validCompleted) {
    const qty = Number(item.quantity) || 0;
    const unit = (item.unit || 'kg').toLowerCase().trim();

    if (unit === 'kg') {
      totalKg += qty;
      totalMeals += Math.round(qty / STANDARD_MEAL_KG);
    } else if (unit === 'meals' || unit === 'servings' || unit === 'portions') {
      totalMeals += qty;
      totalKg += Math.round(qty * STANDARD_MEAL_KG * 10) / 10;
    } else if (unit === 'liters' || unit === 'l') {
      // 1 liter liquid dairy/broth ~= 1 kg
      totalKg += qty;
      totalMeals += Math.round(qty / STANDARD_MEAL_KG);
    } else {
      // Default to kg
      totalKg += qty;
      totalMeals += Math.round(qty / STANDARD_MEAL_KG);
    }
  }

  // Avoid fractional display inaccuracies
  const roundedKg = Math.round(totalKg * 10) / 10;
  const roundedMeals = Math.round(totalMeals);
  const ghgAvoided = Math.round(roundedKg * GHG_FACTOR_PER_KG * 10) / 10;
  const completedCount = validCompleted.length;
  const recipientCount = activeRecipients.length;

  const isZeroState = completedCount === 0;

  return {
    completedDonationsCount: completedCount,
    totalQuantityKg: roundedKg,
    totalMealsEstimated: roundedMeals,
    activeVerifiedRecipients: recipientCount,
    ghgEmissionsAvoidedKg: ghgAvoided,
    isZeroState,
    calculationMethod: IMPACT_CALCULATION_METHOD
  };
}
