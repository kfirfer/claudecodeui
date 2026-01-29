import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3008',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use new headless mode for better web API support (including notifications)
        launchOptions: {
          args: ['--headless=new']
        }
      },
    },
  ],
  webServer: {
    command: 'PORT=3008 npm run dev',
    url: 'http://localhost:3008/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
