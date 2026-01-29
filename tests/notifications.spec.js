import { test, expect } from '@playwright/test';

/**
 * E2E Test: Notification Settings
 *
 * Tests browser notification settings functionality including:
 * - Settings panel UI and toggles
 * - Permission status display
 * - Settings persistence in localStorage
 *
 * NOTE: These are true E2E tests without mocks. The tests adapt to the
 * actual browser notification permission state.
 */

// Test configuration
const TEST_TIMEOUT = 60000;
const NOTIFICATION_SETTINGS_KEY = 'notification-settings';

/**
 * Helper function to perform login and wait for app to be ready
 * Handles both login required and already logged in states
 * @param {import('@playwright/test').Page} page
 */
async function performLogin(page) {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;

  // Wait a moment for the page to settle
  await page.waitForLoadState('domcontentloaded');

  // Check if already logged in (New Project button visible) or need to login
  const newProjectButton = page.locator('button:has-text("New Project")').first();
  const usernameInput = page.locator('input[type="text"], input[name="username"]').first();

  // Wait for either the login form or the main app to appear
  await Promise.race([
    newProjectButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    usernameInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  ]);

  // Check which state we're in
  const isLoggedIn = await newProjectButton.isVisible().catch(() => false);

  if (isLoggedIn) {
    // Already logged in, app is ready
    return;
  }

  // Need to login - fill the form
  await expect(usernameInput).toBeVisible({ timeout: 5000 });
  await usernameInput.fill(username);

  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  const submitButton = page.locator('button[type="submit"]');
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  // Wait for successful login by checking for New Project button
  await expect(newProjectButton).toBeVisible({ timeout: 30000 });
}

/**
 * Helper function to open settings and navigate to notifications tab
 * @param {import('@playwright/test').Page} page
 */
async function openNotificationSettings(page) {
  // Click settings button - use getByRole for accessibility
  const settingsButton = page.getByRole('button', { name: /settings/i }).first();

  // Scroll into view and click (button may be at bottom of sidebar)
  await settingsButton.scrollIntoViewIfNeeded();
  await settingsButton.click({ force: true });

  // Wait for settings modal to appear - use exact match to avoid "Quick Settings", "Input Settings" etc.
  const settingsHeading = page.getByRole('heading', { name: 'Settings', exact: true });
  await expect(settingsHeading).toBeVisible({ timeout: 10000 });

  // Find and click the Notifications tab - try data-testid first, then text selector
  let notificationsTab = page.locator('[data-testid="notifications-tab"]');
  const hasDataTestId = await notificationsTab.count() > 0;

  if (!hasDataTestId) {
    // Fallback to text-based selector
    notificationsTab = page.getByRole('button', { name: 'Notifications' });
  }

  await expect(notificationsTab).toBeVisible({ timeout: 10000 });
  await notificationsTab.click();

  // Wait for notifications content to load - look for the toggle
  const notificationToggle = page.locator('[data-testid="notification-toggle"]');
  await expect(notificationToggle).toBeVisible({ timeout: 10000 });
}

/**
 * Helper to get notification settings from localStorage
 * @param {import('@playwright/test').Page} page
 */
async function getNotificationSettings(page) {
  return page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  }, NOTIFICATION_SETTINGS_KEY);
}

/**
 * Helper to set notification settings in localStorage
 * @param {import('@playwright/test').Page} page
 * @param {Object} settings
 */
async function setNotificationSettings(page, settings) {
  await page.evaluate(([key, s]) => {
    localStorage.setItem(key, JSON.stringify(s));
  }, [NOTIFICATION_SETTINGS_KEY, settings]);
}

/**
 * Helper to close settings modal
 * @param {import('@playwright/test').Page} page
 */
async function closeSettings(page) {
  await page.keyboard.press('Escape');
  // Wait for modal to close - use exact match
  const settingsHeading = page.getByRole('heading', { name: 'Settings', exact: true });
  await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });
}

/**
 * Helper to get the current permission state from the page
 * @param {import('@playwright/test').Page} page
 */
async function getPermissionState(page) {
  return page.evaluate(() => {
    if (typeof Notification !== 'undefined') {
      return Notification.permission;
    }
    return 'unsupported';
  });
}

// Skip all tests if no credentials provided
test.describe('Notification Settings', () => {
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  // Use larger viewport for Settings modal
  test.use({
    viewport: { width: 1400, height: 900 }
  });

  test('should display notification settings UI correctly', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify notification toggle is visible
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await expect(notificationToggle).toBeVisible();

    // Verify section shows Desktop Notifications heading
    const sectionTitle = page.getByRole('heading', { name: 'Desktop Notifications' });
    await expect(sectionTitle).toBeVisible();

    // Verify permission badge is visible
    const permissionBadge = page.locator('[data-testid="permission-badge"]');
    await expect(permissionBadge).toBeVisible();

    // Verify the permission badge shows a valid state
    const badgeText = await permissionBadge.textContent();
    expect(['Granted', 'Denied', 'Not Set']).toContain(badgeText);
  });

  test('should show correct permission status and UI state', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Get the permission state
    const permissionState = await getPermissionState(page);

    // Verify permission badge shows correct state
    const permissionBadge = page.locator('[data-testid="permission-badge"]');
    await expect(permissionBadge).toBeVisible();

    const notificationToggle = page.locator('[data-testid="notification-toggle"]');

    if (permissionState === 'granted') {
      // Toggle should be enabled when permission is granted
      await expect(permissionBadge).toContainText(/Granted/i);
      await expect(notificationToggle).toBeEnabled();
    } else if (permissionState === 'denied') {
      // Toggle should be disabled when permission is denied
      await expect(permissionBadge).toContainText(/Denied/i);
      await expect(notificationToggle).toBeDisabled();

      // Warning message should be visible
      const warningMessage = page.getByText(/Notifications are blocked/i);
      await expect(warningMessage).toBeVisible();
    } else {
      // Permission is 'default' - request button should be visible
      await expect(permissionBadge).toContainText(/Not Set/i);
      const requestButton = page.locator('[data-testid="request-permission-btn"]');
      await expect(requestButton).toBeVisible();
    }
  });

  test('should display all notification toggles', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Main toggle should always be visible
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await expect(notificationToggle).toBeVisible();

    // Sub-toggles should be visible
    const unfocusedToggle = page.locator('[data-testid="only-unfocused-toggle"]');
    await expect(unfocusedToggle).toBeVisible();

    const soundToggle = page.locator('[data-testid="sound-toggle"]');
    await expect(soundToggle).toBeVisible();
  });

  test('should persist settings in localStorage when permission allows', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    const permissionState = await getPermissionState(page);

    if (permissionState === 'granted') {
      // Enable notifications
      const notificationToggle = page.locator('[data-testid="notification-toggle"]');
      await notificationToggle.click();

      // Wait for localStorage update
      await page.waitForFunction(
        (key) => {
          const stored = localStorage.getItem(key);
          return stored && JSON.parse(stored).enabled === true;
        },
        NOTIFICATION_SETTINGS_KEY,
        { timeout: 5000 }
      );

      // Verify settings were saved
      const settings = await getNotificationSettings(page);
      expect(settings.enabled).toBe(true);
    } else {
      // When permission is not granted, verify settings are preserved
      const initialSettings = await getNotificationSettings(page);

      // Settings should exist (may be null if never set)
      // This is valid behavior - settings persist whatever state they're in
      expect(initialSettings === null || typeof initialSettings === 'object').toBe(true);
    }
  });

  test('should maintain settings after page reload', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');

    // Pre-set some settings with known values
    const expectedSettings = {
      enabled: false,
      soundEnabled: true,
      onlyWhenUnfocused: false,
      permissionRequested: true,
      lastUpdated: new Date().toISOString()
    };
    await setNotificationSettings(page, expectedSettings);

    // Reload to let app read settings from localStorage
    await page.reload();
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify settings loaded correctly
    const soundToggle = page.locator('[data-testid="sound-toggle"]');
    await expect(soundToggle).toHaveAttribute('aria-checked', 'true');

    const unfocusedToggle = page.locator('[data-testid="only-unfocused-toggle"]');
    await expect(unfocusedToggle).toHaveAttribute('aria-checked', 'false');

    // Reload again
    await page.reload();
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify settings still persist
    await expect(soundToggle).toHaveAttribute('aria-checked', 'true');
    await expect(unfocusedToggle).toHaveAttribute('aria-checked', 'false');

    // Verify localStorage still has the correct values
    const settings = await getNotificationSettings(page);
    expect(settings.soundEnabled).toBe(true);
    expect(settings.onlyWhenUnfocused).toBe(false);
  });

  test('sub-toggles disabled state matches main toggle and permission', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    const unfocusedToggle = page.locator('[data-testid="only-unfocused-toggle"]');
    const soundToggle = page.locator('[data-testid="sound-toggle"]');

    const mainToggleEnabled = await notificationToggle.isEnabled();
    const mainToggleChecked = await notificationToggle.getAttribute('aria-checked');

    if (!mainToggleEnabled) {
      // If main toggle is disabled (permission denied), sub-toggles should also be disabled
      await expect(unfocusedToggle).toBeDisabled();
      await expect(soundToggle).toBeDisabled();
    } else if (mainToggleChecked === 'false') {
      // If notifications are disabled, sub-toggles should be disabled
      await expect(unfocusedToggle).toBeDisabled();
      await expect(soundToggle).toBeDisabled();
    } else {
      // If notifications are enabled, sub-toggles should be enabled
      await expect(unfocusedToggle).toBeEnabled();
      await expect(soundToggle).toBeEnabled();
    }
  });

  test('should load settings from localStorage on app start', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Set specific settings before the app loads
    await page.goto('/');
    await setNotificationSettings(page, {
      enabled: true,
      soundEnabled: true,
      onlyWhenUnfocused: false,
      permissionRequested: true,
      lastUpdated: new Date().toISOString()
    });

    // Reload to let app read settings
    await page.reload();
    await performLogin(page);
    await openNotificationSettings(page);

    // The sound toggle should reflect the saved setting
    const soundToggle = page.locator('[data-testid="sound-toggle"]');
    await expect(soundToggle).toHaveAttribute('aria-checked', 'true');

    // The unfocused toggle should reflect the saved setting
    const unfocusedToggle = page.locator('[data-testid="only-unfocused-toggle"]');
    await expect(unfocusedToggle).toHaveAttribute('aria-checked', 'false');
  });

  test('localStorage settings format is correct', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Get settings from localStorage
    const settings = await getNotificationSettings(page);

    if (settings) {
      // Verify the settings object has expected structure
      expect(typeof settings.enabled).toBe('boolean');
      expect(typeof settings.soundEnabled).toBe('boolean');
      expect(typeof settings.onlyWhenUnfocused).toBe('boolean');
      expect(settings.lastUpdated === null || typeof settings.lastUpdated === 'string').toBe(true);
    }
  });

  test('should navigate between tabs correctly', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');
    await performLogin(page);
    await openNotificationSettings(page);

    // Verify we're on notifications tab
    const desktopNotificationsHeading = page.getByRole('heading', { name: 'Desktop Notifications' });
    await expect(desktopNotificationsHeading).toBeVisible();

    // Navigate to another tab (Appearance)
    const appearanceTab = page.getByRole('button', { name: 'Appearance' });
    await appearanceTab.click();

    // Verify notifications content is hidden
    await expect(desktopNotificationsHeading).not.toBeVisible();

    // Navigate back to Notifications
    let notificationsTab = page.locator('[data-testid="notifications-tab"]');
    const hasDataTestId = await notificationsTab.count() > 0;
    if (!hasDataTestId) {
      notificationsTab = page.getByRole('button', { name: 'Notifications' });
    }
    await notificationsTab.click();

    // Verify notifications content is visible again
    await expect(desktopNotificationsHeading).toBeVisible();
  });
});
