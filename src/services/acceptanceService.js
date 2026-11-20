import {
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { calculateAvailableCapacity } from './capacityService';

/**
 * Atomically claims a single-recipient surplus food listing using a Firestore transaction.
 *
 * Guarantees that if two organizations attempt to accept simultaneously, exactly one succeeds
 * and the other receives a clear ALREADY_ACCEPTED rejection.
 *
 * @param {Object} db Firestore instance
 * @param {string} listingId
 * @param {string} recipientId
 * @param {Object} recipientProfileData
 * @returns {Promise<{ success: boolean, listing: Object }>}
 */
export async function acceptDonationAtomic(db, listingId, recipientId, recipientProfileData) {
  if (!listingId || !recipientId) {
    throw new Error('Listing ID and Recipient ID are required');
  }

  const listingRef = doc(db, 'listings', listingId);
  const recipientRef = doc(db, 'recipients', recipientId);

  return await runTransaction(db, async (transaction) => {
    // 1. Read current listing state
    const listingSnap = await transaction.get(listingRef);
    if (!listingSnap.exists()) {
      const err = new Error('Listing not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const listing = listingSnap.data();

    // 2. Concurrency Check: Is it still available in matching status?
    if (listing.status !== 'matching') {
      if (listing.status === 'accepted') {
        const err = new Error('This surplus food donation was already claimed by another organization.');
        err.code = 'ALREADY_ACCEPTED';
        throw err;
      }
      if (listing.status === 'cancelled') {
        const err = new Error('This listing was cancelled by the donor.');
        err.code = 'LISTING_CANCELLED';
        throw err;
      }
      if (listing.status === 'expired') {
        const err = new Error('The safe-use deadline for this listing has expired.');
        err.code = 'LISTING_EXPIRED';
        throw err;
      }
      const err = new Error(`Listing cannot be accepted (current status: ${listing.status}).`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    // 3. Expiry Check: Safe-use deadline validation
    if (listing.safeUseDeadline) {
      const deadline = new Date(listing.safeUseDeadline);
      if (deadline.getTime() <= Date.now()) {
        transaction.update(listingRef, {
          status: 'expired',
          updatedAt: serverTimestamp()
        });
        const err = new Error('The safe-use deadline for this food listing has passed.');
        err.code = 'LISTING_EXPIRED';
        throw err;
      }
    }

    // 4. Read recipient profile state
    const recipientSnap = await transaction.get(recipientRef);
    if (!recipientSnap.exists()) {
      const err = new Error('Recipient organization profile not found');
      err.code = 'RECIPIENT_NOT_FOUND';
      throw err;
    }

    const recipient = recipientSnap.data();

    // 5. Verification Check
    if (recipient.verificationStatus !== 'verified') {
      const err = new Error('Your organization must be verified by administrators before accepting donations.');
      err.code = 'NOT_VERIFIED';
      throw err;
    }

    // 6. Category Compatibility Check
    if (!listing.eligibleCategories || !listing.eligibleCategories.includes(recipient.category)) {
      const err = new Error(`This donation is restricted to eligible categories and cannot be assigned to "${recipient.category}".`);
      err.code = 'INELIGIBLE_CATEGORY';
      throw err;
    }

    // 7. Capacity Check
    const maxCap = Number(recipient.totalCapacity) || 0;
    const currentCommitted = Number(recipient.committedCapacity) || 0;
    const availableCap = calculateAvailableCapacity(maxCap, currentCommitted, recipient.operationalLimit);
    const requestedQty = Number(listing.quantity) || 0;

    if (availableCap < requestedQty) {
      const err = new Error(
        `Insufficient available additional capacity. You have ${availableCap} available, but this donation is ${requestedQty}.`
      );
      err.code = 'INSUFFICIENT_CAPACITY';
      throw err;
    }

    // 8. Atomic Updates
    const newCommitted = currentCommitted + requestedQty;
    const newAvailable = calculateAvailableCapacity(maxCap, newCommitted, recipient.operationalLimit);

    // Update listing
    transaction.update(listingRef, {
      status: 'accepted',
      acceptedRecipientId: recipientId,
      acceptedRecipientName: recipient.organizationName || recipientProfileData?.organizationName || 'Verified Organization',
      acceptedAt: serverTimestamp(),
      deliveryMode: 'direct_pickup',
      updatedAt: serverTimestamp()
    });

    // Update recipient capacity
    transaction.update(recipientRef, {
      committedCapacity: newCommitted,
      availableAdditionalCapacity: newAvailable,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      listingId,
      newAvailableCapacity: newAvailable
    };
  });
}

/**
 * Declines an available donation card for this recipient only.
 * Does NOT cancel the listing for other organizations in the network.
 *
 * @param {Object} db
 * @param {string} listingId
 * @param {string} recipientId
 * @param {string} [notificationId]
 */
export async function declineDonation(db, listingId, recipientId, notificationId = null) {
  if (!listingId || !recipientId) return;

  const listingRef = doc(db, 'listings', listingId);

  // Add recipient to declined list
  await updateDoc(listingRef, {
    declinedRecipientIds: arrayUnion(recipientId),
    updatedAt: serverTimestamp()
  });

  // If a notification document was provided, mark it dismissed
  if (notificationId) {
    try {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, {
        status: 'dismissed',
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('Notification dismiss notice:', e.message);
    }
  }
}
