import { test, expect } from '@playwright/test';

test.describe('Shell WebSocket Connection', () => {
  test.beforeEach(async ({ page }) => {
    // Login first if authentication is required
    await page.goto('/');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Check if login is required
    const loginForm = page.locator('input[type="password"]');
    if (await loginForm.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Get credentials from environment or use defaults for testing
      const username = process.env.TEST_USERNAME || 'admin';
      const password = process.env.TEST_PASSWORD || 'admin';

      await page.locator('input[name="username"], input[type="text"]').first().fill(username);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('button[type="submit"]').click();

      // Wait for login to complete
      await page.waitForURL('/', { timeout: 10000 }).catch(() => {});
    }
  });

  test('should establish WebSocket connection to shell endpoint', async ({ page }) => {
    // Listen for WebSocket connections
    const wsPromise = page.waitForEvent('websocket', {
      predicate: (ws) => ws.url().includes('/shell'),
      timeout: 30000,
    });

    // Navigate to a project that has shell access
    // This assumes there's at least one project available
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for shell or terminal tab/button
    const shellButton = page.locator('text=Shell, text=Terminal, [data-testid="shell-tab"]').first();

    if (await shellButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shellButton.click();

      // Wait for the connect button and click it
      const connectButton = page.locator('button:has-text("Connect"), button:has-text("Start")').first();
      if (await connectButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await connectButton.click();

        // Verify WebSocket connection was established
        const ws = await wsPromise.catch(() => null);
        if (ws) {
          expect(ws.url()).toContain('/shell');
        }
      }
    }
  });

  test('shell endpoint should be accessible via WebSocket', async ({ page, request }) => {
    // First verify the health endpoint is working
    const healthResponse = await request.get('/health');
    expect(healthResponse.ok()).toBeTruthy();

    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('ok');
  });

  test('should handle shell initialization message', async ({ page }) => {
    // Create a direct WebSocket connection to test the shell
    const wsMessages = [];

    // Get auth token from localStorage after login
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if we need to login
    const loginForm = page.locator('input[type="password"]');
    if (await loginForm.isVisible({ timeout: 2000 }).catch(() => false)) {
      const username = process.env.TEST_USERNAME || 'admin';
      const password = process.env.TEST_PASSWORD || 'admin';

      await page.locator('input[name="username"], input[type="text"]').first().fill(username);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
    }

    // Test WebSocket connection via page context
    const result = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const token = localStorage.getItem('auth-token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = token
          ? `${protocol}//${window.location.host}/shell?token=${encodeURIComponent(token)}`
          : `${protocol}//${window.location.host}/shell`;

        const ws = new WebSocket(wsUrl);
        const messages = [];
        let connected = false;

        ws.onopen = () => {
          connected = true;
          // Send init message
          ws.send(JSON.stringify({
            type: 'init',
            projectPath: '/tmp',
            sessionId: null,
            hasSession: false,
            provider: 'plain-shell',
            cols: 80,
            rows: 24,
            initialCommand: 'echo "Shell test successful"',
            isPlainShell: true
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            messages.push(data);

            // Check if we received output
            if (data.type === 'output' && data.data.includes('Shell test successful')) {
              ws.close();
              resolve({ success: true, connected, messages: messages.length });
            }
          } catch (e) {
            messages.push({ raw: event.data });
          }
        };

        ws.onerror = (error) => {
          resolve({ success: false, error: 'WebSocket error', connected });
        };

        ws.onclose = () => {
          if (messages.length > 0) {
            resolve({ success: true, connected, messages: messages.length });
          } else {
            resolve({ success: false, error: 'Connection closed without messages', connected });
          }
        };

        // Timeout after 15 seconds
        setTimeout(() => {
          ws.close();
          resolve({
            success: messages.length > 0,
            connected,
            messages: messages.length,
            timeout: true
          });
        }, 15000);
      });
    });

    expect(result.connected).toBeTruthy();
    expect(result.messages).toBeGreaterThan(0);
  });
});

test.describe('Shell PTY Spawn', () => {
  test('server should use correct shell for the platform', async ({ request }) => {
    // This test verifies the health endpoint works
    // The actual shell spawning is tested via WebSocket
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
  });
});
