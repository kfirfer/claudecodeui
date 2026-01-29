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
      // Step 4.5: Validate token usage percentage
      // ==========================================
      // Wait for Claude's response (look for Claude message indicator)
      const claudeResponse = page.locator('[class*="Claude"], [data-role="assistant"]').first();
      await expect(claudeResponse).toBeVisible({ timeout: 60000 });

      // Wait for token usage to be updated (the percentage indicator)
      // The token usage is displayed as "X.X%" near the bottom of the chat
      const tokenUsageIndicator = page.locator('text=/\\d+\\.\\d+%/').first();
      await expect(tokenUsageIndicator).toBeVisible({ timeout: 10000 });

      // Get the percentage value and validate it's reasonable
      const percentageText = await tokenUsageIndicator.textContent();
      const percentage = parseFloat(percentageText.replace('%', ''));

      // For a simple "Hello" message in a clean project (no CLAUDE.md):
      // - System prompt + tools: unavoidable baseline
      // - User message + response: minimal tokens
      // The percentage should be LOW (under 5%) for just conversation tokens
      // If it's high (>15%), something is wrong with the calculation
      console.log(`Token usage percentage: ${percentage}%`);
      expect(percentage).toBeGreaterThan(0); // Should have some usage
      expect(percentage).toBeLessThan(5); // Should be very low for a simple message

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
