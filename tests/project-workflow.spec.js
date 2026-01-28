import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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
 * Helper function to delete a project via the UI with error handling
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName
 */
async function deleteProjectViaUI(page, projectName) {
  // Find the project in sidebar - wait for it to be visible first
  const projectLocator = page.getByText(projectName).first();
  const isProjectVisible = await projectLocator.isVisible().catch(() => false);

  if (!isProjectVisible) {
    // Project doesn't exist in UI, nothing to delete
    return;
  }

  // Hover to reveal action buttons
  await projectLocator.hover();

  // Wait for and click the delete button
  const deleteButton = page.locator('[title*="Delete project" i]').first();
  const isDeleteVisible = await deleteButton.isVisible().catch(() => false);

  if (!isDeleteVisible) {
    // Try alternative: find trash icon near the project
    const trashButton = page.locator('svg.lucide-trash-2').first();
    const isTrashVisible = await trashButton.isVisible().catch(() => false);
    if (isTrashVisible) {
      await trashButton.click();
    } else {
      // Cannot find delete button, skip
      return;
    }
  } else {
    await deleteButton.click();
  }

  // Confirm deletion in the modal
  const confirmDeleteButton = page.getByRole('button', { name: /Delete/i }).last();
  await expect(confirmDeleteButton).toBeVisible();
  await confirmDeleteButton.click();

  // Wait for project to be removed from the list
  await expect(projectLocator).not.toBeVisible({ timeout: 10000 });
}

test.describe('Project Operations - Individual Tests', () => {
  // Skip if no test credentials are provided
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
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
  // Skip if no test credentials are provided
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  // Use unique identifiers for this test run
  // Create test directory in user's home to avoid forbidden paths
  const testId = Date.now();
  const testProjectPath = path.join(os.homedir(), `e2e-test-project-${testId}`);
  const renamedProjectName = `E2E-Test-Renamed-${testId}`;
  let createdProjectName = '';

  test.beforeAll(async () => {
    // Create the test directory before running tests
    await createTestDirectory(testProjectPath);
  });

  test.afterAll(async () => {
    // Clean up the test directory after all tests
    await removeTestDirectory(testProjectPath);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await performLogin(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete the test project from the UI if it exists
    // Try to delete by renamed name first, then by original name
    try {
      await deleteProjectViaUI(page, renamedProjectName);
    } catch {
      // Ignore errors
    }
    if (createdProjectName && createdProjectName !== renamedProjectName) {
      try {
        await deleteProjectViaUI(page, createdProjectName);
      } catch {
        // Ignore errors
      }
    }
  });

  test('complete project lifecycle: create, rename, session, chat, delete', async ({ page }) => {
    test.setTimeout(120000); // Extended timeout for full lifecycle

    // ==========================================
    // Step 1: Create a new project
    // ==========================================
    createdProjectName = await createProject(page, testProjectPath);

    // Verify project appears in sidebar
    const projectInSidebar = page.getByText(createdProjectName, { exact: false }).first();
    await expect(projectInSidebar).toBeVisible();

    // ==========================================
    // Step 2: Rename the project
    // ==========================================
    // Find and hover over the project row to reveal action buttons
    const projectRow = page.locator(`button:has-text("${createdProjectName}")`).first();
    await expect(projectRow).toBeVisible();
    await projectRow.hover();

    // Click the edit button - try by title first
    const editByTitle = page.locator('[title*="Rename" i], [title*="rename" i]').first();
    const editByTitleVisible = await editByTitle.isVisible().catch(() => false);

    if (editByTitleVisible) {
      await editByTitle.click();
    } else {
      // Try clicking the edit icon directly
      const editIcon = page.locator('svg.lucide-edit-3').first();
      await expect(editIcon).toBeVisible();
      await editIcon.click();
    }

    // Find and fill the rename input
    const renameInput = page.locator('input[type="text"]').filter({ hasNot: page.locator('[disabled]') }).first();
    await expect(renameInput).toBeVisible();
    await renameInput.fill(renamedProjectName);
    await renameInput.press('Enter');

    // Verify the project was renamed
    const renamedProjectInSidebar = page.getByText(renamedProjectName).first();
    await expect(renamedProjectInSidebar).toBeVisible();

    // ==========================================
    // Step 3: Create a new session
    // ==========================================
    // Click on the project to expand it
    await renamedProjectInSidebar.click();

    // Wait for project to expand and show "New Session" button
    const newSessionButton = page.locator('button:has-text("New Session")').first();
    await expect(newSessionButton).toBeVisible();
    await newSessionButton.click();

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
    // Step 5: Delete the session (optional - may not be visible)
    // ==========================================
    // Re-click the project to ensure it's expanded
    await renamedProjectInSidebar.click();

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

    // Verify the project is no longer visible
    await expect(page.getByText(renamedProjectName)).not.toBeVisible();
  });
});
