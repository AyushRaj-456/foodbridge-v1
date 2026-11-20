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
 * @param {string} params.donationTitle Listing title
 * @param {string} params.donorId Donor user UID
 * @param {string} params.donorName Donor display name
 * @param {string} params.recipientId Recipient user UID
 * @param {string} params.recipientName Recipient organization name
 * @returns {Promise<Object>} Conversation document data
 */
export async function getOrCreateConversation(dbInstance = db, {
  donationId,
  donationTitle,
  donorId,
  donorName,
  recipientId,
  recipientName
}) {
  if (!donationId) throw new Error('donationId is required');

  const convRef = doc(dbInstance, 'conversations', donationId);
  const snap = await getDoc(convRef);

  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }

  // Create initial 2-party conversation
  const initialData = {
    donationId,
    donationTitle: donationTitle || 'Surplus Food Donation',
    donorId,
    donorName: donorName || 'Food Donor',
    recipientId,
    recipientName: recipientName || 'Recipient Organization',
    deliveryPartnerId: null,
    deliveryPartnerName: null,
    participants: [donorId, recipientId],
    participantDetails: {
      [donorId]: { name: donorName || 'Food Donor', role: 'donor' },
      [recipientId]: { name: recipientName || 'Recipient Organization', role: 'recipient' }
    },
    lastMessage: {
      text: `Food donation accepted by ${recipientName || 'Recipient Organization'}. Direct pickup coordination started.`,
      senderId: 'system',
      senderName: 'System',
      timestamp: new Date()
    },
    unreadCounts: {
      [donorId]: 1,
      [recipientId]: 0
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(convRef, initialData, { merge: true });

  // Add initial system message
  try {
    const msgCollection = collection(dbInstance, 'conversations', donationId, 'messages');
    await addDoc(msgCollection, {
      senderId: 'system',
      senderName: 'FoodBridge Platform',
      senderRole: 'system',
      text: `Food donation accepted by ${recipientName || 'Recipient Organization'}. Direct pickup coordination started.`,
      isSystemMessage: true,
      timestamp: serverTimestamp(),
      readBy: [recipientId]
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

  await updateDoc(convRef, {
    deliveryPartnerId: partnerId,
    deliveryPartnerName: partnerName || 'Delivery Partner',
    participants: arrayUnion(partnerId),
    [`participantDetails.${partnerId}`]: {
      name: partnerName || 'Delivery Partner',
      role: 'delivery',
      phone: phone || ''
    },
    updatedAt: serverTimestamp()
  });

  // Post system announcement message
  await sendChatMessage(dbInstance, conversationId, {
    senderId: 'system',
    senderName: 'FoodBridge Platform',
    senderRole: 'system',
    text: `${partnerName || 'Delivery Partner'} has been assigned and joined this conversation.`,
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
  const msgDoc = await addDoc(msgCollection, {
    senderId,
    senderName: senderName || 'User',
    senderRole: senderRole || 'user',
    text: text.trim(),
    isSystemMessage: Boolean(isSystemMessage),
    meta: meta || null,
    timestamp: serverTimestamp(),
    readBy: [senderId]
  });

  // Update conversation parent document
  const convRef = doc(dbInstance, 'conversations', conversationId);
  try {
    await updateDoc(convRef, {
      lastMessage: {
        text: text.trim(),
        senderId,
        senderName: senderName || 'User',
        timestamp: new Date()
      },
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Conversation lastMessage update notice:', err.message);
  }

  return msgDoc.id;
}

/**
 * Subscribes to real-time messages in a conversation.
 *
 * @param {Object} dbInstance
 * @param {string} conversationId
 * @param {Function} onUpdate Callback receiving array of messages
 * @param {Function} onError
 * @returns {Function} Unsubscribe function
 */
export function subscribeToMessages(dbInstance = db, conversationId, onUpdate, onError) {
  if (!conversationId) return () => {};

  const msgCollection = collection(dbInstance, 'conversations', conversationId, 'messages');
  const q = query(msgCollection, orderBy('timestamp', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      onUpdate(messages);
    },
    (err) => {
      console.warn('Chat messages onSnapshot subscription notice:', err.message);
      if (onError) onError(err);
    }
  );
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
