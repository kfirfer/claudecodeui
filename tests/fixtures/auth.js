/**
 * Authentication Fixtures and Utilities for Playwright Tests
 *
 * Provides robust login/registration handling that adapts to the app state:
 * - Detects whether login or account creation form is displayed
 * - Handles first-time account creation (with confirm password)
 * - Handles regular login for existing accounts
 * - Handles race conditions when multiple workers try to create accounts
 * - Uses Playwright best practices: auto-wait, role-based selectors, proper assertions
 */

import { test as base, expect } from '@playwright/test';

/**
 * Get test credentials from environment variables
 * @returns {{ username: string, password: string }}
 */
export function getTestCredentials() {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'TEST_USERNAME and TEST_PASSWORD environment variables are required. ' +
      'Set them in .env file or export them before running tests.'
    );
  }

  return { username, password };
}

/**
 * Authenticate the user - handles both login and account creation
 *
 * This function detects the current form state and performs the appropriate action:
 * - If already logged in: returns immediately
 * - If account creation form: creates account then verifies login
 * - If login form: performs login
 * - If error occurs during account creation: retries as login (another worker may have created the account)
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} options - Optional configuration
 * @param {number} options.timeout - Timeout for waiting operations (default: 30000)
 */
export async function authenticate(page, options = {}) {
  const { timeout = 30000 } = options;
  const { username, password } = getTestCredentials();

  // Wait for page to be ready
  await page.waitForLoadState('domcontentloaded');

  // Define locators for different UI states
  const newProjectButton = page.getByRole('button', { name: /new project/i }).first();
  const usernameInput = page.getByRole('textbox', { name: /username/i });
  const createAccountButton = page.getByRole('button', { name: /create account/i });
  const loginButton = page.getByRole('button', { name: /^(log ?in|sign ?in)$/i });
  const submitButton = page.locator('button[type="submit"]');
  const errorMessage = page.locator('text=/error|failed|invalid/i');

  // Wait for one of the possible states to appear
  const stateDetected = await Promise.race([
    newProjectButton.waitFor({ state: 'visible', timeout }).then(() => 'logged_in'),
    createAccountButton.waitFor({ state: 'visible', timeout }).then(() => 'create_account'),
    loginButton.waitFor({ state: 'visible', timeout }).then(() => 'login'),
    usernameInput.waitFor({ state: 'visible', timeout }).then(() => 'auth_form'),
  ]).catch(() => 'unknown');

  // Already logged in - nothing to do
  if (stateDetected === 'logged_in') {
    return;
  }

  // Fill username (common to both forms)
  await expect(usernameInput).toBeVisible({ timeout: 5000 });
  await usernameInput.fill(username);

  // Fill password using specific ID to avoid ambiguity with confirm password
  const passwordInput = page.locator('input#password');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  // Check if this is account creation form (has confirm password field)
  const confirmPasswordInput = page.locator('input#confirmPassword');
  const isAccountCreation = await confirmPasswordInput.isVisible().catch(() => false);

  if (isAccountCreation) {
    // Fill confirm password for account creation
    await confirmPasswordInput.fill(password);

    // Click create account button
    const createBtn = await createAccountButton.isVisible()
      ? createAccountButton
      : submitButton;
    await createBtn.click();

    // Check if successful or if error occurred (another worker may have created account)
    const result = await Promise.race([
      newProjectButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'success'),
      errorMessage.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'error'),
    ]).catch(() => 'timeout');

    if (result === 'error') {
      // Account creation failed (likely another worker created it) - reload and try login
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Wait for login form or logged-in state
      const postReloadState = await Promise.race([
        newProjectButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'logged_in'),
        usernameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'auth_form'),
      ]).catch(() => 'unknown');

      if (postReloadState === 'logged_in') {
        return;
      }

      // Try regular login
      await expect(usernameInput).toBeVisible({ timeout: 5000 });
      await usernameInput.fill(username);
      await passwordInput.fill(password);
      await submitButton.click();
    }
  } else {
    // Regular login - click submit/login button
    const loginBtn = await loginButton.isVisible().catch(() => false)
      ? loginButton
      : submitButton;
    await loginBtn.click();
  }

  // Wait for successful authentication - New Project button should appear
  await expect(newProjectButton).toBeVisible({ timeout });
}

/**
 * Extended Playwright test with authentication fixture
 *
 * Usage:
 *   import { test, expect } from './fixtures/auth.js';
 *
 *   test('my test', async ({ authenticatedPage }) => {
 *     // Page is already logged in
 *     await authenticatedPage.getByRole('button', { name: /settings/i }).click();
 *   });
 */
export const test = base.extend({
  /**
   * Provides a page that is already authenticated
   * Navigates to base URL and performs login/account creation as needed
   */
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/');
    await authenticate(page);
    await use(page);
  },
});

export { expect };

/**
 * Helper to check if credentials are available
 * Use this in test.skip() for tests requiring authentication
 * @returns {boolean}
 */
export function hasTestCredentials() {
  return !!(process.env.TEST_USERNAME && process.env.TEST_PASSWORD);
}
