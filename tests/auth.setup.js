/**
 * Authentication Setup
 *
 * This setup file runs ONCE before all other tests to:
 * 1. Create the test account (if it doesn't exist)
 * 2. Login and complete any onboarding wizards
 * 3. Save the authentication state
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
  const nextButton = page.getByRole('button', { name: /next/i });
  const finishButton = page.getByRole('button', { name: /finish|complete setup|complete|done|get started/i });

  // Wait for either logged in state, onboarding wizard, or auth form
  const initialState = await Promise.race([
    newProjectButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'logged_in'),
    nextButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'onboarding'),
    usernameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'auth_form'),
  ]).catch(() => 'unknown');

  if (initialState === 'logged_in') {
    // Already logged in and onboarding complete - save state and return
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  if (initialState === 'onboarding') {
    // Already logged in but need to complete onboarding wizard
    await completeOnboarding(page, nextButton, finishButton, newProjectButton);
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Need to login - fill the form
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

  // After login, check for onboarding wizard or main app
  const postLoginState = await Promise.race([
    newProjectButton.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'logged_in'),
    nextButton.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'onboarding'),
  ]).catch(() => 'unknown');

  if (postLoginState === 'onboarding') {
    await completeOnboarding(page, nextButton, finishButton, newProjectButton);
  } else {
    await expect(newProjectButton).toBeVisible({ timeout: 30000 });
  }

  // Save authentication state
  await page.context().storageState({ path: AUTH_FILE });
});

/**
 * Complete the onboarding wizard by clicking through all steps
 */
async function completeOnboarding(page, nextButton, finishButton, newProjectButton) {
  // Click through onboarding steps (max 10 steps to prevent infinite loop)
  for (let i = 0; i < 10; i++) {
    // Check if we've reached the main app
    const isMainApp = await newProjectButton.isVisible().catch(() => false);
    if (isMainApp) {
      return;
    }

    // Check for finish/complete button
    const hasFinish = await finishButton.isVisible().catch(() => false);
    if (hasFinish) {
      await finishButton.click();
      await expect(newProjectButton).toBeVisible({ timeout: 30000 });
      return;
    }

    // Check for next button
    const hasNext = await nextButton.isVisible().catch(() => false);
    if (hasNext) {
      await nextButton.click();
      // Wait a moment for transition
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    // No buttons found, wait and check again
    await page.waitForLoadState('domcontentloaded');
  }

  // Final check for main app
  await expect(newProjectButton).toBeVisible({ timeout: 30000 });
}
