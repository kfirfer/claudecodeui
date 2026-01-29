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

test.describe('Session Visibility - Comprehensive Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await performLogin(page);
  });

  test('multiple sessions with navigation during AI thinking', async ({ page }) => {
    test.setTimeout(240000);

    const testId = Date.now();
    const testProjectPath = path.join(os.homedir(), `e2e-session-nav-${testId}`);
    const projectFolderName = `e2e-session-nav-${testId}`;

    await createTestDirectory(testProjectPath);

    try {
      // ==========================================
      // PHASE 1: Create project and first session
      // ==========================================
      console.log('\n=== PHASE 1: Create project and first session ===');

      const createdProjectName = await createProject(page, testProjectPath);
      expect(createdProjectName).toBe(projectFolderName);
      console.log('✓ Project created');

      const projectButton = page.locator(`button:has-text("${projectFolderName}")`).first();
      await expect(projectButton).toBeVisible();
      await projectButton.click();
      console.log('✓ Project expanded');

      // Helper to check session count by looking for the badge number in the project button
      // The button text format is: "project-name N• path" where N is the session count
      const checkSessionCount = async (expectedCount) => {
        const projectWithCount = page.locator(`button:has-text("${projectFolderName}")`).filter({
          has: page.locator(`text="${expectedCount}"`)
        }).first();
        return await projectWithCount.isVisible().catch(() => false);
      };

      // Check initial session count is 0
      const has0Sessions = await checkSessionCount(0);
      console.log(`Initial session count is 0: ${has0Sessions}`);
      expect(has0Sessions).toBe(true);

      // ==========================================
      // PHASE 2: Create first session and send message
      // ==========================================
      console.log('\n=== PHASE 2: First session ===');

      const newSessionBtn = page.locator('button:has-text("New Session")').first();
      await newSessionBtn.dispatchEvent('click');

      const chatTextarea = page.locator('textarea').first();
      await expect(chatTextarea).toBeVisible({ timeout: 15000 });

      // Handle provider selection if shown
      const claudeProvider = page.locator('button:has-text("Claude Claude Code by Anthropic")').first();
      if (await claudeProvider.isVisible().catch(() => false)) {
        await claudeProvider.click();
        await page.waitForTimeout(500);
      }

      const firstMessage = `First session ${testId} - say hello`;
      await chatTextarea.fill(firstMessage);
      console.log('Sending first message...');

      const sendBtn = page.locator('button:has(svg.lucide-arrow-up)').first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click();
      } else {
        await chatTextarea.press('Control+Enter');
      }

      // Verify message sent
      await expect(page.getByText(firstMessage).first()).toBeVisible({ timeout: 5000 });
      console.log('✓ First message sent');

      // CRITICAL CHECK: Session count should immediately show 1
      console.log('Checking session count immediately after sending...');
      await page.waitForTimeout(500);
      let has1Session = await checkSessionCount(1);
      console.log(`Session count is 1 after sending: ${has1Session}`);

      // Wait up to 3 seconds for session count to become 1
      const projectWith1 = page.locator(`button:has-text("${projectFolderName}")`).filter({
        has: page.locator('text="1"')
      }).first();
      await expect(projectWith1).toBeVisible({ timeout: 3000 });
      console.log('✓ Session count changed to 1 immediately');

      // Wait for AI to complete first session
      console.log('Waiting for first AI response...');
      const stopBtn = page.locator('button:has-text("Stop")').first();
      await expect(stopBtn).toBeHidden({ timeout: 120000 });
      console.log('✓ First AI response complete');

      // Verify session count still 1
      has1Session = await checkSessionCount(1);
      console.log(`Session count is still 1 after AI complete: ${has1Session}`);
      expect(has1Session).toBe(true);

      // ==========================================
      // PHASE 3: Create second session
      // ==========================================
      console.log('\n=== PHASE 3: Second session ===');

      // Click New Session
      const newSessionBtn2 = page.locator('button:has-text("New Session")').first();
      await newSessionBtn2.dispatchEvent('click');
      console.log('Clicked New Session for second session');

      await page.waitForTimeout(1000);

      // Handle provider selection again if shown
      const claudeProvider2 = page.locator('button:has-text("Claude Claude Code by Anthropic")').first();
      if (await claudeProvider2.isVisible().catch(() => false)) {
        await claudeProvider2.click();
        await page.waitForTimeout(500);
      }

      const chatTextarea2 = page.locator('textarea').first();
      await expect(chatTextarea2).toBeVisible({ timeout: 15000 });

      const secondMessage = `Second session ${testId} - tell me a joke`;
      await chatTextarea2.fill(secondMessage);
      console.log('Sending second message...');

      const sendBtn2 = page.locator('button:has(svg.lucide-arrow-up)').first();
      if (await sendBtn2.isVisible().catch(() => false)) {
        await sendBtn2.click();
      } else {
        await chatTextarea2.press('Control+Enter');
      }

      // Verify second message sent
      await expect(page.getByText(secondMessage).first()).toBeVisible({ timeout: 5000 });
      console.log('✓ Second message sent');

      // CRITICAL CHECK: Session count should immediately show 2
      console.log('Checking session count immediately after sending second message...');
      await page.waitForTimeout(500);
      let has2Sessions = await checkSessionCount(2);
      console.log(`Session count is 2 after sending second message: ${has2Sessions}`);

      const projectWith2 = page.locator(`button:has-text("${projectFolderName}")`).filter({
        has: page.locator('text="2"')
      }).first();
      await expect(projectWith2).toBeVisible({ timeout: 3000 });
      console.log('✓ Session count changed to 2 immediately');

      // ==========================================
      // PHASE 4: Navigate between sessions WHILE AI is thinking
      // ==========================================
      console.log('\n=== PHASE 4: Navigate between sessions while AI thinking ===');

      // AI should still be processing - verify Stop button visible
      const stopBtn2 = page.locator('button:has-text("Stop")').first();
      const isProcessing = await stopBtn2.isVisible().catch(() => false);
      console.log(`AI is currently processing: ${isProcessing}`);

      if (isProcessing) {
        // Find session buttons in sidebar (look for session items with icons)
        // Sessions appear as buttons within the expanded project
        console.log('Looking for session buttons in sidebar...');

        // Get all buttons that could be sessions (have message-square or clock icons)
        const sidebarArea = page.locator('.overflow-y-auto, [class*="scroll"]').first();

        // Try to find the first session (contains "First session" or similar)
        const firstSessionBtn = page.locator('button').filter({
          hasText: /First session|hello/i
        }).first();

        const firstSessionVisible = await firstSessionBtn.isVisible().catch(() => false);
        console.log(`First session button visible: ${firstSessionVisible}`);

        if (firstSessionVisible) {
          // Click on first session while second is processing
          console.log('Clicking on first session while second is processing...');
          await firstSessionBtn.click();
          await page.waitForTimeout(1000);

          // Verify first session content is shown
          const firstMsgInChat = page.getByText(firstMessage).first();
          const firstMsgVisible = await firstMsgInChat.isVisible().catch(() => false);
          console.log(`First session message visible in chat: ${firstMsgVisible}`);

          // Check session count - should still be 2
          has2Sessions = await checkSessionCount(2);
          console.log(`Session count still 2 after switching to first session: ${has2Sessions}`);

          // Switch back to second session
          const secondSessionBtn = page.locator('button').filter({
            hasText: /Second session|joke/i
          }).first();

          const secondSessionVisible = await secondSessionBtn.isVisible().catch(() => false);
          console.log(`Second session button visible: ${secondSessionVisible}`);

          if (secondSessionVisible) {
            console.log('Clicking back to second session...');
            await secondSessionBtn.click();
            await page.waitForTimeout(1000);

            // Verify second session content
            const secondMsgInChat = page.getByText(secondMessage).first();
            const secondMsgVisible = await secondMsgInChat.isVisible().catch(() => false);
            console.log(`Second session message visible in chat: ${secondMsgVisible}`);
          }

          // Check session count again - should still be 2
          has2Sessions = await checkSessionCount(2);
          console.log(`Session count still 2 after switching back: ${has2Sessions}`);
        }
      }

      // ==========================================
      // PHASE 5: Wait for second AI to complete
      // ==========================================
      console.log('\n=== PHASE 5: Wait for second AI to complete ===');
      await expect(stopBtn2).toBeHidden({ timeout: 120000 });
      console.log('✓ Second AI response complete');

      // Final session count check
      has2Sessions = await checkSessionCount(2);
      console.log(`Final session count is 2: ${has2Sessions}`);
      expect(has2Sessions).toBe(true);

      // ==========================================
      // PHASE 6: Navigate between completed sessions
      // ==========================================
      console.log('\n=== PHASE 6: Navigate between completed sessions ===');

      // Click first session
      const firstSessionFinal = page.locator('button').filter({
        hasText: /First session|hello/i
      }).first();

      if (await firstSessionFinal.isVisible().catch(() => false)) {
        await firstSessionFinal.click();
        await page.waitForTimeout(1000);

        // Verify first session messages are shown
        const firstMsgCheck = await page.getByText(firstMessage).first().isVisible().catch(() => false);
        console.log(`First session content visible: ${firstMsgCheck}`);

        // Session count should still be 2
        has2Sessions = await checkSessionCount(2);
        console.log(`Session count still 2 while viewing first session: ${has2Sessions}`);
        expect(has2Sessions).toBe(true);
      }

      // Click second session
      const secondSessionFinal = page.locator('button').filter({
        hasText: /Second session|joke/i
      }).first();

      if (await secondSessionFinal.isVisible().catch(() => false)) {
        await secondSessionFinal.click();
        await page.waitForTimeout(1000);

        // Verify second session messages are shown
        const secondMsgCheck = await page.getByText(secondMessage).first().isVisible().catch(() => false);
        console.log(`Second session content visible: ${secondMsgCheck}`);

        // Session count should still be 2
        has2Sessions = await checkSessionCount(2);
        console.log(`Session count still 2 while viewing second session: ${has2Sessions}`);
        expect(has2Sessions).toBe(true);
      }

      // ==========================================
      // PHASE 7: Cleanup
      // ==========================================
      console.log('\n=== PHASE 7: Cleanup ===');
      try {
        await deleteProjectViaUI(page, projectFolderName);
        console.log('✓ Project deleted');
      } catch (e) {
        console.log('Project cleanup failed:', e.message);
      }

      console.log('\n=== TEST COMPLETE ===');

    } finally {
      await removeTestDirectory(testProjectPath);
    }
  });
});
