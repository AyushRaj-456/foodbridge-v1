import {
  doc,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Calculates current available additional capacity.
 * Available additional capacity means how much MORE the recipient can intake right now,
 * not the total warehouse/facility volume.
 *
 * @param {number} maxCapacity
 * @param {number} committedCapacity
 * @param {number} [operationalLimit]
 * @returns {number}
 */
export function calculateAvailableCapacity(maxCapacity = 0, committedCapacity = 0, operationalLimit = null) {
  const max = Number(maxCapacity) || 0;
  const committed = Number(committedCapacity) || 0;
  const rawRemaining = Math.max(0, max - committed);

  if (operationalLimit !== null && operationalLimit !== undefined) {
    const limit = Number(operationalLimit);
    return Math.max(0, Math.min(rawRemaining, limit));
  }

  return rawRemaining;
}

/**
 * Transactionally reserves capacity on a recipient document.
 * Guarantees atomicity and eliminates concurrent overbooking.
 *
 * @param {Object} db Firestore instance
 * @param {string} recipientId Recipient User ID
 * @param {number} quantityRequested Amount of meals or kg requested
 * @returns {Promise<{ previousAvailable: number, newAvailable: number }>}
 */
export async function reserveRecipientCapacity(db, recipientId, quantityRequested) {
  const quantity = Number(quantityRequested);
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity requested must be a positive number');
  }

  const recipientRef = doc(db, 'recipients', recipientId);

  return await runTransaction(db, async (transaction) => {
    const recipientDoc = await transaction.get(recipientRef);
    if (!recipientDoc.exists()) {
      throw new Error(`Recipient organization ${recipientId} does not exist.`);
    }

    const data = recipientDoc.data();

    // Check verification status
    if (data.verificationStatus !== 'verified') {
      throw new Error('Recipient organization is not verified to receive donations.');
    }

    const maxCap = Number(data.totalCapacity) || 0;
    const currentCommitted = Number(data.committedCapacity) || 0;
    const currentAvailable = calculateAvailableCapacity(maxCap, currentCommitted, data.operationalLimit);

    if (currentAvailable < quantity) {
      throw new Error(
        `Insufficient additional capacity. Recipient has ${currentAvailable} available, but listing requires ${quantity}.`
      );
    }

    const newCommitted = currentCommitted + quantity;
    const newAvailable = calculateAvailableCapacity(maxCap, newCommitted, data.operationalLimit);

    transaction.update(recipientRef, {
      committedCapacity: newCommitted,
      availableAdditionalCapacity: newAvailable,
      updatedAt: serverTimestamp()
    });

    return {
      previousAvailable: currentAvailable,
      newAvailable
    };
  });
}

/**
 * Transactionally releases previously committed capacity if a listing is cancelled,
 * rejected, or expired before physical collection.
 *
 * @param {Object} db Firestore instance
 * @param {string} recipientId Recipient User ID
 * @param {number} quantityToRelease Amount to release back to recipient
 * @returns {Promise<{ newAvailable: number }>}
 */
export async function releaseRecipientCapacity(db, recipientId, quantityToRelease) {
  const quantity = Number(quantityToRelease);
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity to release must be a positive number');
  }

  const recipientRef = doc(db, 'recipients', recipientId);

  return await runTransaction(db, async (transaction) => {
    const recipientDoc = await transaction.get(recipientRef);
    if (!recipientDoc.exists()) return { newAvailable: 0 };

    const data = recipientDoc.data();
    const maxCap = Number(data.totalCapacity) || 0;
    const currentCommitted = Number(data.committedCapacity) || 0;

    const newCommitted = Math.max(0, currentCommitted - quantity);
    const newAvailable = calculateAvailableCapacity(maxCap, newCommitted, data.operationalLimit);

    transaction.update(recipientRef, {
      committedCapacity: newCommitted,
      availableAdditionalCapacity: newAvailable,
      updatedAt: serverTimestamp()
    });

    return { newAvailable };
  });
}
