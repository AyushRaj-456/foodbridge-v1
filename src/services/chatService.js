import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion
} from './firebase';

/**
 * Retrieves or creates a private conversation for a specific donation listing.
 * Exactly one conversation exists per donation (document ID = donationId).
 *
 * @param {Object} dbInstance Firestore instance
 * @param {Object} params
 * @param {string} params.donationId Listing ID
 * @param {string} [params.donationTitle] Listing title
 * @param {string} [params.donorId] Donor user UID
 * @param {string} [params.donorName] Donor display name
 * @param {string} [params.recipientId] Recipient user UID
 * @param {string} [params.recipientName] Recipient organization name
 * @returns {Promise<Object>} Conversation document data
 */
export async function getOrCreateConversation(dbInstance = db, {
  donationId,
  donationTitle = 'Food Donation Coordination',
  donorId = '',
  donorName = 'Food Donor',
  recipientId = '',
  recipientName = 'Recipient Organization'
} = {}) {
  if (!donationId) throw new Error('donationId is required');

  const convRef = doc(dbInstance, 'conversations', donationId);
  try {
    const snap = await getDoc(convRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
  } catch (err) {
    console.warn('Checking existing conversation notice:', err.message);
  }

  const participants = [donorId, recipientId].filter(Boolean);

  const initialData = {
    donationId,
    donationTitle: donationTitle || 'Surplus Food Donation',
    donorId: donorId || '',
    donorName: donorName || 'Food Donor',
    recipientId: recipientId || '',
    recipientName: recipientName || 'Recipient Organization',
    deliveryPartnerId: null,
    deliveryPartnerName: null,
    participants,
    participantDetails: {
      ...(donorId ? { [donorId]: { name: donorName || 'Food Donor', role: 'donor' } } : {}),
      ...(recipientId ? { [recipientId]: { name: recipientName || 'Recipient Organization', role: 'recipient' } } : {})
    },
    lastMessage: {
      text: `Food donation accepted by ${recipientName || 'Recipient Organization'}. Direct pickup coordination started.`,
      senderId: 'system',
      senderName: 'System',
      timestamp: new Date()
    },
    unreadCounts: {
      ...(donorId ? { [donorId]: 0 } : {}),
      ...(recipientId ? { [recipientId]: 0 } : {})
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(convRef, initialData, { merge: true });
  } catch (setErr) {
    console.warn('Conversation setDoc notice:', setErr.message);
  }

  // Add initial system announcement message
  try {
    const msgCollection = collection(dbInstance, 'conversations', donationId, 'messages');
    await addDoc(msgCollection, {
      senderId: 'system',
      senderName: 'FoodBridge Platform',
      senderRole: 'system',
      text: `Food donation accepted by ${recipientName || 'Recipient Organization'}. Direct pickup coordination started.`,
      isSystemMessage: true,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      clientTimestamp: Date.now(),
      readBy: participants
    });
  } catch (msgErr) {
    console.warn('Initial system message write notice:', msgErr.message);
  }

  return { id: donationId, ...initialData };
}

/**
 * Adds an assigned delivery partner to an existing conversation.
 * Converts the 2-party conversation into a 3-party group conversation
 * while preserving all previous messages.
 *
 * @param {Object} dbInstance
 * @param {string} conversationId (equals donationId)
 * @param {Object} partner { partnerId, partnerName, phone }
 */
export async function addDeliveryPartnerToConversation(dbInstance = db, conversationId, {
  partnerId,
  partnerName,
  phone
}) {
  if (!conversationId || !partnerId) return;

  const convRef = doc(dbInstance, 'conversations', conversationId);

  try {
    await setDoc(convRef, {
      deliveryPartnerId: partnerId,
      deliveryPartnerName: partnerName || 'Delivery Partner',
      participants: arrayUnion(partnerId),
      isThreePartyGroup: true,
      participantDetails: {
        [partnerId]: {
          name: partnerName || 'Delivery Partner',
          role: 'delivery',
          phone: phone || ''
        }
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('addDeliveryPartnerToConversation update notice:', err.message);
  }

  // Post system announcement message
  await sendChatMessage(dbInstance, conversationId, {
    senderId: 'system',
    senderName: 'FoodBridge Platform',
    senderRole: 'system',
    text: `Delivery partner ${partnerName || 'Courier'} joined this coordination group.`,
    isSystemMessage: true
  });
}

/**
 * Sends a message in a conversation.
 *
 * @param {Object} dbInstance
 * @param {string} conversationId
 * @param {Object} messageData
 * @param {string} messageData.senderId
 * @param {string} messageData.senderName
 * @param {string} messageData.senderRole 'donor' | 'recipient' | 'delivery' | 'system'
 * @param {string} messageData.text
 * @param {boolean} [messageData.isSystemMessage=false]
 * @param {Object} [messageData.meta] Extra coordination metadata (e.g. delivery cost props)
 * @returns {Promise<string>} Message Document ID
 */
export async function sendChatMessage(dbInstance = db, conversationId, {
  senderId,
  senderName,
  senderRole,
  text,
  isSystemMessage = false,
  meta = null
}) {
  if (!conversationId || !text?.trim()) return null;

  const msgCollection = collection(dbInstance, 'conversations', conversationId, 'messages');
  const nowMs = Date.now();

  const msgDoc = await addDoc(msgCollection, {
    senderId: senderId || 'user',
    senderName: senderName || 'User',
    senderRole: senderRole || 'user',
    text: text.trim(),
    isSystemMessage: Boolean(isSystemMessage),
    meta: meta || null,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
    clientTimestamp: nowMs,
    readBy: senderId ? [senderId] : []
  });

  // Update conversation parent document (use setDoc with merge to avoid 'No document to update')
  const convRef = doc(dbInstance, 'conversations', conversationId);
  try {
    await setDoc(convRef, {
      donationId: conversationId,
      lastMessage: {
        text: text.trim(),
        senderId: senderId || 'user',
        senderName: senderName || 'User',
        senderRole: senderRole || 'user',
        timestamp: new Date()
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Conversation lastMessage update notice:', err.message);
  }

  return msgDoc.id;
}

/**
 * Subscribes to real-time messages in a conversation.
 * Handles both standard ordered queries and in-memory sorting fallback.
 *
 * @param {Object} dbInstance
 * @param {string} conversationId
 * @param {Function} onUpdate Callback receiving array of messages
 * @param {Function} [onError]
 * @returns {Function} Unsubscribe function
 */
export function subscribeToMessages(dbInstance = db, conversationId, onUpdate, onError) {
  if (!conversationId) return () => {};

  const msgCollection = collection(dbInstance, 'conversations', conversationId, 'messages');

  // Try ordered query first
  try {
    const q = query(msgCollection, orderBy('timestamp', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            ...d,
            // Fallback timestamp if pending local write
            timestamp: d.timestamp || d.createdAt || (d.clientTimestamp ? { seconds: Math.floor(d.clientTimestamp / 1000) } : null)
          };
        });

        // Ensure chronological order
        messages.sort((a, b) => {
          const tA = a.timestamp?.seconds || (a.clientTimestamp ? a.clientTimestamp / 1000 : 0);
          const tB = b.timestamp?.seconds || (b.clientTimestamp ? b.clientTimestamp / 1000 : 0);
          return tA - tB;
        });

        onUpdate(messages);
      },
      (err) => {
        console.warn('Primary messages query notice, trying unordered listener fallback:', err.message);
        // Fallback without orderBy clause (handles index issues or pending fields)
        try {
          return onSnapshot(
            msgCollection,
            (snap) => {
              const messages = snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
                timestamp: d.data().timestamp || d.data().createdAt || (d.data().clientTimestamp ? { seconds: Math.floor(d.data().clientTimestamp / 1000) } : null)
              }));
              messages.sort((a, b) => {
                const tA = a.timestamp?.seconds || (a.clientTimestamp ? a.clientTimestamp / 1000 : 0);
                const tB = b.timestamp?.seconds || (b.clientTimestamp ? b.clientTimestamp / 1000 : 0);
                return tA - tB;
              });
              onUpdate(messages);
            },
            (fallbackErr) => {
              console.error('Messages subscription failed completely:', fallbackErr);
              if (onError) onError(fallbackErr);
            }
          );
        } catch (innerErr) {
          if (onError) onError(err);
        }
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Subscribes to a conversation's metadata (participants, status, etc.).
 *
 * @param {Object} dbInstance
 * @param {string} conversationId
 * @param {Function} onUpdate
 * @returns {Function} Unsubscribe function
 */
export function subscribeToConversation(dbInstance = db, conversationId, onUpdate) {
  if (!conversationId) return () => {};

  const convRef = doc(dbInstance, 'conversations', conversationId);
  return onSnapshot(
    convRef,
    (snap) => {
      const exists = snap && (typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists));
      if (exists) {
        const data = typeof snap.data === 'function' ? snap.data() : snap;
        onUpdate({ id: snap.id, ...data });
      }
    },
    (err) => {
      console.warn('Conversation onSnapshot notice:', err.message);
    }
  );
}
