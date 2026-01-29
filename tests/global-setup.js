/**
 * Playwright Global Setup
 *
 * Runs once before all tests to prepare the test environment.
 * - Keeps test database persistent (account persists across test runs)
 * - Cleans up auth state to ensure fresh login
 * - Validates required environment variables
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Clean up auth state for fresh login (but keep database persistent)
  const authDir = path.join(__dirname, '.auth');
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
    console.log('Deleted auth state directory');
  }

  // Warn if credentials are not set (some tests will be skipped)
  if (!process.env.TEST_USERNAME || !process.env.TEST_PASSWORD) {
    console.warn(
      '\n⚠️  TEST_USERNAME and/or TEST_PASSWORD not set.\n' +
      '   Some authenticated tests will be skipped.\n' +
      '   Set these in .env or export them to run all tests.\n'
    );
  }
}
