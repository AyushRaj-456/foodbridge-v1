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
 *
 * @param {Object} dbInstance Firestore instance
 * @param {Object} params
 * @param {string} params.recipientId Target user UID
 * @param {string} params.title Notification headline
 * @param {string} params.body Descriptive text
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
  donationId = null
}) {
  if (!recipientId || !title) return null;

  try {
    const notifCollection = collection(dbInstance, 'notifications');
    const docRef = await addDoc(notifCollection, {
      recipientId,
      title: title.trim(),
      body: (body || '').trim(),
      link: link || null,
      type: type || 'general',
      donationId: donationId || null,
      read: false,
      createdAt: serverTimestamp()
    });

    // Also trigger local browser push notification if permission granted
    showLocalNotification(title, { body });

    return docRef.id;
  } catch (err) {
    console.warn('Error saving in-app notification:', err.message);
    return null;
  }
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
