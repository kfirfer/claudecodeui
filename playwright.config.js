import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/fixtures/global-setup.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use 4 workers as specified in CLAUDE.md
  workers: 4,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3008',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Setup project - runs first to create account and save auth state
    {
      name: 'setup',
      testMatch: /fixtures\/auth\.setup\.js/,
    },
    // Main tests - depend on setup being complete
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use new headless mode for better web API support (including notifications)
        launchOptions: {
          args: ['--headless=new']
        },
        // Use stored auth state from setup
        storageState: './tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'PORT=3008 DATABASE_PATH=./server/database/test-auth.db VITE_DISABLE_VERSION_CHECK=true npm run dev',
    url: 'http://localhost:3008/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
