/**
 * FoodBridge Delivery Pricing Configuration (Karnataka, India)
 *
 * Implements transparent, predictable delivery fare calculation:
 * Fare = Base Fee + (Per-km Rate × Road Distance in km)
 * Split 50% Donor / 50% Recipient
 */

export const DELIVERY_PRICING = {
  BASE_FEE: 40, // Base fee in INR (covers initial pickup handling & dispatch)
  PER_KM_RATE: 12, // Per-km rate in INR based on real road driving distance
  MINIMUM_FARE: 50 // Minimum total delivery fare in INR
};

/**
 * Calculates the total fare and equal 50/50 contribution shares.
 *
 * @param {number} distanceKm Road distance in kilometers
 * @returns {{
 *   distanceKm: number,
 *   totalFare: number,
 *   donorShare: number,
 *   recipientShare: number,
 *   baseFee: number,
 *   perKmRate: number
 * }}
 */
export function calculateDeliveryFare(distanceKm) {
  const km = Math.max(0.5, Number(distanceKm) || 1.0);
  const rawFare = DELIVERY_PRICING.BASE_FEE + (km * DELIVERY_PRICING.PER_KM_RATE);
  const totalFare = Math.max(DELIVERY_PRICING.MINIMUM_FARE, Math.round(rawFare));
  const donorShare = Math.round(totalFare / 2);
  const recipientShare = totalFare - donorShare;

  return {
    distanceKm: Math.round(km * 10) / 10,
    totalFare,
    donorShare,
    recipientShare,
    baseFee: DELIVERY_PRICING.BASE_FEE,
    perKmRate: DELIVERY_PRICING.PER_KM_RATE
  };
}
