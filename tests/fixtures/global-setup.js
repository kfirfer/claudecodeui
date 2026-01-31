/**
 * Playwright Global Setup
 *
 * Runs once before all tests to prepare the test environment.
 * - Keeps test database persistent (account persists across test runs)
 * - Cleans up auth state to ensure fresh login
 * - Cleans up old E2E test projects and directories to prevent accumulation
 * - Validates required environment variables
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Clean up auth state for fresh login (but keep database persistent)
  const authDir = path.join(__dirname, '..', '.auth');
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
    console.log('Deleted auth state directory');
  }

  // Clean up old E2E test projects from ~/.claude/projects to prevent accumulation
  // These are leftover from previous test runs that didn't clean up properly
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  const homeDir = os.homedir();

  // Patterns for E2E test projects/directories to clean up
  // Note: Claude projects directory uses path-based naming like "-Users-dev345-e2e-test-..."
  const testProjectPatterns = [
    /e2e-/i,           // Match e2e- anywhere in name (case insensitive)
    /-test-project-/,  // Any project with -test-project- in name
  ];

  // Clean up test directories in home folder
  const testDirPatterns = [
    /^e2e-create-delete-/,
    /^e2e-test-project-/,
    /^e2e-thinking-test-/,
    /^e2e-nav-persist-/,
    /^e2e-indicator-/,
    /^e2e-rapid-/,
    /^e2e-url-nav-/,
    /^e2e-refresh-/,
    /^e2e-session-nav-/,
    /^e2e-notif-/,
    /^e2e-lifecycle-/,
  ];

  // Clean up test directories in home folder
  try {
    const homeDirEntries = fs.readdirSync(homeDir, { withFileTypes: true });
    let cleanedHomeCount = 0;
    for (const entry of homeDirEntries) {
      if (entry.isDirectory() && testDirPatterns.some(p => p.test(entry.name))) {
        const dirPath = path.join(homeDir, entry.name);
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          cleanedHomeCount++;
        } catch {
          // Ignore errors
        }
      }
    }
    if (cleanedHomeCount > 0) {
      console.log(`Cleaned up ${cleanedHomeCount} old test directories from home folder`);
    }
  } catch {
    // Ignore errors reading home directory
  }

  // Clean up test projects from ~/.claude/projects
  if (fs.existsSync(claudeProjectsDir)) {
    try {
      const projectDirs = fs.readdirSync(claudeProjectsDir, { withFileTypes: true });
      let cleanedCount = 0;
      for (const entry of projectDirs) {
        if (entry.isDirectory() && testProjectPatterns.some(p => p.test(entry.name))) {
          const projectPath = path.join(claudeProjectsDir, entry.name);
          try {
            fs.rmSync(projectPath, { recursive: true, force: true });
            cleanedCount++;
          } catch {
            // Ignore errors deleting individual projects
          }
        }
      }
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old E2E test projects from ~/.claude/projects`);
      }
    } catch {
      // Ignore errors reading projects directory
    }
  }

  // Clean up test project entries from ~/.claude/project-config.json
  // This file caches project metadata and can accumulate test project entries
  const projectConfigPath = path.join(os.homedir(), '.claude', 'project-config.json');
  if (fs.existsSync(projectConfigPath)) {
    try {
      const configData = fs.readFileSync(projectConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      let cleanedConfigCount = 0;
      const keysToDelete = [];
      for (const key of Object.keys(config)) {
        // Check if this key matches any test project pattern (e2e- in name)
        if (testProjectPatterns.some(p => p.test(key))) {
          keysToDelete.push(key);
          cleanedConfigCount++;
        }
      }
      if (cleanedConfigCount > 0) {
        for (const key of keysToDelete) {
          delete config[key];
        }
        fs.writeFileSync(projectConfigPath, JSON.stringify(config, null, 2));
        console.log(`Cleaned up ${cleanedConfigCount} test project entries from project-config.json`);
      }
    } catch {
      // Ignore errors reading/writing config file
    }
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
