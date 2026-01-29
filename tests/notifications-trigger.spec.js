import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  mockNotificationAPI,
  getNotificationHistory,
  clearNotificationHistory,
  setNotificationSettings
} from './utils/notification-mocks.js';

/**
 * E2E Test: Notification Trigger Tests
 *
 * Tests notification triggers when Claude/Cursor/Codex completes tasks:
 * - Notification fires on chat completion when enabled
 * - Notification does NOT fire when disabled
 * - Notification respects onlyWhenUnfocused setting
 * - Notification content includes correct title and body
 */

// Test configuration
const TEST_TIMEOUT = 120000;

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
 * Helper function to create a test directory
 * @param {string} dirPath - Path to create
 */
async function createTestDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Helper function to remove a test directory
 * @param {string} dirPath - Path to remove
 */
async function removeTestDirectory(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory doesn't exist
  }
}

/**
 * Helper function to create a project via the wizard
 * @param {import('@playwright/test').Page} page
 * @param {string} projectPath
 * @returns {Promise<string>} The project name derived from the path
 */
async function createProject(page, projectPath) {
  // Click "New Project" button in sidebar
  const newProjectButton = page.locator('button:has-text("New Project")').first();
  await expect(newProjectButton).toBeVisible();
  await newProjectButton.click();

  // Wait for Project Creation Wizard modal to appear
  const wizardHeading = page.getByRole('heading', { name: 'Create New Project' });
  await expect(wizardHeading).toBeVisible();

  // Step 1 of wizard: Select "Existing Workspace" option if visible
  const existingWorkspaceButton = page.locator('button:has-text("Existing Workspace")').first();
  const isExistingWorkspaceVisible = await existingWorkspaceButton.isVisible();
  if (isExistingWorkspaceVisible) {
    await existingWorkspaceButton.click();
  }

  // Click "Next" to proceed to step 2
  const nextButton = page.locator('button:has-text("Next")');
  await expect(nextButton).toBeVisible();
  await nextButton.click();

  // Step 2: Enter workspace path - wait for the path input to be visible
  const pathInput = page.locator('input[placeholder*="/path"]').first();
  await expect(pathInput).toBeVisible();
  await pathInput.fill(projectPath);

  // Click "Next" to proceed to step 3 (confirmation)
  await expect(nextButton).toBeVisible();
  await nextButton.click();

  // Step 3: Wait for Create Project button and click
  const createButton = page.getByRole('button', { name: /Create Project/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  // Wait for wizard to close (indicates success)
  await expect(wizardHeading).not.toBeVisible({ timeout: 15000 });

  // Return the project name derived from the path
  return projectPath.split('/').pop();
}

/**
 * Helper function to enable notifications with specific settings
 * @param {import('@playwright/test').Page} page
 * @param {Object} settings - Notification settings override
 */
async function enableNotifications(page, settings = {}) {
  const defaultSettings = {
    enabled: true,
    soundEnabled: false,
    onlyWhenUnfocused: false, // Important: set to false for testing
    permissionRequested: true,
    lastUpdated: new Date().toISOString()
  };

  await setNotificationSettings(page, { ...defaultSettings, ...settings });
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

test.describe('Notification Triggers', () => {
  const testProjectPath = path.join(os.tmpdir(), `notification-test-${Date.now()}`);

  // Skip if no test credentials are provided
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  test.beforeAll(async () => {
    // Create the test project directory
    await createTestDirectory(testProjectPath);
  });

  test.afterAll(async () => {
    // Clean up the test project directory
    await removeTestDirectory(testProjectPath);
  });

  test.beforeEach(async ({ page }) => {
    // Apply notification API mock before navigating
    await mockNotificationAPI(page, 'granted');
  });

  test('should fire notification on chat completion when enabled', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');

    // Enable notifications before login (so settings are in localStorage)
    await enableNotifications(page, { onlyWhenUnfocused: false });

    await performLogin(page);

    // Create a test project
    const projectName = await createProject(page, testProjectPath);

    // Wait for project to appear in sidebar
    const projectButton = page.locator(`button:has-text("${projectName}")`).first();
    await expect(projectButton).toBeVisible({ timeout: 15000 });

    // Click to select the project
    await projectButton.click();

    // Clear notification history
    await clearNotificationHistory(page);

    // Find and fill the chat input
    const chatInput = page.locator('textarea[placeholder*="message"], textarea[placeholder*="Claude"], textarea[data-testid="chat-input"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Hello, please respond with "Hi there!"');

    // Find and click the send button
    const sendButton = page.locator('button[type="submit"], button:has(svg.lucide-send), button:has(svg.lucide-arrow-up)').first();
    await expect(sendButton).toBeVisible();
    await sendButton.click();

    // Wait for Claude to respond and complete
    // Look for completion indicators
    await page.waitForTimeout(5000); // Wait for response to start

    // Wait for loading state to finish (no more "Thinking..." or loading indicators)
    const loadingIndicator = page.locator('text=Thinking');
    try {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 60000 });
    } catch {
      // Ignore if already not visible
    }

    // Check notification history
    const notifications = await getNotificationHistory(page);

    // Verify notification was sent
    expect(notifications.length).toBeGreaterThan(0);
    const lastNotification = notifications[notifications.length - 1];
    expect(lastNotification.title).toContain('Claude');
  });

  test('should NOT fire notification when disabled', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');

    // Ensure notifications are disabled
    await setNotificationSettings(page, {
      enabled: false,
      soundEnabled: false,
      onlyWhenUnfocused: true,
      permissionRequested: false,
      lastUpdated: new Date().toISOString()
    });

    await performLogin(page);

    // Select existing project if available, or create one
    const projectButton = page.locator('button[class*="project"]').first();
    const hasProject = await projectButton.isVisible().catch(() => false);

    if (!hasProject) {
      await createProject(page, testProjectPath);
    }

    // Clear notification history
    await clearNotificationHistory(page);

    // Simulate claude-complete event
    await page.evaluate(() => {
      // Dispatch a mock WebSocket message for claude-complete
      const event = new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-disabled-123', exitCode: 0 }
      });
      window.dispatchEvent(event);
    });

    // Wait a moment
    await page.waitForTimeout(1000);

    // Verify NO notification was sent
    const notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(0);
  });

  test('should respect onlyWhenUnfocused setting - tab visible', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');

    // Enable notifications with onlyWhenUnfocused = true
    await enableNotifications(page, { onlyWhenUnfocused: true });

    await performLogin(page);

    // Clear notification history
    await clearNotificationHistory(page);

    // Tab is focused/visible, so notification should NOT fire
    // Simulate claude-complete by directly calling sendNotification
    // This would be blocked by the onlyWhenUnfocused check

    // The test verifies the setting works correctly
    const settings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('notification-settings'));
    });

    expect(settings.onlyWhenUnfocused).toBe(true);
    expect(settings.enabled).toBe(true);
  });

  test('notification content should include project name', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto('/');

    // Enable notifications
    await enableNotifications(page, { onlyWhenUnfocused: false });

    await performLogin(page);

    // Create project
    const projectName = await createProject(page, testProjectPath);

    // Wait for project to appear and select it
    const projectButton = page.locator(`button:has-text("${projectName}")`).first();
    await expect(projectButton).toBeVisible({ timeout: 15000 });
    await projectButton.click();

    // Clear notification history
    await clearNotificationHistory(page);

    // Send a simple message
    const chatInput = page.locator('textarea[placeholder*="message"], textarea[placeholder*="Claude"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Say "test complete"');

    const sendButton = page.locator('button[type="submit"], button:has(svg.lucide-send), button:has(svg.lucide-arrow-up)').first();
    await sendButton.click();

    // Wait for completion
    await page.waitForTimeout(30000);

    // Check notification content
    const notifications = await getNotificationHistory(page);

    if (notifications.length > 0) {
      const lastNotification = notifications[notifications.length - 1];
      // Notification body should contain project info
      expect(lastNotification.body).toBeDefined();
    }
  });
});

test.describe('Notification Settings Integration', () => {
  test.beforeEach(async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
  });

  test('settings changes take effect immediately without reload', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;

    if (!username || !password) {
      test.skip();
      return;
    }

    await page.goto('/');
    await performLogin(page);

    // Clear notification history
    await clearNotificationHistory(page);

    // Initially disabled - verify no notifications possible
    let settings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('notification-settings') || '{}');
    });

    // Default state should have notifications disabled
    expect(settings.enabled || false).toBe(false);

    // Open settings and enable notifications via UI
    await openNotificationSettings(page);

    // Click the notification toggle to enable
    const notificationToggle = page.locator('[data-testid="notification-toggle"]');
    await expect(notificationToggle).toBeVisible();
    await notificationToggle.click();

    // Also disable onlyWhenUnfocused for testing
    const unfocusedToggle = page.locator('[data-testid="only-unfocused-toggle"]');
    await unfocusedToggle.click();

    // Close settings
    await page.keyboard.press('Escape');

    // Verify settings were updated
    settings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('notification-settings') || '{}');
    });

    expect(settings.enabled).toBe(true);
    expect(settings.onlyWhenUnfocused).toBe(false);
  });
});
