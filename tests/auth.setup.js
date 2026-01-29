/**
 * Authentication Setup
 *
 * This setup file runs ONCE before all other tests to:
 * 1. Create the test account (if it doesn't exist)
 * 2. Login and save the authentication state
 *
 * Other tests then reuse this saved state, avoiding race conditions
 * and reducing redundant login operations.
 */

import { test as setup, expect } from '@playwright/test';
import { getTestCredentials } from './fixtures/auth.js';
import fs from 'fs';
import path from 'path';

const AUTH_FILE = './tests/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const { username, password } = getTestCredentials();

  // Ensure auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Define locators
  const newProjectButton = page.getByRole('button', { name: /new project/i }).first();
  const usernameInput = page.getByRole('textbox', { name: /username/i });
  const createAccountButton = page.getByRole('button', { name: /create account/i });
  const submitButton = page.locator('button[type="submit"]');
  const passwordInput = page.locator('input#password');
  const confirmPasswordInput = page.locator('input#confirmPassword');

  // Wait for either logged in state or auth form
  const initialState = await Promise.race([
    newProjectButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'logged_in'),
    usernameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'auth_form'),
  ]).catch(() => 'unknown');

  if (initialState === 'logged_in') {
    // Already logged in - save state and return
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Fill username
  await expect(usernameInput).toBeVisible({ timeout: 5000 });
  await usernameInput.fill(username);

  // Fill password
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  // Check if this is account creation form
  const isAccountCreation = await confirmPasswordInput.isVisible().catch(() => false);

  if (isAccountCreation) {
    // Fill confirm password
    await confirmPasswordInput.fill(password);

    // Click create account
    const createBtn = await createAccountButton.isVisible()
      ? createAccountButton
      : submitButton;
    await createBtn.click();
  } else {
    // Regular login
    await submitButton.click();
  }

  // Wait for successful authentication
  await expect(newProjectButton).toBeVisible({ timeout: 30000 });

  // Save authentication state
  await page.context().storageState({ path: AUTH_FILE });
});
