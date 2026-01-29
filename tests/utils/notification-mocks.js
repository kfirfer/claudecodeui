/**
 * Notification API Mocks for Playwright E2E Tests
 *
 * Provides utilities to mock the browser Notification API with different
 * permission states and track sent notifications.
 *
 * @module tests/utils/notification-mocks
 */

/**
 * Mocks the Notification API with specified permission
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @param {string} permission - Permission state ('granted' | 'denied' | 'default')
 * @returns {Promise<void>}
 */
export const mockNotificationAPI = (page, permission = 'granted') => {
  return page.addInitScript((perm) => {
    // Track notification history
    window.__notificationHistory = [];

    // Mock Notification class
    class MockNotification {
      constructor(title, options = {}) {
        this.title = title;
        this.body = options.body || '';
        this.icon = options.icon || '';
        this.tag = options.tag || '';
        this.silent = options.silent || false;
        this.onclick = null;

        // Record notification in history
        window.__notificationHistory.push({
          title,
          body: options.body,
          icon: options.icon,
          tag: options.tag,
          silent: options.silent,
          timestamp: Date.now()
        });
      }

      close() {
        // Mock close method
      }
    }

    // Set static permission property
    MockNotification.permission = perm;

    // Mock requestPermission method
    MockNotification.requestPermission = async () => {
      MockNotification.permission = 'granted';
      return 'granted';
    };

    // Replace global Notification
    window.Notification = MockNotification;
  }, permission);
};

/**
 * Mocks an unsupported browser (no Notification API)
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @returns {Promise<void>}
 */
export const mockUnsupportedBrowser = (page) => {
  return page.addInitScript(() => {
    delete window.Notification;
  });
};

/**
 * Gets the notification history from the page
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @returns {Promise<Array>} Array of sent notifications
 */
export const getNotificationHistory = async (page) => {
  return page.evaluate(() => window.__notificationHistory || []);
};

/**
 * Clears the notification history
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @returns {Promise<void>}
 */
export const clearNotificationHistory = async (page) => {
  return page.evaluate(() => {
    window.__notificationHistory = [];
  });
};

/**
 * Sets localStorage notification settings
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @param {Object} settings - Notification settings
 * @returns {Promise<void>}
 */
export const setNotificationSettings = async (page, settings) => {
  return page.evaluate((s) => {
    localStorage.setItem('notification-settings', JSON.stringify(s));
  }, settings);
};

/**
 * Gets localStorage notification settings
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @returns {Promise<Object>} Notification settings
 */
export const getNotificationSettings = async (page) => {
  return page.evaluate(() => {
    const stored = localStorage.getItem('notification-settings');
    return stored ? JSON.parse(stored) : null;
  });
};

export default {
  mockNotificationAPI,
  mockUnsupportedBrowser,
  getNotificationHistory,
  clearNotificationHistory,
  setNotificationSettings,
  getNotificationSettings
};
