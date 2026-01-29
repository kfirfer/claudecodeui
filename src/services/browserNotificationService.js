/**
 * Browser Notification Service
 *
 * Service module that handles Service Worker registration and provides
 * a unified API for sending notifications across all browsers.
 * Uses ServiceWorkerRegistration.showNotification() for cross-platform compatibility.
 *
 * @module services/browserNotificationService
 */

/**
 * BrowserNotificationService class
 * Manages Service Worker registration and notification sending
 */
class BrowserNotificationService {
  constructor() {
    // oxlint-disable-next-line unicorn/prefer-class-fields -- ESLint parser doesn't support class fields in .js files
    this.registration = null;
    this.isRegistering = false;
    this.registrationPromise = null;
  }

  /**
   * Check if browser supports SW-based notifications
   * @returns {boolean} True if supported
   */
  static isSupported() {
    return 'serviceWorker' in navigator &&
           'Notification' in window &&
           'showNotification' in ServiceWorkerRegistration.prototype;
  }

  /**
   * Check if we can use the legacy Notification constructor
   * Safari doesn't support new Notification()
   * @returns {boolean} True if legacy API can be used
   */
  static canUseLegacyNotification() {
    if (!('Notification' in window)) {
      return false;
    }
    // Safari doesn't support new Notification()
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    return !isSafari;
  }

  /**
   * Wait for an existing registration to complete
   * @returns {Promise<ServiceWorkerRegistration>} The service worker registration
   */
  async waitForRegistration() {
    if (this.registrationPromise) {
      return this.registrationPromise;
    }
    // If no promise exists, try to get from navigator
    if ('serviceWorker' in navigator) {
      return navigator.serviceWorker.ready;
    }
    throw new Error('Service Worker not supported');
  }

  /**
   * Register the notification service worker with timeout
   * @param {number} timeout - Timeout in milliseconds (default 5000)
   * @returns {Promise<ServiceWorkerRegistration>} The service worker registration
   */
  async register(timeout = 5000) {
    // Return existing registration if available
    if (this.registration) {
      return this.registration;
    }

    // Wait for existing registration process
    if (this.isRegistering) {
      return this.waitForRegistration();
    }

    this.isRegistering = true;

    // Create a timeout promise for registration
    // oxlint-disable-next-line promise/avoid-new -- Timeout promises require explicit Promise construction
    const timeoutPromise = new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error('SW registration timeout')), timeout);
    });

    this.registrationPromise = (async () => {
      try {
        // Race between registration and timeout
        const result = await Promise.race([
          this._doRegister(),
          timeoutPromise
        ]);
        return result;
      } catch (error) {
        console.error('[NotificationService] Failed to register SW:', error);
        throw error;
      } finally {
        this.isRegistering = false;
      }
    })();

    return this.registrationPromise;
  }

  /**
   * Internal method to perform SW registration
   * @returns {Promise<ServiceWorkerRegistration>} The service worker registration
   */
  async _doRegister() {
    // Check for existing notification SW registration first
    const existingRegistrations = await navigator.serviceWorker.getRegistrations();
    const existingNotificationSW = existingRegistrations.find(
      reg => reg.active?.scriptURL.includes('notification-sw.js')
    );

    if (existingNotificationSW) {
      this.registration = existingNotificationSW;
      console.log('[NotificationService] Using existing SW registration');
      return this.registration;
    }

    // Register new SW
    this.registration = await navigator.serviceWorker.register(
      '/notification-sw.js',
      { scope: '/' }
    );

    // Wait for the SW to be ready
    await navigator.serviceWorker.ready;

    console.log('[NotificationService] SW registered successfully');
    return this.registration;
  }

  /**
   * Send notification using Service Worker
   * @param {string} title - Notification title
   * @param {Object} options - Notification options
   * @returns {Promise<void>}
   */
  async showNotification(title, options = {}) {
    if (!this.registration) {
      await this.register();
    }

    const notificationOptions = {
      icon: '/icons/claude-ai-icon.svg',
      badge: '/icons/icon-128x128.png',
      tag: options.tag || 'default',
      requireInteraction: false,
      ...options
    };

    return this.registration.showNotification(title, notificationOptions);
  }

  /**
   * Unregister the service worker
   * @returns {Promise<boolean>} True if unregistration was successful
   */
  async unregister() {
    if (this.registration) {
      const result = await this.registration.unregister();
      this.registration = null;
      this.registrationPromise = null;
      console.log('[NotificationService] SW unregistered');
      return result;
    }
    return false;
  }

  /**
   * Get the current registration status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isRegistered: !!this.registration,
      isRegistering: this.isRegistering,
      registration: this.registration
    };
  }
}

// Create singleton instance
export const notificationService = new BrowserNotificationService();
export default BrowserNotificationService;
