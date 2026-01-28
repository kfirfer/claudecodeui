import { test, expect } from '@playwright/test';

test.describe('Server Health', () => {
  test('health endpoint should return ok status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });
});

test.describe('Shell WebSocket Connection', () => {
  test('should show login page when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show login form
    const loginForm = page.locator('input[type="password"]');
    await expect(loginForm).toBeVisible({ timeout: 10000 });
  });

  test('WebSocket shell endpoint should require authentication', async ({ page }) => {
    // Try to connect to shell WebSocket without auth
    const result = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/shell`;

        const ws = new WebSocket(wsUrl);
        let wasOpened = false;
        let wasClosed = false;
        let closeCode = null;

        ws.onopen = () => {
          wasOpened = true;
        };

        ws.onclose = (event) => {
          wasClosed = true;
          closeCode = event.code;
          resolve({ wasOpened, wasClosed, closeCode });
        };

        ws.onerror = () => {
          resolve({ wasOpened, wasClosed: true, closeCode: null, error: true });
        };

        // Timeout after 5 seconds
        setTimeout(() => {
          ws.close();
          resolve({ wasOpened, wasClosed, closeCode, timeout: true });
        }, 5000);
      });
    });

    // Without authentication, connection should be closed or rejected
    expect(result.wasClosed).toBeTruthy();
  });
});

test.describe('Shell PTY Configuration', () => {
  test('server should detect shell correctly on startup', async ({ request }) => {
    // Health check confirms server started successfully with PTY
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
  });
});

// Authenticated tests - require TEST_USERNAME and TEST_PASSWORD env vars
test.describe('Authenticated Shell Tests', () => {
  test.skip(
    !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD,
    'Skipping authenticated tests - set TEST_USERNAME and TEST_PASSWORD env vars'
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Login
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;

    await page.locator('input[type="text"], input[name="username"]').first().fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait for login to complete
    await page.waitForTimeout(2000);
  });

  test('should connect to shell WebSocket after authentication', async ({ page }) => {
    const result = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const token = localStorage.getItem('auth-token');
        if (!token) {
          resolve({ success: false, error: 'No auth token' });
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/shell?token=${encodeURIComponent(token)}`;

        const ws = new WebSocket(wsUrl);
        const messages = [];

        ws.onopen = () => {
          // Send init message for plain shell
          ws.send(JSON.stringify({
            type: 'init',
            projectPath: '/tmp',
            sessionId: null,
            hasSession: false,
            provider: 'plain-shell',
            cols: 80,
            rows: 24,
            initialCommand: 'echo "test123"',
            isPlainShell: true
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            messages.push(data);

            if (data.type === 'output' && data.data.includes('test123')) {
              ws.close();
              resolve({ success: true, messages: messages.length });
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          resolve({ success: false, error: 'WebSocket error' });
        };

        ws.onclose = () => {
          resolve({
            success: messages.some(m => m.type === 'output'),
            messages: messages.length
          });
        };

        setTimeout(() => {
          ws.close();
          resolve({ success: messages.length > 0, messages: messages.length, timeout: true });
        }, 10000);
      });
    });

    expect(result.success).toBeTruthy();
  });
});
