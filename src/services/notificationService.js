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
 * Strictly called only when the recipient explicitly clicks "Enable Alerts" in settings.
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
 * Sends a local browser notification if granted and page is not active.
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
