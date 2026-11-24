import {
  db,
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  limit
} from './firebase';

/**
 * FoodBridge Notification Service
 *
 * Implements resilient in-app notifications with optional web push fallback.
 * Strictly respects user preference and avoids intrusive permission popups on first load.
 */

/**
 * Checks if browser supports the native Web Notifications API.
 * @returns {boolean}
 */
export function isPushNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Gets the current notification permission state ('default', 'granted', 'denied').
 * @returns {string}
 */
export function getNotificationPermission() {
  if (!isPushNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Requests browser notification permission with user-initiated explanation.
 * Strictly called only when the user explicitly clicks "Enable Alerts" in settings.
 *
 * @returns {Promise<{ granted: boolean, status: string }>}
 */
export async function requestPushPermission() {
  if (!isPushNotificationSupported()) {
    return { granted: false, status: 'unsupported' };
  }

  try {
    const permission = await Notification.requestPermission();
    return {
      granted: permission === 'granted',
      status: permission
    };
  } catch (err) {
    console.warn('Notification permission request error:', err);
    return { granted: false, status: 'error' };
  }
}

/**
 * Sends a local browser notification if granted.
 *
 * @param {string} title
 * @param {Object} options
 */
export function showLocalNotification(title, options = {}) {
  if (!isPushNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const defaultOptions = {
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag: 'foodbridge-alert',
      renotify: true,
      ...options
    };

    return new Notification(title, defaultOptions);
  } catch (err) {
    console.warn('Error showing local notification:', err);
    return null;
  }
}

/**
 * Sends an in-app notification stored in Firestore and triggers local browser alert if allowed.
 * Supports structured keys and parameters for complete multilingual rendering.
 *
 * @param {Object} dbInstance Firestore instance
 * @param {Object} params
 * @param {string} params.recipientId Target user UID
 * @param {string} params.title Notification headline (English fallback)
 * @param {string} params.body Descriptive text (English fallback)
 * @param {string} [params.titleKey] Localization key for title
 * @param {string} [params.bodyKey] Localization key for body
 * @param {Object} [params.params] Dynamic interpolation parameters
 * @param {string} [params.link] Route to navigate to on click
 * @param {string} [params.type] 'acceptance' | 'message' | 'delivery' | 'status' | 'system'
 * @param {string} [params.donationId] Linked listing ID
 * @returns {Promise<string>} Notification Document ID
 */
export async function sendInAppNotification(dbInstance = db, {
  recipientId,
  title,
  body,
  link = null,
  type = 'general',
  donationId = null,
  titleKey = null,
  bodyKey = null,
  params = null
}) {
  if (!recipientId || !title) return null;

  try {
    const notifCollection = collection(dbInstance, 'notifications');
    const docData = {
      recipientId,
      title: title.trim(),
      body: (body || '').trim(),
      link: link || null,
      type: type || 'general',
      donationId: donationId || null,
      read: false,
      createdAt: serverTimestamp()
    };

    if (titleKey) docData.titleKey = titleKey;
    if (bodyKey) docData.bodyKey = bodyKey;
    if (params && typeof params === 'object') docData.params = params;

    const docRef = await addDoc(notifCollection, docData);

    // Also trigger local browser push notification if permission granted
    showLocalNotification(title, { body });

    return docRef.id;
  } catch (err) {
    console.warn('Error saving in-app notification:', err.message);
    return null;
  }
}

/**
 * Renders the localized headline and body for any notification record.
 * Supports both structured key-based notifications and legacy English notifications.
 *
 * @param {Object} notif Notification document
 * @param {Function} t Translation function from useLocale()
 * @returns {{ title: string, body: string }}
 */
export function localizeNotification(notif, t) {
  if (!notif) return { title: '', body: '' };

  // 1. Structured notification with translation keys
  if (notif.titleKey) {
    const localizedTitle = t(notif.titleKey, notif.params || {});
    const localizedBody = notif.bodyKey ? t(notif.bodyKey, notif.params || {}) : notif.body;
    return { title: localizedTitle, body: localizedBody };
  }

  // 2. Legacy notifications without keys: intelligent pattern matching and fallback
  const rawTitle = notif.title || '';
  const rawBody = notif.body || '';

  // Donation Accepted
  if (/Donation Accepted:\s*(.*)/i.test(rawTitle)) {
    const match = rawTitle.match(/Donation Accepted:\s*(.*)/i);
    const titleVal = match ? match[1].trim() : '';
    const localizedTitle = t('notifications.donationAcceptedTitle', { title: titleVal });
    const orgMatch = rawBody.match(/^(.*?)\s+has accepted/i);
    const recipientName = orgMatch ? orgMatch[1] : 'An organization';
    const localizedBody = t('notifications.donationAcceptedBody', { recipientName });
    return { title: localizedTitle, body: localizedBody };
  }

  // Donation Claimed
  if (/Donation Claimed:\s*(.*)/i.test(rawTitle)) {
    const match = rawTitle.match(/Donation Claimed:\s*(.*)/i);
    const titleVal = match ? match[1].trim() : '';
    const localizedTitle = t('notifications.donationClaimedTitle', { title: titleVal });
    const claimMatch = rawBody.match(/claimed\s+([\d.]+)\s*(\w+)\s+from\s+(.*?)\./i);
    if (claimMatch) {
      const localizedBody = t('notifications.donationClaimedBody', {
        quantity: claimMatch[1],
        unit: claimMatch[2],
        donorName: claimMatch[3]
      });
      return { title: localizedTitle, body: localizedBody };
    }
    return { title: localizedTitle, body: rawBody };
  }

  // Delivery Partner Assigned
  if (/Delivery Partner Assigned:\s*(.*)/i.test(rawTitle) || /Courier Assigned/i.test(rawTitle)) {
    const match = rawTitle.match(/:\s*(.*)/i);
    const titleVal = match ? match[1].trim() : '';
    const localizedTitle = t('notifications.courierAssignedTitle', { title: titleVal });
    const nameMatch = rawBody.match(/^(.*?)\s+has claimed/i);
    const courierName = nameMatch ? nameMatch[1] : 'Delivery partner';
    const localizedBody = t('notifications.courierAssignedBody', { courierName, title: titleVal });
    return { title: localizedTitle, body: localizedBody };
  }

  // Pickup Completed
  if (/Pickup Completed:\s*(.*)/i.test(rawTitle)) {
    const match = rawTitle.match(/:\s*(.*)/i);
    const titleVal = match ? match[1].trim() : '';
    return {
      title: t('notifications.pickupCompletedTitle', { title: titleVal }),
      body: rawBody
    };
  }

  // Handover / Delivery Completed
  if (/Food Handover Completed:\s*(.*)/i.test(rawTitle) || /Delivery Completed/i.test(rawTitle)) {
    const match = rawTitle.match(/:\s*(.*)/i);
    const titleVal = match ? match[1].trim() : '';
    return {
      title: t('notifications.deliveryCompletedTitle', { title: titleVal }),
      body: t('notifications.deliveryCompletedBody', { title: titleVal })
    };
  }

  // Direct Handover Completed
  if (/Direct Handover/i.test(rawTitle)) {
    const match = rawTitle.match(/:\s*(.*)/i);
    const titleVal = match ? match[1].trim() : '';
    return {
      title: t('notifications.handoverCompletedTitle', { title: titleVal }),
      body: t('notifications.handoverCompletedBody', { title: titleVal })
    };
  }

  // Tokens Awarded
  if (/Reward Tokens Credited/i.test(rawTitle) || /Tokens Earned/i.test(rawTitle)) {
    const tokenMatch = rawBody.match(/earned\s+(\d+)\s+tokens/i);
    const tokens = tokenMatch ? tokenMatch[1] : '10';
    const qtyMatch = rawBody.match(/(\d+(\.\d+)?)\s*kg/i);
    const quantity = qtyMatch ? qtyMatch[1] : '2';
    return {
      title: t('notifications.tokensAwardedTitle'),
      body: t('notifications.tokensAwardedBody', { tokens, quantity })
    };
  }

  // Support Payment
  if (/Support Payment Successful/i.test(rawTitle)) {
    return {
      title: t('notifications.paymentSuccessTitle'),
      body: rawBody
    };
  }

  // Fallback to raw title and body
  return { title: rawTitle, body: rawBody };
}

/**
 * Real-time listener for user's in-app notifications.
 *
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {Function} onUpdate Callback receiving { notifications, unreadCount }
 * @returns {Function} Unsubscribe function
 */
export function subscribeToUserNotifications(dbInstance = db, userId, onUpdate) {
  if (!userId) return () => {};

  const notifCollection = collection(dbInstance, 'notifications');
  const q = query(notifCollection, where('recipientId', '==', userId), limit(30));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      // Sort descending by timestamp in memory (no index requirement)
      items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.seconds || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });

      const unreadCount = items.filter((n) => !n.read).length;
      onUpdate({ notifications: items, unreadCount });
    },
    (err) => {
      console.warn('Notifications onSnapshot notice:', err.message);
    }
  );
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(dbInstance = db, notificationId) {
  if (!notificationId) return;
  try {
    const notifRef = doc(dbInstance, 'notifications', notificationId);
    await updateDoc(notifRef, {
      read: true,
      readAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Error marking notification as read:', err.message);
  }
}

/**
 * Marks multiple notifications as read.
 */
export async function markAllNotificationsAsRead(dbInstance = db, notifications = []) {
  if (!notifications.length) return;
  const unread = notifications.filter((n) => !n.read);
  await Promise.all(
    unread.map((n) => markNotificationAsRead(dbInstance, n.id))
  );
}
