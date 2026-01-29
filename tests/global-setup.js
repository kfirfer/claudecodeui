import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, '../server/database/test-auth.db');

export default async function globalSetup() {
  // Delete test database if it exists to ensure clean state
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    console.log('Deleted test database:', TEST_DB_PATH);
  }
}
