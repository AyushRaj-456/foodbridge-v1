/**
 * FoodBridge Support Membership, Reward Tokens & Redemption Configuration
 *
 * Voluntary community support tiers with plan-based token earning & redemption.
 * Timezone strictly anchored to Indian Standard Time (IST, UTC+5:30).
 */

export const SUPPORT_PLANS = {
  COFFEE: {
    id: 'coffee',
    name: 'Buy Us a Coffee',
    amount: 50,
    durationDays: 0,
    activatesMembership: false,
    canEarnTokens: false,
    redemptionRatePer100: 0,
    ratePerToken: 0,
    badge: 'Voluntary Support',
    description: 'One-time voluntary contribution. No membership activation or token earning benefits.'
  },
  FUEL_SUPPORT: {
    id: 'fuel_support',
    name: 'Fuel Support',
    amount: 100,
    durationDays: 30,
    activatesMembership: true,
    canEarnTokens: true,
    redemptionRatePer100: 2, // ₹2 per 100 tokens
    ratePerToken: 0.02,
    badge: '30-Day Membership',
    description: 'Activates a 30-day membership for Donors. Eligible Donors earn 10 tokens for every 2 kg of food donated. Redeem at ₹2 per 100 tokens.'
  },
  CORRIDOR_HELP: {
    id: 'corridor_help',
    name: 'Corridor Help',
    amount: 250,
    durationDays: 30,
    activatesMembership: true,
    canEarnTokens: true,
    redemptionRatePer100: 6, // ₹6 per 100 tokens
    ratePerToken: 0.06,
    badge: '30-Day Membership',
    description: 'Activates a 30-day membership for Donors. Eligible Donors earn 10 tokens for every 2 kg of food donated. Redeem at ₹6 per 100 tokens.'
  }
};

export const REWARD_RULES = {
  TOKENS_PER_TWO_KG: 10,
  KG_PER_REWARD_BLOCK: 2,
  DONOR_REWARD_TOKENS: 10, // Legacy fallback
  RECIPIENT_REWARD_TOKENS: 0, // Recipients are 100% free and do not earn tokens
  GLOBAL_DAILY_LIMIT: 5, // Max 5 reward-eligible donations platform-wide per IST calendar day
  PAIR_DAILY_LIMIT: 2,   // Max 2 reward-eligible donations per Donor-NGO pair per IST calendar day
  MIN_REDEMPTION_TOKENS: 100, // Minimum 100 tokens, must be multiple of 100
  ELIGIBLE_ROLES: ['donor'] // Exclusively Donors; couriers and recipients excluded
};

/**
 * Calculates token reward for a given food quantity in kilograms.
 * Formula: Tokens Earned = (Food Quantity in KG / 2) * 10
 *
 * Proportional calculation with support for fractional quantities.
 * Does not round down the quantity or award tokens based only on completed 2 kg blocks.
 *
 * @param {number} foodQuantityKg
 * @returns {number}
 */
export function calculateDonationTokens(foodQuantityKg) {
  const qty = Number(foodQuantityKg);
  if (isNaN(qty) || qty <= 0) return 0;
  // Formula: (Food Quantity in KG / 2) * 10 = Food Quantity in KG * 5
  const tokens = (qty / 2) * 10;
  // Round to 2 decimal places for fractional precision
  return Math.round(tokens * 100) / 100;
}

/**
 * Returns the plan definition by plan ID.
 * @param {string} planId
 * @returns {Object|null}
 */
export function getPlanById(planId) {
  if (!planId) return null;
  const normalized = String(planId).toLowerCase().trim();
  return (
    Object.values(SUPPORT_PLANS).find((p) => p.id === normalized) || null
  );
}

/**
 * Calculates current date string in Indian Standard Time (IST, UTC+5:30).
 * Format: 'YYYY-MM-DD'
 * Resets at midnight IST. Does not use rolling 24h window.
 *
 * @param {Date|number|string} [dateInput=new Date()]
 * @returns {string} e.g. "2026-11-24"
 */
export function getISTDateString(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);

  // UTC time in ms + 5 hours 30 mins (19,800,000 ms)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60 * 1000;
  const istDate = new Date(utcMs + istOffsetMs);

  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Normalizes pair ID for Donor-NGO combination.
 * @param {string} donorId
 * @param {string} ngoId
 * @returns {string} e.g. "donor123_ngo456"
 */
export function getDonorNgoPairKey(donorId, ngoId) {
  return `${donorId || 'unknown'}_${ngoId || 'unknown'}`;
}
