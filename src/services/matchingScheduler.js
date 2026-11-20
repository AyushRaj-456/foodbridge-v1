import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import {
  findEligibleRecipients,
  isRadiusExpansionDue,
  getNextExpansionRadius,
  INITIAL_RADIUS_KM
} from './matchingEngine';

/**
 * Runs the matching cycle for an active listing or batch of listings.
 * Idempotent: re-running it never duplicates notifications or re-notifies declined recipients.
 *
 * @param {Object} db Firestore instance
 * @param {string} [specificListingId] Optional specific listing ID to evaluate
 * @returns {Promise<{ processedListings: number, notificationsSent: number, expansions: number }>}
 */
export async function runMatchingCycle(db, specificListingId = null) {
  let listingsToProcess = [];

  if (specificListingId) {
    const listingDoc = await getDocs(query(collection(db, 'listings'), where('__name__', '==', specificListingId)));
    if (!listingDoc.empty) {
      listingsToProcess = [{ id: listingDoc.docs[0].id, ...listingDoc.docs[0].data() }];
    }
  } else {
    // Process all listings currently in matching state
    const activeQuery = query(collection(db, 'listings'), where('status', '==', 'matching'));
    const activeSnap = await getDocs(activeQuery);
    listingsToProcess = activeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  if (listingsToProcess.length === 0) {
    return { processedListings: 0, notificationsSent: 0, expansions: 0 };
  }

  // Fetch all verified active recipients
  const recQuery = query(collection(db, 'recipients'), where('verificationStatus', '==', 'verified'));
  const recSnap = await getDocs(recQuery);
  const verifiedRecipients = recSnap.docs.map((d) => ({
    id: d.id,
    userId: d.data().userId || d.id,
    ...d.data()
  }));

  const now = new Date();
  let notificationsSent = 0;
  let expansions = 0;

  for (const listing of listingsToProcess) {
    // 1. Expiry check: if safe-use deadline passed, close listing
    if (listing.safeUseDeadline) {
      const deadline = new Date(listing.safeUseDeadline);
      if (deadline.getTime() <= now.getTime()) {
        const listRef = doc(db, 'listings', listing.id);
        await updateDoc(listRef, {
          status: 'expired',
          updatedAt: serverTimestamp()
        });
        continue; // Closed; stop matching
      }
    }

    let currentRadius = Number(listing.matchingRadiusKm) || INITIAL_RADIUS_KM;

    // 2. Radius expansion check (default 2 hours wait between steps)
    if (isRadiusExpansionDue(listing, now)) {
      const nextRadius = getNextExpansionRadius(currentRadius);
      if (nextRadius > currentRadius) {
        currentRadius = nextRadius;
        expansions += 1;
        const listRef = doc(db, 'listings', listing.id);
        await updateDoc(listRef, {
          matchingRadiusKm: nextRadius,
          radiusExpansionCount: (Number(listing.radiusExpansionCount) || 0) + 1,
          lastRadiusExpandedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3. Find eligible recipients within current radius
    const eligibleRecipients = findEligibleRecipients(listing, verifiedRecipients, currentRadius);

    const alreadyNotified = listing.notifiedRecipientIds || [];
    const declinedRecipients = listing.declinedRecipientIds || [];

    // Filter to ONLY newly eligible recipients
    const newlyEligible = eligibleRecipients.filter((r) => {
      const rId = r.userId || r.id;
      return !alreadyNotified.includes(rId) && !declinedRecipients.includes(rId);
    });

    if (newlyEligible.length === 0) continue;

    const listRef = doc(db, 'listings', listing.id);
    const newlyNotifiedIds = [];

    for (const recipient of newlyEligible) {
      const recipientId = recipient.userId || recipient.id;

      // Create in-app notification record
      await addDoc(collection(db, 'notifications'), {
        recipientId,
        recipientName: recipient.organizationName || 'Verified Organization',
        listingId: listing.id,
        listingTitle: listing.title,
        quantity: listing.quantity,
        unit: listing.unit,
        category: recipient.category,
        foodState: listing.foodState,
        storageCondition: listing.storageCondition,
        safeUseDeadline: listing.safeUseDeadline,
        distanceKm: recipient.distanceKm,
        status: 'active',
        read: false,
        createdAt: serverTimestamp()
      });

      newlyNotifiedIds.push(recipientId);
      notificationsSent += 1;
    }

    // Update listing with newly notified IDs to guarantee idempotency and prevent duplicates
    if (newlyNotifiedIds.length > 0) {
      await updateDoc(listRef, {
        notifiedRecipientIds: arrayUnion(...newlyNotifiedIds),
        updatedAt: serverTimestamp()
      });
    }
  }

  return {
    processedListings: listingsToProcess.length,
    notificationsSent,
    expansions
  };
}
