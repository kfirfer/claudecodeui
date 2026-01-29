/**
 * Platform Detection Utilities
 *
 * Utility functions to detect the user's platform, browser, and notification
 * capabilities for showing appropriate UI guidance.
 *
 * @module utils/platformDetection
 */

/**
 * Detect the current platform and browser
 * @returns {Object} Platform detection results
 */
export const detectPlatform = () => {
  const ua = navigator.userAgent;

  return {
    // Device type
    isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    isAndroid: /Android/i.test(ua),

    // Browser detection
    isChrome: /Chrome/i.test(ua) && !/Edge|Edg/i.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
    isFirefox: /Firefox/i.test(ua),
    isEdge: /Edge|Edg/i.test(ua),

    // PWA mode detection
    isPWA: window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true,

    // Feature support
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotificationAPI: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
  };
};

/**
 * Get notification support status with reason
 * @returns {Object} Support status with reason and message
 */
export const getNotificationSupport = () => {
  const platform = detectPlatform();

  // iOS Safari requires PWA mode for notifications
  if (platform.isIOS && platform.isSafari && !platform.isPWA) {
    return {
      supported: false,
      reason: 'ios-safari-requires-pwa',
      message: 'Add this app to your Home Screen to enable notifications'
    };
  }

  // iOS Chrome/Firefox also use WebKit, so same restriction
  if (platform.isIOS && !platform.isPWA) {
    return {
      supported: false,
      reason: 'ios-requires-pwa',
      message: 'Add this app to your Home Screen to enable notifications'
    };
  }

  // Check for basic requirements
  if (!platform.hasServiceWorker) {
    return {
      supported: false,
      reason: 'no-service-worker',
      message: 'Your browser does not support Service Workers'
    };
  }

  if (!platform.hasNotificationAPI) {
    return {
      supported: false,
      reason: 'no-notification-api',
      message: 'Your browser does not support notifications'
    };
  }

  // Check if showNotification is available
  if (!('showNotification' in ServiceWorkerRegistration.prototype)) {
    return {
      supported: false,
      reason: 'no-sw-notification',
      message: 'Your browser does not support Service Worker notifications'
    };
  }

  return {
    supported: true,
    reason: null,
    message: null,
    platform
  };
};

