import { test, expect } from '@playwright/test';
import {
  mockNotificationAPI,
  mockUnsupportedBrowser,
  setNotificationSettings,
  getNotificationSettings
} from './utils/notification-mocks.js';

/**
 * E2E Test: Notification Settings Tests
 *
 * Tests notification settings panel including:
 * - Toggle visibility and functionality
 * - Permission status display
 * - Settings persistence in localStorage
 * - Unsupported browser handling
 */

// Test configuration
const TEST_TIMEOUT = 60000;

/**
 * Helper function to perform login and wait for app to be ready
 * @param {import('@playwright/test').Page} page
 */
async function performLogin(page) {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;

  // Wait for login form to be ready
  const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
  await expect(usernameInput).toBeVisible();
  await usernameInput.fill(username);

  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  const submitButton = page.locator('button[type="submit"]');
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  // Wait for successful login by checking for New Project button
  const newProjectButton = page.locator('button:has-text("New Project")').first();
  await expect(newProjectButton).toBeVisible({ timeout: 30000 });
}

/**
 * Helper function to open settings and navigate to notifications tab
 * @param {import('@playwright/test').Page} page
 */
async function openNotificationSettings(page) {
  // Click settings button
  const settingsButton = page.locator('button').filter({ has: page.locator('svg.lucide-settings') }).first();
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();

  // Wait for settings modal to appear
  const settingsHeading = page.getByRole('heading', { name: 'Settings' });
  await expect(settingsHeading).toBeVisible();

  // Click on Notifications tab
  const notificationsTab = page.getByRole('button', { name: /Notifications/i });
  await expect(notificationsTab).toBeVisible();
  await notificationsTab.click();
}

test.describe('Notification Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Apply notification API mock before navigating
    await mockNotificationAPI(page, 'granted');
  });

  test('should display notification toggle in settings', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify notification toggle is visible
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await expect(notificationToggle).toBeVisible();

    // Verify section title
    const sectionTitle = page.getByText('Desktop Notifications');
    await expect(sectionTitle).toBeVisible();
  });

  test('should persist toggle state in localStorage', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Enable notifications
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await notificationToggle.click();

    // Verify localStorage was updated
    const settings = await getNotificationSettings(page);
    expect(settings.enabled).toBe(true);

    // Reload and verify persistence
    await page.reload();
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify toggle is still enabled
    const toggleAfterReload = page.locator('[data-testid="notification-toggle"]');
    await expect(toggleAfterReload).toHaveAttribute('aria-checked', 'true');
  });

  test('should show permission request button when permission is default', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Mock with default permission
    await mockNotificationAPI(page, 'default');

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify request permission button is visible
    const requestPermissionBtn = page.locator('[data-testid="request-permission-btn"]');
    await expect(requestPermissionBtn).toBeVisible();
    await expect(requestPermissionBtn).toContainText('Enable Notifications');
  });

  test('should display correct permission status badge for granted permission', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockNotificationAPI(page, 'granted');

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify permission badge shows "Granted"
    const permissionBadge = page.locator('[data-testid="permission-badge"]');
    await expect(permissionBadge).toBeVisible();
    await expect(permissionBadge).toContainText('Granted');
  });

  test('should disable toggles when permission is denied', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockNotificationAPI(page, 'denied');

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify notification toggle is disabled
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await expect(notificationToggle).toBeDisabled();

    // Verify warning message is shown
    const warningMessage = page.getByText(/Notifications are blocked/i);
    await expect(warningMessage).toBeVisible();
  });

  test('should show unsupported message when Notification API unavailable', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockUnsupportedBrowser(page);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify unsupported message is shown
    const unsupportedMessage = page.getByText(/does not support desktop notifications/i);
    await expect(unsupportedMessage).toBeVisible();
  });

  test('should request permission when clicking enable button', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockNotificationAPI(page, 'default');

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Click request permission button
    const requestPermissionBtn = page.locator('[data-testid="request-permission-btn"]');
    await requestPermissionBtn.click();

    // Wait for permission to be granted (mocked)
    // The permission badge should now show "Granted"
    const permissionBadge = page.locator('[data-testid="permission-badge"]');
    await expect(permissionBadge).toContainText('Granted');
  });

  test('should show test notification button when enabled', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockNotificationAPI(page, 'granted');

    // Set notifications as enabled
    await page.goto('/');
    await setNotificationSettings(page, {
      enabled: true,
      soundEnabled: false,
      onlyWhenUnfocused: true,
      permissionRequested: true,
      lastUpdated: new Date().toISOString()
    });
    await page.reload();

    await performLogin(page);
    await openNotificationSettings(page);

    // Verify test notification button is visible
    const testButton = page.locator('[data-testid="test-notification-btn"]');
    await expect(testButton).toBeVisible();
    await expect(testButton).toContainText('Send Test Notification');
  });

  test('should toggle only-when-unfocused setting', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockNotificationAPI(page, 'granted');

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Enable notifications first
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await notificationToggle.click();

    // Toggle only-when-unfocused setting
    const unfocusedToggle = page.locator('[data-testid="only-unfocused-toggle"]');
    await expect(unfocusedToggle).toBeEnabled();

    // Toggle off (it should be on by default)
    await unfocusedToggle.click();

    // Verify setting was updated
    const settings = await getNotificationSettings(page);
    expect(settings.onlyWhenUnfocused).toBe(false);
  });

  test('should toggle sound setting', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await mockNotificationAPI(page, 'granted');

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Enable notifications first
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await notificationToggle.click();

    // Toggle sound setting
    const soundToggle = page.locator('[data-testid="sound-toggle"]');
    await expect(soundToggle).toBeEnabled();

    // Toggle on
    await soundToggle.click();

    // Verify setting was updated
    const settings = await getNotificationSettings(page);
    expect(settings.soundEnabled).toBe(true);
  });
});
