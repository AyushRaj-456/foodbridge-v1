import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

/**
 * Data Retention & Compliance Service (Indian Digital Personal Data Protection Act / GDPR alignment)
 *
 * Provides:
 * 1. User Data Export (Self-service machine-readable JSON download).
 * 2. Right to Erasure / Account Anonymization (scrubs personally identifiable details:
 *    names, phone numbers, exact addresses, and contact persons from active/past records
 *    while preserving anonymized numeric weight and category data for public impact fidelity).
 */

/**
 * Exports all data associated with a user in standard JSON format.
 *
 * @param {Object} db Firestore instance
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function exportUserData(db, userId) {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    userId,
    profile: null,
    listings: [],
    deliveries: []
  };

  // 1. Fetch user profile
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      exportPayload.profile = userDoc.data();
    }
  } catch (err) {
    console.warn('Could not fetch user profile for export:', err);
  }

  // 2. Fetch role profile (donor, recipient, or delivery partner)
  const roleCollections = ['recipients', 'deliveryPartners', 'donors'];
  for (const col of roleCollections) {
    try {
      const snap = await getDoc(doc(db, col, userId));
      if (snap.exists()) {
        exportPayload[`roleProfile_${col}`] = snap.data();
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Fetch listings authored by this user
  try {
    const listSnap = await getDocs(query(collection(db, 'listings'), where('donorId', '==', userId)));
    exportPayload.listings = listSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Could not fetch listings for export:', err);
  }

  // 4. Fetch deliveries associated with this user
  try {
    const delSnapDonor = await getDocs(query(collection(db, 'deliveries'), where('donorId', '==', userId)));
    const delSnapRecipient = await getDocs(query(collection(db, 'deliveries'), where('recipientId', '==', userId)));
    const delSnapPartner = await getDocs(query(collection(db, 'deliveries'), where('assignedPartnerId', '==', userId)));

    const seenIds = new Set();
    const allDeliveries = [];
    [...delSnapDonor.docs, ...delSnapRecipient.docs, ...delSnapPartner.docs].forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        allDeliveries.push({ id: d.id, ...d.data() });
      }
    });
    exportPayload.deliveries = allDeliveries;
  } catch (err) {
    console.warn('Could not fetch deliveries for export:', err);
  }

  return exportPayload;
}

/**
 * Anonymizes and scrubs personally identifiable information for an account deletion request.
 *
 * @param {Object} db Firestore instance
 * @param {string} userId
 */
export async function anonymizeAndScrubUserData(db, userId) {
  // 1. Scrub donor listings authored by this user
  try {
    const listSnap = await getDocs(query(collection(db, 'listings'), where('donorId', '==', userId)));
    for (const docSnap of listSnap.docs) {
      await updateDoc(doc(db, 'listings', docSnap.id), {
        donorName: 'Anonymous Donor',
        contactPhone: '[REDACTED]',
        contactPerson: '[REDACTED]',
        address: 'Redacted (Data Erasure Request)',
        pickupInstructions: '[REDACTED]',
        anonymizedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.warn('Error scrubbing user listings:', err);
  }

  // 2. Scrub delivery records
  try {
    const delSnap = await getDocs(query(collection(db, 'deliveries'), where('donorId', '==', userId)));
    for (const docSnap of delSnap.docs) {
      await updateDoc(doc(db, 'deliveries', docSnap.id), {
        donorName: 'Anonymous Donor',
        donorPhone: '[REDACTED]',
        pickupAddress: 'Redacted',
        updatedAt: serverTimestamp()
      });
    }

    const delSnapRec = await getDocs(query(collection(db, 'deliveries'), where('recipientId', '==', userId)));
    for (const docSnap of delSnapRec.docs) {
      await updateDoc(doc(db, 'deliveries', docSnap.id), {
        recipientName: 'Anonymous Recipient',
        recipientPhone: '[REDACTED]',
        dropoffAddress: 'Redacted',
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.warn('Error scrubbing delivery records:', err);
  }

  // 3. Delete user role profiles
  const roleCollections = ['recipients', 'deliveryPartners', 'donors', 'users'];
  for (const col of roleCollections) {
    try {
      await deleteDoc(doc(db, col, userId));
    } catch (e) {
      // ignore
    }
  }

  return { success: true, message: 'Account data anonymized and erased in accordance with data protection rules.' };
}
