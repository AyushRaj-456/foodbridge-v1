import {
  doc,
  runTransaction,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';

export const DELIVERY_STATUSES = {
  PENDING_AGREEMENT: 'pending_agreement',
  REQUESTED: 'requested',
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  DELIVERED_PENDING_CONFIRMATION: 'delivered_pending_confirmation',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  DISPUTED: 'disputed'
};

/**
 * Validates the mutual delivery cost split.
 * In FoodBridge V1, payments are settled directly between parties; no wallet or escrow.
 *
 * @param {number} totalAmount
 * @param {number} donorContribution
 * @param {number} recipientContribution
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateCostAgreement(totalAmount, donorContribution, recipientContribution) {
  const total = Number(totalAmount);
  const donor = Number(donorContribution);
  const recipient = Number(recipientContribution);

  if (isNaN(total) || total < 0) {
    return { isValid: false, error: 'Total delivery amount must be zero or a positive number.' };
  }
  if (isNaN(donor) || donor < 0) {
    return { isValid: false, error: 'Donor contribution must be zero or a positive number.' };
  }
  if (isNaN(recipient) || recipient < 0) {
    return { isValid: false, error: 'Recipient contribution must be zero or a positive number.' };
  }

  // Exact split validation
  const sum = Math.round((donor + recipient) * 100) / 100;
  const target = Math.round(total * 100) / 100;

  if (sum !== target) {
    return {
      isValid: false,
      error: `Donor contribution (₹${donor}) and recipient contribution (₹${recipient}) must equal total amount (₹${total}).`
    };
  }

  return { isValid: true };
}

/**
 * Creates a delivery request linking a donor listing and recipient destination.
 *
 * @param {Object} db Firestore instance
 * @param {Object} listing Listing document
 * @param {Object} recipientProfile Recipient profile document
 * @param {Object} costData { totalAmount, donorContribution, recipientContribution, handlingNotes, initiatorRole }
 * @returns {Promise<string>} Delivery Document ID
 */
export async function createDeliveryRequest(db, listing, recipientProfile, costData) {
  const { totalAmount = 0, donorContribution = 0, recipientContribution = 0, handlingNotes = '', initiatorRole = 'recipient' } = costData;

  const costValidation = validateCostAgreement(totalAmount, donorContribution, recipientContribution);
  if (!costValidation.isValid) {
    throw new Error(costValidation.error);
  }

  const isDonorInitiator = initiatorRole === 'donor';
  const initialStatus = totalAmount === 0 ? DELIVERY_STATUSES.REQUESTED : DELIVERY_STATUSES.PENDING_AGREEMENT;

  const deliveryData = {
    listingId: listing.id,
    listingTitle: listing.title,
    quantity: listing.quantity,
    unit: listing.unit,
    foodState: listing.foodState,
    storageCondition: listing.storageCondition,
    safeUseDeadline: listing.safeUseDeadline,
    handlingNotes: handlingNotes || listing.pickupInstructions || '',

    // Donor Info (Private pickup details)
    donorId: listing.donorId,
    donorName: listing.donorName,
    donorPhone: listing.contactPhone,
    pickupAddress: listing.address,
    pickupDistrict: listing.district,
    pickupLatitude: listing.latitude,
    pickupLongitude: listing.longitude,
    pickupInstructions: listing.pickupInstructions || '',

    // Recipient Info (Private dropoff details)
    recipientId: recipientProfile.userId || recipientProfile.id,
    recipientName: recipientProfile.organizationName,
    recipientPhone: recipientProfile.phone,
    dropoffAddress: recipientProfile.address,
    dropoffDistrict: recipientProfile.district,
    dropoffLatitude: recipientProfile.latitude || 12.9716,
    dropoffLongitude: recipientProfile.longitude || 77.5946,

    // Distance
    approxDistanceKm: listing.distanceKm || 2.5,

    // Cost Agreement
    totalAmount: Number(totalAmount),
    donorContribution: Number(donorContribution),
    recipientContribution: Number(recipientContribution),
    donorAgreed: isDonorInitiator || totalAmount === 0,
    recipientAgreed: !isDonorInitiator || totalAmount === 0,

    // Lifecycle State
    status: initialStatus,
    assignedPartnerId: null,
    assignedPartnerName: null,
    assignedPartnerPhone: null,
    transportMode: null,
    assignedAt: null,
    pickupConfirmedAt: null,
    deliveredAt: null,
    completedAt: null,
    disputeReason: null,
    failureReason: null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'deliveries'), deliveryData);

  // Link delivery ID to listing
  const listRef = doc(db, 'listings', listing.id);
  await updateDoc(listRef, {
    deliveryId: docRef.id,
    deliveryMode: 'delivery_partner',
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

/**
 * Confirms mutual agreement on delivery cost split.
 * When both parties agree, moves status to 'requested' so delivery partners can see it.
 *
 * @param {Object} db
 * @param {string} deliveryId
 * @param {'donor'|'recipient'} partyRole
 */
export async function confirmDeliveryAgreement(db, deliveryId, partyRole) {
  const deliveryRef = doc(db, 'deliveries', deliveryId);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(deliveryRef);
    if (!snap.exists()) throw new Error('Delivery request not found');

    const data = snap.data();
    const donorAgreed = partyRole === 'donor' ? true : data.donorAgreed;
    const recipientAgreed = partyRole === 'recipient' ? true : data.recipientAgreed;

    const bothAgreed = donorAgreed && recipientAgreed;
    const newStatus = bothAgreed ? DELIVERY_STATUSES.REQUESTED : DELIVERY_STATUSES.PENDING_AGREEMENT;

    transaction.update(deliveryRef, {
      donorAgreed,
      recipientAgreed,
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    return { bothAgreed, status: newStatus };
  });
}

/**
 * Atomically claims a delivery request by a verified delivery partner.
 * Ensures exactly ONE partner gets assigned.
 *
 * @param {Object} db
 * @param {string} deliveryId
 * @param {string} partnerId
 * @param {Object} partnerProfile
 */
export async function claimDeliveryAtomic(db, deliveryId, partnerId, partnerProfile) {
  if (partnerProfile.verificationStatus !== 'verified') {
    throw new Error('Delivery partner must be verified by administrators before claiming deliveries.');
  }

  const deliveryRef = doc(db, 'deliveries', deliveryId);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(deliveryRef);
    if (!snap.exists()) throw new Error('Delivery request not found');

    const delivery = snap.data();

    if (delivery.status !== DELIVERY_STATUSES.REQUESTED) {
      if (delivery.status === DELIVERY_STATUSES.ASSIGNED) {
        const err = new Error('This delivery request was already claimed by another delivery partner.');
        err.code = 'ALREADY_ASSIGNED';
        throw err;
      }
      throw new Error(`Delivery cannot be claimed in its current status (${delivery.status}).`);
    }

    transaction.update(deliveryRef, {
      status: DELIVERY_STATUSES.ASSIGNED,
      assignedPartnerId: partnerId,
      assignedPartnerName: partnerProfile.fullName || 'Verified Courier',
      assignedPartnerPhone: partnerProfile.phone || '',
      transportMode: partnerProfile.transportMode || 'two_wheeler',
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Also update listing status to in_transit
    if (delivery.listingId) {
      const listRef = doc(db, 'listings', delivery.listingId);
      transaction.update(listRef, {
        status: 'in_transit',
        deliveryPartnerId: partnerId,
        updatedAt: serverTimestamp()
      });
    }

    return { success: true };
  });
}

/**
 * Enforces valid delivery status transitions with role authorizations.
 *
 * @param {Object} db
 * @param {string} deliveryId
 * @param {string} targetStatus
 * @param {Object} actor { uid, role }
 * @param {Object} [metadata] optional notes or reasons
 */
export async function transitionDeliveryStatus(db, deliveryId, targetStatus, actor, metadata = {}) {
  const deliveryRef = doc(db, 'deliveries', deliveryId);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(deliveryRef);
    if (!snap.exists()) throw new Error('Delivery request not found');

    const delivery = snap.data();
    const current = delivery.status;

    // Validate authorized transition
    if (targetStatus === DELIVERY_STATUSES.PICKED_UP) {
      // Must be currently assigned
      if (current !== DELIVERY_STATUSES.ASSIGNED) {
        throw new Error(`Cannot mark picked up from current status: ${current}`);
      }
      transaction.update(deliveryRef, {
        status: DELIVERY_STATUSES.PICKED_UP,
        pickupConfirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else if (targetStatus === DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION) {
      // Must be currently picked_up
      if (current !== DELIVERY_STATUSES.PICKED_UP) {
        throw new Error(`Cannot mark delivered from current status: ${current}`);
      }
      transaction.update(deliveryRef, {
        status: DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION,
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else if (targetStatus === DELIVERY_STATUSES.COMPLETED) {
      // Must be delivered_pending_confirmation
      if (current !== DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION && current !== DELIVERY_STATUSES.PICKED_UP) {
        throw new Error(`Cannot complete delivery before arrival: ${current}`);
      }
      transaction.update(deliveryRef, {
        status: DELIVERY_STATUSES.COMPLETED,
        completedAt: serverTimestamp(),
        recipientConfirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Update listing to completed
      if (delivery.listingId) {
        const listRef = doc(db, 'listings', delivery.listingId);
        transaction.update(listRef, {
          status: 'completed',
          completedAt: serverTimestamp(),
          handoverConfirmedByRecipient: true,
          updatedAt: serverTimestamp()
        });
      }
    } else if (targetStatus === DELIVERY_STATUSES.FAILED) {
      transaction.update(deliveryRef, {
        status: DELIVERY_STATUSES.FAILED,
        failureReason: metadata.reason || 'Transport failed to complete.',
        updatedAt: serverTimestamp()
      });
    } else if (targetStatus === DELIVERY_STATUSES.DISPUTED) {
      transaction.update(deliveryRef, {
        status: DELIVERY_STATUSES.DISPUTED,
        disputeReason: metadata.reason || 'Disputed by participant.',
        disputedBy: actor.uid,
        disputedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      throw new Error(`Unsupported delivery transition to ${targetStatus}`);
    }

    return { previousStatus: current, newStatus: targetStatus };
  });
}
