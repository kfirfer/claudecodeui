import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { authenticate } from './fixtures/auth.js';

/**
 * E2E Test: Project Workflow Tests
 *
 * Tests project operations including:
 * - Project creation wizard visibility
 * - Project list display
 * - Settings accessibility
 * - Complete project lifecycle (create, rename, session, delete)
 */

// Test configuration
const TEST_TIMEOUT = 60000;

/**
 * Helper function to perform login and wait for app to be ready
 * Uses shared auth fixture for robust login/account creation handling
 * @param {import('@playwright/test').Page} page
 */
async function performLogin(page) {
  await authenticate(page);
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
 * Helper function to delete a project via the UI with error handling
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName
 */
async function deleteProjectViaUI(page, projectName) {
  // Find the project button in sidebar (the button contains the project name)
  const projectButton = page.locator(`button:has-text("${projectName}")`).first();
  const isProjectVisible = await projectButton.isVisible().catch(() => false);

  if (!isProjectVisible) {
    // Project doesn't exist in UI, nothing to delete
    return;
  }

  // Hover over the project button to reveal action buttons
  await projectButton.hover();

  // Find and click the delete button within this project's button element
  const deleteButton = projectButton.locator('[title*="Delete" i]').first();
  await expect(deleteButton).toBeVisible({ timeout: 5000 });
  await deleteButton.click();

  // Confirm deletion in the modal
  const confirmDeleteButton = page.getByRole('button', { name: /Delete/i }).last();
  await expect(confirmDeleteButton).toBeVisible({ timeout: 5000 });
  await confirmDeleteButton.click();

  // Wait for project to be removed from the list
  await expect(projectButton).not.toBeVisible({ timeout: 10000 });
}

test.describe('Project Operations - Individual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await performLogin(page);
  });

  test('should show project creation wizard when clicking New Project', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Click "New Project" button
    const newProjectButton = page.locator('button:has-text("New Project")').first();
    await expect(newProjectButton).toBeVisible();
    await newProjectButton.click();

    // Verify wizard modal appears with correct heading
    const wizardHeading = page.getByRole('heading', { name: 'Create New Project' });
    await expect(wizardHeading).toBeVisible();

    // Verify wizard has "Existing Workspace" option
    const existingWorkspaceText = page.getByText('Existing Workspace').first();
    await expect(existingWorkspaceText).toBeVisible();

    // Close the wizard using the X button
    const closeButton = page.locator('button:has(svg.lucide-x)').first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Verify wizard is closed
    await expect(wizardHeading).not.toBeVisible();
  });

  test('should display project list in sidebar', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Check that sidebar header is visible
    const sidebarHeader = page.getByRole('heading', { name: 'Claude Code UI' }).first();
    await expect(sidebarHeader).toBeVisible();

    // Check that New Project button is available
    const newProjectButton = page.locator('button:has-text("New Project")').first();
    await expect(newProjectButton).toBeVisible();
  });

  test('should have settings button accessible', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    // Settings button may be text button or icon button depending on viewport
    // Try desktop selector first (text button)
    const textSettingsButton = page.locator('button:has-text("Settings")').filter({ hasText: /^Settings$/i }).first();
    const iconSettingsButton = page.locator('button:has(svg.lucide-settings)').first();
    const roleSettingsButton = page.getByRole('button', { name: /settings/i }).first();

    // Check which button is visible
    const textButtonVisible = await textSettingsButton.isVisible().catch(() => false);
    const iconButtonVisible = await iconSettingsButton.isVisible().catch(() => false);
    const roleButtonVisible = await roleSettingsButton.isVisible().catch(() => false);

    // At least one settings button should exist in the DOM
    const anySettingsButton = textSettingsButton.or(iconSettingsButton).or(roleSettingsButton);
    await expect(anySettingsButton.first()).toBeAttached();

    // If any button is visible, click it and verify settings modal opens
    if (textButtonVisible || iconButtonVisible || roleButtonVisible) {
      const visibleButton = textButtonVisible
        ? textSettingsButton
        : iconButtonVisible
          ? iconSettingsButton
          : roleSettingsButton;

      await visibleButton.click();

      // Verify settings modal opens - look for Settings heading inside the modal
      // The modal doesn't use role="dialog", so we check for the Settings h2 heading
      const settingsHeading = page.getByRole('heading', { name: 'Settings', level: 2 });
      await expect(settingsHeading).toBeVisible();
    }
    // If no button visible (mobile/collapsed view), we've already verified it exists in DOM
  });
});

test.describe('Project Workflow - Complete Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await performLogin(page);
  });

  test('complete project lifecycle: create, rename, session, chat, delete', async ({ page }) => {
    test.setTimeout(120000); // Extended timeout for full lifecycle

    // Generate unique identifiers for THIS test run at execution time
    const testId = Date.now();
    const testProjectPath = path.join(os.homedir(), `e2e-test-project-${testId}`);
    const projectFolderName = `e2e-test-project-${testId}`;
    const renamedProjectName = `E2E-Test-Renamed-${testId}`;

    // Create the test directory before running the test
    await createTestDirectory(testProjectPath);

    try {
      // ==========================================
      // Step 1: Create a new project
      // ==========================================
      const createdProjectName = await createProject(page, testProjectPath);
      expect(createdProjectName).toBe(projectFolderName);

      // Verify project appears in sidebar - use the unique folder name for exact match
      // The button accessible name includes the path, so we use a regex that matches our unique ID
      const projectButton = page.locator(`button:has-text("${projectFolderName}")`).first();
      await expect(projectButton).toBeVisible();

      // ==========================================
      // Step 2: Rename the project
      // ==========================================
      // Find and hover over the project row to reveal action buttons
      await projectButton.hover();

      // Click the edit button within this project's button
      const editButton = projectButton.locator('[title*="Rename" i]').first();
      await expect(editButton).toBeVisible();
      await editButton.click();

      // Find and fill the rename input - it should appear within the project button area
      const renameInput = projectButton.locator('input[placeholder*="name" i]').first();
      await expect(renameInput).toBeVisible();
      await renameInput.fill(renamedProjectName);
      await renameInput.press('Enter');

      // Verify the project was renamed - search for button with our unique renamed name
      // Use a regex that matches our unique testId to ensure we find the right project
      const renamedProjectButton = page.locator(`button:has-text("${renamedProjectName}")`).first();
      await expect(renamedProjectButton).toBeVisible({ timeout: 10000 });

      // ==========================================
      // Step 3: Create a new session
      // ==========================================
      // Click on the project to expand it
      await renamedProjectButton.click();

      // Wait for project to expand and show "New Session" button
      // The New Session button appears inside the expanded project's session list
      const newSessionButton = page.locator('button:has-text("New Session")').first();
      // Use dispatchEvent to click the button even if it's in a scrollable/overflow area
      await newSessionButton.dispatchEvent('click');

      // Verify chat interface is visible (textarea for input)
      const chatTextarea = page.locator('textarea').first();
      await expect(chatTextarea).toBeVisible({ timeout: 15000 });

      // ==========================================
      // Step 4: Send a hello prompt to Claude
      // ==========================================
      const testMessage = 'Hello! This is a test message from the E2E test suite.';
      await chatTextarea.fill(testMessage);

      // Find and click the send button (try arrow-up icon first, then send icon)
      const sendButtonArrow = page.locator('button:has(svg.lucide-arrow-up)').first();
      const sendButtonSend = page.locator('button:has(svg.lucide-send)').first();

      const arrowVisible = await sendButtonArrow.isVisible().catch(() => false);
      const sendVisible = await sendButtonSend.isVisible().catch(() => false);

      if (arrowVisible) {
        await sendButtonArrow.click();
      } else if (sendVisible) {
        await sendButtonSend.click();
      } else {
        // Fallback to keyboard submission
        await chatTextarea.press('Control+Enter');
      }

      // Verify the user message appears in the chat
      const userMessage = page.getByText(testMessage).first();
      await expect(userMessage).toBeVisible();

      // ==========================================
      // Step 4.5: Wait for Claude to complete and validate token usage
      // ==========================================
      // Wait for the processing bar to disappear (contains "Processing..." text and Stop button)
      const processingBar = page.locator('button:has-text("Stop")').first();
      await expect(processingBar).toBeHidden({ timeout: 120000 });

      // Wait for token usage to show a non-zero value (real data from WebSocket)
      const tokenUsageIndicator = page.locator('span:has-text("%")').filter({ hasText: /^\d+\.\d+%$/ }).first();
      await expect(tokenUsageIndicator).toBeVisible({ timeout: 15000 });

      // Wait until we get a real percentage (not 0.0%)
      await expect(async () => {
        const text = await tokenUsageIndicator.textContent();
        const value = parseFloat(text.replace('%', ''));
        expect(value).toBeGreaterThan(0);
      }).toPass({ timeout: 30000 });

      const percentageText = await tokenUsageIndicator.textContent();
      const percentage = parseFloat(percentageText.replace('%', ''));

      console.log(`Token usage percentage (initial after response): ${percentage}%`);

      // Claude Code has a built-in system prompt (~33K tokens) that uses context.
      // For a simple "Hello" message with system prompt, expect 15-25% of 200K context.
      // This includes: system prompt (cached) + user message + assistant response tokens used as input.
      expect(percentage).toBeGreaterThan(10);
      expect(percentage).toBeLessThan(30);

      // ==========================================
      // Step 4.6: Refresh page and verify percentage stays consistent
      // ==========================================
      // Refresh the page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Re-authenticate if needed
      const loginForm = page.locator('input[type="password"]').first();
      const needsLogin = await loginForm.isVisible().catch(() => false);
      if (needsLogin) {
        await performLogin(page);
      }

      // Navigate back to the session
      const projectAfterRefresh = page.locator(`button:has-text("${renamedProjectName}")`).first();
      await expect(projectAfterRefresh).toBeVisible({ timeout: 15000 });
      await projectAfterRefresh.click();

      // Wait for sessions to load
      await page.waitForTimeout(3000);

      // Click on the session with our test message
      const sessionAfterRefresh = page.locator('button').filter({ hasText: /Hello.*test|test.*Hello/i }).first();
      const sessionVisible = await sessionAfterRefresh.isVisible().catch(() => false);
      if (sessionVisible) {
        await sessionAfterRefresh.click();
      }

      // Wait for the token percentage to be visible after refresh
      const tokenUsageAfterRefresh = page.locator('span:has-text("%")').filter({ hasText: /^\d+\.\d+%$/ }).first();
      await expect(tokenUsageAfterRefresh).toBeVisible({ timeout: 15000 });

      // Wait for the percentage to stabilize
      await page.waitForTimeout(2000);

      const percentageAfterRefresh = await tokenUsageAfterRefresh.textContent();
      const percentageValueAfterRefresh = parseFloat(percentageAfterRefresh.replace('%', ''));

      console.log(`Token usage percentage (after page refresh): ${percentageValueAfterRefresh}%`);

      // CRITICAL: The percentage after refresh should match the initial percentage
      // Both WebSocket (initial) and REST API (after refresh) should return consistent values
      // The percentage should be in the same range as initial (15-25%)
      expect(percentageValueAfterRefresh).toBeGreaterThan(10);
      expect(percentageValueAfterRefresh).toBeLessThan(30);

      // Verify WebSocket and REST API are consistent (within 5% tolerance)
      const difference = Math.abs(percentage - percentageValueAfterRefresh);
      console.log(`Token usage consistency check: initial=${percentage}%, after_refresh=${percentageValueAfterRefresh}%, diff=${difference.toFixed(1)}%`);
      expect(difference).toBeLessThan(5);

      // ==========================================
      // Step 5: Delete the session (optional - may not be visible)
      // ==========================================
      // Re-click the project to ensure it's expanded
      await renamedProjectButton.click();

      // Try to find and delete the session if visible
      const sessionDeleteButton = page.locator('[title*="Delete session" i], button:has(svg.lucide-trash-2)').first();
      const sessionDeleteVisible = await sessionDeleteButton.isVisible().catch(() => false);

      if (sessionDeleteVisible) {
        await sessionDeleteButton.click();

        // Confirm deletion if modal appears
        const confirmDeleteButton = page.getByRole('button', { name: /Delete/i }).last();
        const confirmVisible = await confirmDeleteButton.isVisible().catch(() => false);
        if (confirmVisible) {
          await confirmDeleteButton.click();
        }
      }

      // ==========================================
      // Step 6: Delete the project
      // ==========================================
      await deleteProjectViaUI(page, renamedProjectName);

      // Verify the project is no longer visible in the sidebar
      // Use the button locator to check for the project, not text which may appear elsewhere
      await expect(page.locator(`button:has-text("${renamedProjectName}")`).first()).not.toBeVisible();

    } finally {
      // Clean up the test directory regardless of test outcome
      await removeTestDirectory(testProjectPath);
    }
  });
});

test.describe('Session Visibility - Immediate Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await performLogin(page);
  });

  test('session should appear in sidebar immediately after sending first message', async ({ page }) => {
    test.setTimeout(120000);

    // Generate unique identifier for this test run
    const testId = Date.now();
    const testProjectPath = path.join(os.homedir(), `e2e-session-visibility-${testId}`);
    const projectFolderName = `e2e-session-visibility-${testId}`;

    // Create the test directory
    await createTestDirectory(testProjectPath);

    try {
      // Step 1: Create a new project
      const createdProjectName = await createProject(page, testProjectPath);
      expect(createdProjectName).toBe(projectFolderName);

      // Verify project appears in sidebar
      const projectButton = page.locator(`button:has-text("${projectFolderName}")`).first();
      await expect(projectButton).toBeVisible();

      // Step 2: Click on the project to expand it
      await projectButton.click();

      // Step 3: Click New Session button
      const newSessionButton = page.locator('button:has-text("New Session")').first();
      await newSessionButton.dispatchEvent('click');

      // Verify chat interface is visible
      const chatTextarea = page.locator('textarea').first();
      await expect(chatTextarea).toBeVisible({ timeout: 15000 });

      // Step 4: Type a unique test message (but don't send yet)
      const uniqueMessage = `Test session visibility ${testId}`;
      await chatTextarea.fill(uniqueMessage);

      // Step 5: Find the send button
      const sendButtonArrow = page.locator('button:has(svg.lucide-arrow-up)').first();
      const sendButtonSend = page.locator('button:has(svg.lucide-send)').first();

      const arrowVisible = await sendButtonArrow.isVisible().catch(() => false);

      // Step 6: Send the message
      if (arrowVisible) {
        await sendButtonArrow.click();
      } else {
        await sendButtonSend.click();
      }

      // Step 7: CRITICAL - Check that the session appears in the sidebar IMMEDIATELY
      // This should happen before the AI responds (within 2 seconds)
      // The pending session should show either the message preview or a loading indicator

      // Look for any session item in the sidebar that either:
      // 1. Has our message text
      // 2. Has "New conversation" text (pending session placeholder)
      // 3. Has a spinning indicator (pending session loading)

      // First, verify the user message appears in chat (message was sent)
      const userMessage = page.getByText(uniqueMessage).first();
      await expect(userMessage).toBeVisible({ timeout: 5000 });

      // Now check the sidebar for the session - it should appear within 3 seconds
      // The session might show as "New conversation..." or with the first part of the message
      const sessionInSidebar = page.locator('[class*="sidebar"], [data-testid="sidebar"]')
        .locator('button, div[role="button"]')
        .filter({
          has: page.locator('text=/Test session|New conversation|New Session/i')
        })
        .first();

      // Alternative: Look for any session with a loading spinner (pending session indicator)
      const pendingSessionSpinner = page.locator('.animate-spin').first();

      // Wait for either the session text or the spinner to appear (within 3 seconds)
      // This is the key assertion - session must be visible BEFORE AI finishes responding
      await expect(async () => {
        const sessionVisible = await sessionInSidebar.isVisible().catch(() => false);
        const spinnerVisible = await pendingSessionSpinner.isVisible().catch(() => false);
        expect(sessionVisible || spinnerVisible).toBe(true);
      }).toPass({ timeout: 3000 });

      // Step 8: Now wait for AI to respond and verify session is still visible
      // Wait for the processing bar to disappear
      const processingBar = page.locator('button:has-text("Stop")').first();
      await expect(processingBar).toBeHidden({ timeout: 120000 });

      // After AI responds, verify the session is still in the sidebar
      // At this point it should show the actual session with a summary
      const finalSessionInSidebar = page.locator(`button:has-text("Test session")`).first().or(
        page.locator('button').filter({ hasText: /Test session visibility/i }).first()
      );

      // Session should be visible in sidebar after AI response completes
      await expect(async () => {
        const sessionFound = await finalSessionInSidebar.isVisible().catch(() => false);
        // If not found by message, check for any session in the expanded project
        if (!sessionFound) {
          // Look for session indicator - there should be at least one session item
          const anySessionItem = await page.locator('button').filter({
            has: page.locator('svg.lucide-message-square, svg.lucide-clock, [class*="ClaudeLogo"]')
          }).first().isVisible().catch(() => false);
          expect(anySessionItem).toBe(true);
        }
      }).toPass({ timeout: 15000 });

      // Step 9: Clean up - delete the project
      await deleteProjectViaUI(page, projectFolderName);

    } finally {
      // Clean up the test directory
      await removeTestDirectory(testProjectPath);
    }
  });
});
