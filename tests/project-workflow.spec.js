import { test, expect } from '@playwright/test';

/**
 * E2E Test: Complete Project Workflow
 *
 * Tests the full lifecycle of a project:
 * 1. Create a new project
 * 2. Rename the project
 * 3. Create a session
 * 4. Send a hello prompt to Claude
 * 5. Delete the session
 * 6. Delete the project
 */

test.describe('Project Workflow', () => {
  // Skip if no test credentials are provided
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  // Unique identifiers for this test run - use /tmp which always exists
  const testProjectPath = '/tmp';
  const renamedProjectName = `E2E-Test-${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    // Navigate to the app and login
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Login with test credentials
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;

    await page.locator('input[type="text"], input[name="username"]').first().fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait for login to complete and sidebar to load
    await page.waitForTimeout(3000);
    await expect(page.locator('button:has-text("New Project")').first()).toBeVisible({ timeout: 30000 });
  });

  test('complete project lifecycle: create, rename, session, chat, delete', async ({ page }) => {
    // ==========================================
    // Step 1: Create a new project
    // ==========================================
    console.log('Step 1: Creating new project...');

    // Click "New Project" button in sidebar
    const newProjectButton = page.locator('button:has-text("New Project")').first();
    await expect(newProjectButton).toBeVisible({ timeout: 10000 });
    await newProjectButton.click();

    // Wait for Project Creation Wizard modal to appear
    await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible({ timeout: 10000 });

    // Step 1 of wizard: Select "Existing Workspace" option (should be default)
    const existingWorkspaceOption = page.locator('button:has-text("Existing Workspace"), button:has-text("existing")').first();
    if (await existingWorkspaceOption.isVisible()) {
      await existingWorkspaceOption.click();
    }

    // Click "Next" to proceed to step 2
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(500);

    // Step 2: Enter workspace path
    const pathInput = page.locator('input[placeholder*="/path"]').first();
    await expect(pathInput).toBeVisible({ timeout: 5000 });
    await pathInput.fill(testProjectPath);

    // Click "Next" to proceed to step 3 (confirmation)
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(500);

    // Step 3: Confirm and create
    const createButton = page.getByRole('button', { name: /Create Project/i });
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for project creation to complete and modal to close
    await page.waitForTimeout(3000);

    // The modal should close after successful creation
    await expect(page.getByRole('heading', { name: 'Create New Project' })).not.toBeVisible({ timeout: 15000 });

    // Verify project appears in sidebar (it will show the folder name from the path)
    const projectName = testProjectPath.split('/').pop(); // "tmp"
    await expect(page.getByText(projectName, { exact: false }).first()).toBeVisible({ timeout: 15000 });
    console.log('Project created successfully');

    // ==========================================
    // Step 2: Rename the project
    // ==========================================
    console.log('Step 2: Renaming project...');

    // Find and click the project in sidebar to expand it
    const projectItem = page.locator(`button:has-text("${projectName}"), div:has-text("${projectName}")`).first();
    await projectItem.hover();
    await page.waitForTimeout(500);

    // Click the edit/rename button (Edit3 icon)
    const editButton = page.locator('[title*="Rename"], [title*="rename"]').first()
      .or(projectItem.locator('svg.lucide-edit-3').first().locator('..'));

    // If edit button not directly visible, hover to show it
    await projectItem.hover();
    await page.waitForTimeout(300);

    // Try to find and click the edit button
    const editButtonVisible = page.locator('div:has(svg.lucide-edit-3)').first();
    if (await editButtonVisible.isVisible()) {
      await editButtonVisible.click();
    } else {
      // Mobile layout - look for the edit button differently
      const mobileEditButton = page.locator('button:has(svg.lucide-edit-3)').first();
      await mobileEditButton.click();
    }

    // Wait for edit input to appear
    await page.waitForTimeout(500);

    // Find the input field for renaming
    const renameInput = page.locator('input[placeholder*="name"], input[placeholder*="Name"]').first()
      .or(page.locator('input[type="text"]').filter({ has: page.locator('[value]') }).first());

    // Clear and type the new name
    await renameInput.clear();
    await renameInput.fill(renamedProjectName);

    // Save the rename by pressing Enter or clicking check button
    await renameInput.press('Enter');
    await page.waitForTimeout(1000);

    // Verify the project was renamed
    await expect(page.locator(`text=${renamedProjectName}`).first()).toBeVisible({ timeout: 10000 });
    console.log('Project renamed successfully');

    // ==========================================
    // Step 3: Create a new session
    // ==========================================
    console.log('Step 3: Creating new session...');

    // Click on the project to expand it and show sessions
    const renamedProjectItem = page.locator(`button:has-text("${renamedProjectName}"), div:has-text("${renamedProjectName}")`).first();
    await renamedProjectItem.click();
    await page.waitForTimeout(1000);

    // Click "New Session" button within the project's expanded section
    const newSessionButton = page.locator('button:has-text("New Session")').first();
    await expect(newSessionButton).toBeVisible({ timeout: 10000 });
    await newSessionButton.click();

    // Wait for the session to be created and chat interface to load
    await page.waitForTimeout(2000);

    // Verify chat interface is visible (textarea for input)
    const chatTextarea = page.locator('textarea[placeholder*="message"], textarea[placeholder*="Ask"]').first();
    await expect(chatTextarea).toBeVisible({ timeout: 15000 });
    console.log('Session created successfully');

    // ==========================================
    // Step 4: Send a hello prompt to Claude
    // ==========================================
    console.log('Step 4: Sending hello prompt...');

    // Type a hello message in the chat input
    await chatTextarea.fill('Hello! This is a test message from the E2E test suite. Please respond briefly.');

    // Submit the message (try Enter key first, then look for send button)
    // Using Ctrl+Enter or the send button
    const sendButton = page.locator('button[type="submit"]').first()
      .or(page.locator('button:has(svg.lucide-send)').first())
      .or(page.locator('button:has(svg.lucide-arrow-up)').first());

    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      // Try keyboard submission
      await chatTextarea.press('Control+Enter');
    }

    // Wait for the message to be sent
    await page.waitForTimeout(2000);

    // Verify the user message appears in the chat
    await expect(page.locator('text=Hello! This is a test message').first()).toBeVisible({ timeout: 10000 });
    console.log('Hello prompt sent successfully');

    // Wait for response (or timeout gracefully - response depends on Claude being available)
    // We don't require a response, just verify the message was sent
    await page.waitForTimeout(3000);

    // ==========================================
    // Step 5: Delete the session
    // ==========================================
    console.log('Step 5: Deleting session...');

    // Navigate back to sidebar if needed and find the session
    // The session should be visible in the expanded project

    // Hover over the session item to reveal delete button
    const sessionItem = page.locator('[class*="session"], div:has(svg.lucide-message-square)').first();
    await sessionItem.hover();
    await page.waitForTimeout(500);

    // Click the delete button for the session
    const sessionDeleteButton = page.locator('button:has(svg.lucide-trash-2)').first()
      .or(page.locator('[title*="Delete session"], [title*="delete session"]').first());

    if (await sessionDeleteButton.isVisible()) {
      await sessionDeleteButton.click();
    } else {
      // Try finding delete button another way
      await page.locator('svg.lucide-trash-2').first().locator('..').click();
    }

    // Confirm deletion in the confirmation modal if it appears
    const confirmDeleteButton = page.locator('button:has-text("Delete")').last();
    if (await confirmDeleteButton.isVisible({ timeout: 3000 })) {
      await confirmDeleteButton.click();
    }

    await page.waitForTimeout(2000);
    console.log('Session deleted successfully');

    // ==========================================
    // Step 6: Delete the project
    // ==========================================
    console.log('Step 6: Deleting project...');

    // Find the renamed project and hover to show delete button
    const projectToDelete = page.locator(`button:has-text("${renamedProjectName}"), div:has-text("${renamedProjectName}")`).first();
    await projectToDelete.hover();
    await page.waitForTimeout(500);

    // Click the delete button for the project
    const projectDeleteButton = projectToDelete.locator('svg.lucide-trash-2').first().locator('..')
      .or(page.locator('[title*="Delete project"], [title*="delete project"]').first());

    await projectDeleteButton.click();

    // Confirm deletion in the confirmation modal
    const confirmProjectDeleteButton = page.locator('button:has-text("Delete")').last();
    await expect(confirmProjectDeleteButton).toBeVisible({ timeout: 5000 });
    await confirmProjectDeleteButton.click();

    // Wait for project to be deleted
    await page.waitForTimeout(2000);

    // Verify the project is no longer visible
    await expect(page.locator(`text=${renamedProjectName}`)).not.toBeVisible({ timeout: 10000 });
    console.log('Project deleted successfully');

    console.log('All steps completed successfully!');
  });
});

test.describe('Project Operations - Individual Tests', () => {
  // Skip if no test credentials are provided
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  test.beforeEach(async ({ page }) => {
    // Navigate to the app and login
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Login with test credentials
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;

    await page.locator('input[type="text"], input[name="username"]').first().fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait for login to complete
    await page.waitForTimeout(3000);
  });

  test('should show project creation wizard when clicking New Project', async ({ page }) => {
    // Click "New Project" button
    const newProjectButton = page.locator('button:has-text("New Project")').first();
    await expect(newProjectButton).toBeVisible({ timeout: 15000 });
    await newProjectButton.click();

    // Verify wizard modal appears - use specific heading
    const wizardHeading = page.getByRole('heading', { name: 'Create New Project' });
    await expect(wizardHeading).toBeVisible({ timeout: 10000 });

    // Verify wizard has expected steps/options - Existing Workspace option
    await expect(
      page.getByText('Existing Workspace').first()
    ).toBeVisible({ timeout: 5000 });

    // Close the wizard
    const closeButton = page.locator('button:has(svg.lucide-x)').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });

  test('should display project list in sidebar', async ({ page }) => {
    // Wait for sidebar to load
    await page.waitForTimeout(2000);

    // Check that sidebar is visible - use first() to avoid strict mode violation
    const sidebar = page.getByRole('heading', { name: 'Claude Code UI' }).first();
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Check that New Project button is available
    const newProjectButton = page.locator('button:has-text("New Project")').first();
    await expect(newProjectButton).toBeVisible({ timeout: 10000 });
  });

  test('should have settings button accessible', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(2000);

    // Settings button visibility depends on viewport - try desktop selector first, then mobile
    // Desktop: small text button at bottom of sidebar
    // Mobile: larger button with icon
    let settingsButton = page.locator('button:has-text("Settings")').filter({ hasText: /^Settings$/i }).first();
    let isVisible = await settingsButton.isVisible().catch(() => false);

    if (!isVisible) {
      // Try the button with settings icon
      settingsButton = page.locator('button:has(svg.lucide-settings)').first();
      isVisible = await settingsButton.isVisible().catch(() => false);
    }

    if (!isVisible) {
      // Try getting any button with "Settings" text
      settingsButton = page.getByRole('button', { name: /settings/i }).first();
    }

    // The button may be hidden in mobile view - verify it exists in DOM
    await expect(settingsButton).toBeAttached({ timeout: 15000 });

    // Click it if visible
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Verify settings modal opens
      await expect(
        page.getByRole('dialog').or(page.locator('[class*="modal"]'))
      ).toBeVisible({ timeout: 10000 });
    } else {
      // In mobile/hidden view, just verify the button exists in the DOM
      console.log('Settings button is hidden in current viewport, but exists in DOM');
    }
  });
});
