/**
 * FoodBridge Food Safety and Material Suitability Engine
 *
 * Deterministic, rule-based classification that evaluates donor-submitted facts
 * against conservative food dignity and waste handling standards.
 *
 * NOTE: Donor selection is merely an initial declaration. Platform safety rules
 * strictly dictate final eligibility.
 */

export const RECIPIENT_CATEGORIES = {
  HUMAN: 'human',
  ANIMAL: 'animal',
  COMPOST: 'compost',
  BIOGAS: 'biogas'
};

export const FOOD_STATES = {
  FRESHLY_PREPARED: 'freshly_prepared',
  PACKAGED_SEALED: 'packaged_sealed',
  RAW_PRODUCE: 'raw_produce',
  TRIMMED_SCRAPS: 'trimmed_scraps',
  SPOILED_EXPIRED: 'spoiled_expired'
};

export const STORAGE_CONDITIONS = {
  HOT_HELD: 'hot_held',       // > 60°C
  COLD_HELD: 'cold_held',     // < 5°C
  ROOM_TEMP: 'room_temp',     // Ambient (strictly time-limited)
  DRY_STORAGE: 'dry_storage'  // Ambient dry pantry
};

export const ALLERGEN_OPTIONS = [
  { id: 'nuts', label: 'Nuts / Peanuts' },
  { id: 'dairy', label: 'Milk / Dairy' },
  { id: 'gluten', label: 'Wheat / Gluten' },
  { id: 'soy', label: 'Soybeans' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'mustard', label: 'Mustard' },
  { id: 'none', label: 'No Known Allergens' }
];

/**
 * Evaluates listing data and returns eligible recipient categories with safety audit trail.
 *
 * @param {Object} listingData
 * @param {Date} [referenceTime=new Date()]
 * @returns {Object} { eligibleCategories, safetyChecks, isEligible, inspectionNotice }
 */
export function evaluateFoodSafety(listingData, referenceTime = new Date()) {
  const {
    foodState,
    preparedAt,
    safeUseDeadline,
    storageCondition,
    isVegetarian,
    donorDeclaration,
    intendedSuitability = []
  } = listingData;

  const safetyChecks = [];
  const eligibleCategories = new Set();
  const refTime = new Date(referenceTime);
  const deadlineTime = safeUseDeadline ? new Date(safeUseDeadline) : null;
  const prepTime = preparedAt ? new Date(preparedAt) : null;

  // 1. Time / Expiry Evaluation
  let isExpired = false;
  let hoursUntilDeadline = 0;

  if (deadlineTime && !isNaN(deadlineTime.getTime())) {
    hoursUntilDeadline = (deadlineTime.getTime() - refTime.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDeadline <= 0) {
      isExpired = true;
      safetyChecks.push({
        rule: 'EXPIRY_CHECK',
        passed: false,
        message: 'Safe-use deadline has passed. Item is classified as expired.'
      });
    } else {
      safetyChecks.push({
        rule: 'EXPIRY_CHECK',
        passed: true,
        message: `Within safe-use window (${hoursUntilDeadline.toFixed(1)} hours remaining).`
      });
    }
  } else {
    isExpired = true;
    safetyChecks.push({
      rule: 'EXPIRY_CHECK',
      passed: false,
      message: 'No valid safe-use deadline provided.'
    });
  }

  // 2. Condition Evaluation
  const isSpoiledOrExpired = isExpired || foodState === FOOD_STATES.SPOILED_EXPIRED;
  const isRawScrap = foodState === FOOD_STATES.TRIMMED_SCRAPS;
  const isCooked = foodState === FOOD_STATES.FRESHLY_PREPARED;
  const isPackaged = foodState === FOOD_STATES.PACKAGED_SEALED;
  const isRawFreshProduce = foodState === FOOD_STATES.RAW_PRODUCE;

  // 3. Human Consumption Evaluation
  let humanEligible = true;

  if (isSpoiledOrExpired) {
    humanEligible = false;
    safetyChecks.push({
      rule: 'HUMAN_EXPIRY_GATE',
      passed: false,
      message: 'Expired or spoiled material cannot be distributed for human consumption.'
    });
  }

  if (isRawScrap) {
    humanEligible = false;
    safetyChecks.push({
      rule: 'HUMAN_SCRAP_GATE',
      passed: false,
      message: 'Trimmed scraps and kitchen residues cannot be distributed for human consumption.'
    });
  }

  // Minimum buffer: at least 1 hour remaining for human matching
  if (hoursUntilDeadline < 1.0) {
    humanEligible = false;
    safetyChecks.push({
      rule: 'HUMAN_BUFFER_GATE',
      passed: false,
      message: 'Less than 1 hour remaining before safe-use deadline. Ineligible for human matching.'
    });
  }

  // Room temperature cooked food safety (2-hour / 4-hour rule)
  if (isCooked && storageCondition === STORAGE_CONDITIONS.ROOM_TEMP) {
    if (prepTime && !isNaN(prepTime.getTime())) {
      const hoursSincePrep = (refTime.getTime() - prepTime.getTime()) / (1000 * 60 * 60);
      if (hoursSincePrep > 4.0) {
        humanEligible = false;
        safetyChecks.push({
          rule: 'HUMAN_TEMP_DANGER_ZONE',
          passed: false,
          message: `Cooked food held at ambient room temperature for ${hoursSincePrep.toFixed(1)} hours exceeds the 4-hour safety threshold.`
        });
      } else {
        safetyChecks.push({
          rule: 'HUMAN_TEMP_DANGER_ZONE',
          passed: true,
          message: `Cooked food at room temperature within acceptable initial window (${hoursSincePrep.toFixed(1)} hours elapsed).`
        });
      }
    } else {
      humanEligible = false;
      safetyChecks.push({
        rule: 'HUMAN_PREP_TIME_MISSING',
        passed: false,
        message: 'Preparation time is required for cooked food held at room temperature.'
      });
    }
  }

  if (!donorDeclaration) {
    humanEligible = false;
    safetyChecks.push({
      rule: 'HUMAN_DECLARATION_REQUIRED',
      passed: false,
      message: 'Donor hygiene and handling declaration is required for human food.'
    });
  }

  if (humanEligible) {
    eligibleCategories.add(RECIPIENT_CATEGORIES.HUMAN);
    safetyChecks.push({
      rule: 'HUMAN_SUITABILITY',
      passed: true,
      message: 'Item meets structured safety criteria for verified human-food recipients (NGOs/shelters).'
    });
  }

  // 4. Animal Feed Evaluation
  let animalEligible = true;

  if (isSpoiledOrExpired) {
    animalEligible = false;
    safetyChecks.push({
      rule: 'ANIMAL_SPOILAGE_GATE',
      passed: false,
      message: 'Spoiled, moldy, or decayed food is not safe for animal consumption.'
    });
  }

  // Gaushalas and animal shelters in Karnataka strictly require vegetarian food
  if (!isVegetarian) {
    animalEligible = false;
    safetyChecks.push({
      rule: 'ANIMAL_VEGETARIAN_GATE',
      passed: false,
      message: 'Non-vegetarian or meat-containing items cannot be matched with animal care organizations.'
    });
  }

  // Animal feed must be fresh produce, raw vegetable scraps, plain grains, or unexpired bakery
  if (isCooked && storageCondition === STORAGE_CONDITIONS.ROOM_TEMP && hoursUntilDeadline < 0.5) {
    animalEligible = false;
    safetyChecks.push({
      rule: 'ANIMAL_FRESHNESS_GATE',
      passed: false,
      message: 'Prepared food is past reasonable freshness for animal care organizations.'
    });
  }

  if (animalEligible) {
    eligibleCategories.add(RECIPIENT_CATEGORIES.ANIMAL);
    safetyChecks.push({
      rule: 'ANIMAL_SUITABILITY',
      passed: true,
      message: 'Item meets vegetarian safety requirements for verified animal-food recipients (gaushalas/shelters).'
    });
  }

  // 5. Composting Evaluation
  // Suitable for raw vegetable trimmings, produce, coffee grounds, plant matter
  let compostEligible = true;
  if (!isVegetarian && isCooked) {
    // Cooked meat/grease attracts pests in decentralized compost yards
    compostEligible = false;
    safetyChecks.push({
      rule: 'COMPOST_ORGANIC_PURITY',
      passed: false,
      message: 'Cooked animal proteins are not accepted by decentralized community composting facilities.'
    });
  } else {
    eligibleCategories.add(RECIPIENT_CATEGORIES.COMPOST);
    safetyChecks.push({
      rule: 'COMPOST_SUITABILITY',
      passed: true,
      message: 'Organic material accepted by authorized composting facilities.'
    });
  }

  // 6. Biogas Evaluation
  // Anaerobic digestion plants accept all biodegradable kitchen scraps, cooked food, and spoiled organic matter
  eligibleCategories.add(RECIPIENT_CATEGORIES.BIOGAS);
  safetyChecks.push({
    rule: 'BIOGAS_SUITABILITY',
    passed: true,
    message: 'Biodegradable organic matter accepted by biogas biomethanation facilities.'
  });

  // 7. Reconcile with Donor's Intended Selections
  // Platform safety rules FILTER the donor's intended categories; donor selection alone never overrides safety!
  const finalCategories = Array.from(eligibleCategories).filter((category) => {
    if (intendedSuitability.length === 0) return true; // If donor didn't restrict, use all safe categories
    return intendedSuitability.includes(category);
  });

  return {
    isEligible: finalCategories.length > 0,
    eligibleCategories: finalCategories,
    rawSafeCategories: Array.from(eligibleCategories),
    safetyChecks,
    inspectionNotice: 'Donor-declared information; recipient organization must inspect food upon collection before distribution.'
  };
}

/**
 * Convenience wrapper evaluating food suitability with categorized booleans.
 */
export function evaluateFoodSuitability(listingData, referenceTime = new Date()) {
  const normalized = {
    foodState: listingData.foodState === 'cooked_packaged' ? FOOD_STATES.FRESHLY_PREPARED : listingData.foodState,
    preparedAt: listingData.preparedAt || listingData.preparationTime,
    safeUseDeadline: listingData.safeUseDeadline,
    storageCondition: listingData.storageCondition === 'refrigerated' ? STORAGE_CONDITIONS.COLD_HELD :
                      listingData.storageCondition === 'ambient' ? STORAGE_CONDITIONS.ROOM_TEMP : listingData.storageCondition,
    isVegetarian: listingData.isVegetarian !== undefined ? listingData.isVegetarian : true,
    donorDeclaration: listingData.donorDeclaration,
    intendedSuitability: listingData.intendedSuitability || []
  };
  const result = evaluateFoodSafety(normalized, referenceTime);
  return {
    ...result,
    isEligibleForHuman: result.eligibleCategories.includes('human')
  };
}
