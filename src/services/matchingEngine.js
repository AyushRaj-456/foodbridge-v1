/**
 * FoodBridge Geospatial Matching & Radius Expansion Engine
 *
 * Implements deterministic distance calculation, recipient eligibility filtering,
 * initial 1.5 km radius matching, and idempotent 2-hour radius expansion.
 */

export const INITIAL_RADIUS_KM = 1.5;
export const EXPANSION_WAITING_HOURS = 2.0;
export const RADIUS_STEPS_KM = [1.5, 3.0, 6.0, 10.0, 15.0];

/**
 * Calculates the great-circle distance between two geographic coordinates
 * using the Haversine formula (instant, zero-cost, runs offline/locally).
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers (rounded to 2 decimal places)
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const p1 = Number(lat1);
  const q1 = Number(lon1);
  const p2 = Number(lat2);
  const q2 = Number(lon2);

  if (isNaN(p1) || isNaN(q1) || isNaN(p2) || isNaN(q2)) {
    return Infinity;
  }

  const R = 6371; // Earth's mean radius in km
  const dLat = ((p2 - p1) * Math.PI) / 180;
  const dLon = ((q2 - q1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1 * Math.PI) / 180) *
      Math.cos((p2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Evaluates whether a recipient is eligible to receive a specific listing.
 *
 * @param {Object} listing
 * @param {Object} recipient
 * @param {number} currentRadiusKm
 * @returns {{ isEligible: boolean, reason?: string, distanceKm: number }}
 */
export function checkRecipientEligibility(listing, recipient, currentRadiusKm) {
  // 1. Recipient must be verified by admin
  if (recipient.verificationStatus !== 'verified') {
    return { isEligible: false, reason: 'Recipient is not verified', distanceKm: Infinity };
  }

  // 2. Recipient operational status must not be paused
  if (recipient.operationalStatus === 'paused') {
    return { isEligible: false, reason: 'Recipient facility is currently paused', distanceKm: Infinity };
  }

  // 3. Category segregation check: recipient category must be in listing's eligibleCategories
  const recipientCategory = recipient.category;
  if (!listing.eligibleCategories || !listing.eligibleCategories.includes(recipientCategory)) {
    return {
      isEligible: false,
      reason: `Listing is not eligible for recipient category "${recipientCategory}"`,
      distanceKm: Infinity
    };
  }

  // 4. Capacity check: recipient must have sufficient available additional capacity
  const availableCap = Number(recipient.availableAdditionalCapacity) || 0;
  const neededCap = Number(listing.quantity) || 0;
  if (availableCap < neededCap) {
    return {
      isEligible: false,
      reason: `Insufficient additional capacity (Available: ${availableCap}, Needed: ${neededCap})`,
      distanceKm: Infinity
    };
  }

  // 5. Distance check: listing and recipient coordinates
  const distanceKm = calculateHaversineDistance(
    listing.latitude,
    listing.longitude,
    recipient.latitude,
    recipient.longitude
  );

  if (distanceKm > currentRadiusKm) {
    return {
      isEligible: false,
      reason: `Outside current radius (${distanceKm} km > ${currentRadiusKm} km)`,
      distanceKm
    };
  }

  // 6. Recipient service radius check (if recipient specifies a maximum service area)
  const maxRecipientRadius = Number(recipient.serviceRadiusKm) || 25;
  if (distanceKm > maxRecipientRadius) {
    return {
      isEligible: false,
      reason: `Outside recipient service area (${distanceKm} km > ${maxRecipientRadius} km)`,
      distanceKm
    };
  }

  return { isEligible: true, distanceKm };
}

/**
 * Finds and ranks all eligible recipients for a listing within the given radius.
 *
 * @param {Object} listing
 * @param {Array<Object>} recipientsList
 * @param {number} [radiusKm=INITIAL_RADIUS_KM]
 * @returns {Array<Object>} Ranked eligible recipients sorted by distance ascending
 */
export function findEligibleRecipients(listing, recipientsList = [], radiusKm = INITIAL_RADIUS_KM) {
  const eligible = [];

  for (const recipient of recipientsList) {
    const check = checkRecipientEligibility(listing, recipient, radiusKm);
    if (check.isEligible) {
      eligible.push({
        ...recipient,
        distanceKm: check.distanceKm
      });
    }
  }

  // Rank primarily by closest distance
  eligible.sort((a, b) => a.distanceKm - b.distanceKm);

  return eligible;
}

/**
 * Determines the next expansion radius based on the current radius step.
 *
 * @param {number} currentRadiusKm
 * @returns {number} Next radius in km
 */
export function getNextExpansionRadius(currentRadiusKm) {
  const currentIndex = RADIUS_STEPS_KM.indexOf(currentRadiusKm);
  if (currentIndex === -1) {
    // Find closest step greater than current
    const next = RADIUS_STEPS_KM.find((r) => r > currentRadiusKm);
    return next || RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1];
  }
  if (currentIndex < RADIUS_STEPS_KM.length - 1) {
    return RADIUS_STEPS_KM[currentIndex + 1];
  }
  return RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1]; // Max radius reached
}

/**
 * Checks whether a listing is due for radius expansion.
 *
 * @param {Object} listing
 * @param {Date} [now=new Date()]
 * @param {number} [waitingHours=EXPANSION_WAITING_HOURS]
 * @returns {boolean}
 */
export function isRadiusExpansionDue(listing, now = new Date(), waitingHours = EXPANSION_WAITING_HOURS) {
  if (listing.status && listing.status !== 'matching') return false;

  const currentRadius = Number(listing.matchingRadiusKm) || INITIAL_RADIUS_KM;
  const maxRadius = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1];
  if (currentRadius >= maxRadius) return false;

  const lastExpansionTime = listing.lastRadiusExpandedAt
    ? new Date(listing.lastRadiusExpandedAt)
    : listing.createdAt
    ? new Date(listing.createdAt)
    : null;

  if (!lastExpansionTime || isNaN(lastExpansionTime.getTime())) return false;

  const hoursElapsed = (now.getTime() - lastExpansionTime.getTime()) / (1000 * 60 * 60);
  return hoursElapsed >= waitingHours;
}
