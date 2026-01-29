# Mobile Browser Notifications Implementation Plan

## Executive Summary

This document outlines a comprehensive implementation plan for mobile browser notifications in Claude Code UI. The implementation will enable users to receive notifications when Claude Code, Cursor, or OpenAI Codex completes tasks, both on desktop and mobile devices. The plan follows a phased approach, starting with enhanced mobile-aware notifications and progressing to full Web Push API integration for true background notifications.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1: Mobile Notification API Enhancement](#3-phase-1-mobile-notification-api-enhancement)
4. [Phase 2: Web Push API Integration](#4-phase-2-web-push-api-integration)
5. [Phase 3: E2E Testing](#5-phase-3-e2e-testing)
6. [File Change Inventory](#6-file-change-inventory)
7. [Dependencies and Environment](#7-dependencies-and-environment)
8. [Risk Assessment](#8-risk-assessment)
9. [Success Criteria](#9-success-criteria)

---

## 1. Current State Analysis

### 1.1 Existing Notification System

The application currently has a desktop notification system implemented using the browser's Notification API:

| Component | Location | Purpose |
|-----------|----------|---------|
| `useNotifications` | `src/hooks/useNotifications.js` | Core hook for notification logic |
| `NotificationContext` | `src/contexts/NotificationContext.jsx` | Global notification state provider |
| `NotificationSettings` | `src/components/settings/NotificationSettings.jsx` | Settings UI component |
| `notificationContent` | `src/utils/notificationContent.js` | Notification content formatter |
| `sw.js` | `public/sw.js` | Service worker (PWA caching only) |

### 1.2 Current Settings

```javascript
const defaultSettings = {
  enabled: false,
  soundEnabled: false,
  onlyWhenUnfocused: true,
  permissionRequested: false,
  lastUpdated: null
};
```

### 1.3 Notification Trigger Flow

```
User Sends Message → WebSocket → Backend Processing →
Claude/Cursor/Codex Completes → WebSocket 'claude-complete' event →
ChatInterface.jsx → getNotificationContent() → sendNotification()
```

### 1.4 Limitations of Current Implementation

- Desktop-only focus (no mobile-specific handling)
- No background notification support (requires tab to be open)
- No PWA installation prompts for mobile users
- No Web Push API integration for true push notifications
- Service worker only handles caching, not notifications

---

## 2. Architecture Overview

### 2.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  useNotifications │  │usePushNotifications│ │ mobileDetection│ │
│  │  (Desktop API)   │  │  (Web Push API)   │  │   (Utils)     │  │
│  └────────┬─────────┘  └────────┬──────────┘  └───────┬───────┘  │
│           │                     │                     │          │
│           └─────────────────────┴─────────────────────┘          │
│                                 │                                │
│                    ┌────────────┴────────────┐                   │
│                    │   NotificationContext   │                   │
│                    └────────────┬────────────┘                   │
│                                 │                                │
│           ┌─────────────────────┴─────────────────────┐          │
│           │          NotificationSettings             │          │
│           │  (Desktop + Mobile + Push toggles)        │          │
│           └───────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ WebSocket / HTTP
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                     Service Worker (sw.js)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Cache Events │  │ Push Events  │  │ Notification Click   │   │
│  │ (Existing)   │  │ (New)        │  │ Events (New)         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Push API
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Node.js)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  Push Routes     │  │  Push Service    │  │ VAPID Keys    │  │
│  │  /api/push/*     │  │  (web-push lib)  │  │ Management    │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                                 │                                │
│                    ┌────────────┴────────────┐                   │
│                    │   SQLite Database       │                   │
│                    │   push_subscriptions    │                   │
│                    └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Notification Types

| Type | API | Works in Background | Requirements |
|------|-----|---------------------|--------------|
| Desktop | Notification API | No (tab must be open) | Permission granted |
| Mobile Foreground | Notification API | No (app must be open) | Permission granted |
| Mobile Background | Web Push API | Yes | Service Worker + Push Subscription |
| PWA | Notification API | Partial (varies by platform) | Added to Home Screen |

---

## 3. Phase 1: Mobile Notification API Enhancement

**Goal**: Enhance the existing notification system to be mobile-aware and provide better PWA support.

### 3.1 Tasks

#### 3.1.1 Mobile Detection Utility
- [ ] **Task**: Create mobile detection utility
  - [ ] Subtask: Create `src/utils/mobileDetection.js`
  - [ ] Subtask: Implement `isMobile()` function
  - [ ] Subtask: Implement `isIOS()` function
  - [ ] Subtask: Implement `isAndroid()` function
  - [ ] Subtask: Implement `isPWA()` function (standalone display mode)
  - [ ] Subtask: Implement `canInstallPWA()` function

#### 3.1.2 PWA Install Prompt Component
- [ ] **Task**: Create PWA install prompt for mobile users
  - [ ] Subtask: Create `src/components/common/PWAInstallPrompt.jsx`
  - [ ] Subtask: Handle iOS "Add to Home Screen" instructions
  - [ ] Subtask: Handle Android `beforeinstallprompt` event
  - [ ] Subtask: Store dismissal preference in localStorage
  - [ ] Subtask: Add i18n translations

#### 3.1.3 Update Notification Settings UI
- [ ] **Task**: Add mobile notification section to settings
  - [ ] Subtask: Add "Mobile Notifications" section header
  - [ ] Subtask: Show PWA install prompt for non-PWA mobile users
  - [ ] Subtask: Display mobile browser compatibility info
  - [ ] Subtask: Add iOS 16.4+ requirement notice
  - [ ] Subtask: Update i18n translation files

#### 3.1.4 Service Worker Enhancement
- [ ] **Task**: Update service worker for notification display
  - [ ] Subtask: Add `notificationclick` event handler
  - [ ] Subtask: Add `notificationclose` event handler
  - [ ] Subtask: Implement window focus on notification click
  - [ ] Subtask: Add notification action buttons (optional)

### 3.2 Deliverables

| Deliverable | File | Description |
|-------------|------|-------------|
| Mobile Detection | `src/utils/mobileDetection.js` | Utility functions for device detection |
| PWA Prompt | `src/components/common/PWAInstallPrompt.jsx` | Install prompt component |
| Updated Settings | `src/components/settings/NotificationSettings.jsx` | Mobile-aware settings UI |
| i18n Updates | `src/i18n/locales/*/settings.json` | Translation strings |

---

## 4. Phase 2: Web Push API Integration

**Goal**: Implement full Web Push API support for true background notifications.

### 4.1 Backend Tasks

#### 4.1.1 VAPID Key Management
- [ ] **Task**: Set up VAPID key infrastructure
  - [ ] Subtask: Create `server/utils/vapidKeys.js`
  - [ ] Subtask: Implement key generation script
  - [ ] Subtask: Add environment variable configuration
  - [ ] Subtask: Document key rotation procedure

```javascript
// Environment variables needed:
// VAPID_PUBLIC_KEY=BGtkbcjr...
// VAPID_PRIVATE_KEY=I0_d0vne...
// VAPID_SUBJECT=mailto:admin@example.com
```

#### 4.1.2 Database Schema
- [ ] **Task**: Add push_subscriptions table
  - [ ] Subtask: Create migration script
  - [ ] Subtask: Implement `push_subscriptions` table schema
  - [ ] Subtask: Add indexes for efficient queries
  - [ ] Subtask: Update `server/database/db.js`

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_info TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
```

#### 4.1.3 Push API Routes
- [ ] **Task**: Create push notification API endpoints
  - [ ] Subtask: Create `server/routes/push.js`
  - [ ] Subtask: Implement `POST /api/push/subscribe`
  - [ ] Subtask: Implement `DELETE /api/push/unsubscribe`
  - [ ] Subtask: Implement `GET /api/push/status`
  - [ ] Subtask: Implement `GET /api/push/vapid-public-key`
  - [ ] Subtask: Add request validation
  - [ ] Subtask: Add rate limiting

#### 4.1.4 Push Service
- [ ] **Task**: Create push notification service
  - [ ] Subtask: Create `server/services/pushService.js`
  - [ ] Subtask: Implement `sendPushNotification(userId, payload)`
  - [ ] Subtask: Implement `sendPushToAllUserDevices(userId, payload)`
  - [ ] Subtask: Handle subscription expiry/removal
  - [ ] Subtask: Implement error handling for failed pushes
  - [ ] Subtask: Add logging for push delivery

#### 4.1.5 Integration with Agent Completions
- [ ] **Task**: Trigger push notifications on task completion
  - [ ] Subtask: Update `server/claude-sdk.js` to call push service
  - [ ] Subtask: Update `server/cursor-cli.js` to call push service
  - [ ] Subtask: Update `server/openai-codex.js` to call push service
  - [ ] Subtask: Ensure notifications only sent when push enabled

### 4.2 Frontend Tasks

#### 4.2.1 Push Notification Hook
- [ ] **Task**: Create push notification subscription hook
  - [ ] Subtask: Create `src/hooks/usePushNotifications.js`
  - [ ] Subtask: Implement `subscribe()` function
  - [ ] Subtask: Implement `unsubscribe()` function
  - [ ] Subtask: Implement `getSubscriptionStatus()` function
  - [ ] Subtask: Handle permission requests
  - [ ] Subtask: Store subscription state in localStorage

```javascript
// Hook interface
const {
  isSubscribed,
  isPushSupported,
  subscribe,
  unsubscribe,
  subscriptionStatus, // 'active' | 'inactive' | 'error'
  error
} = usePushNotifications();
```

#### 4.2.2 Service Worker Push Handler
- [ ] **Task**: Add push event handling to service worker
  - [ ] Subtask: Add `push` event listener
  - [ ] Subtask: Parse push payload
  - [ ] Subtask: Display notification with proper options
  - [ ] Subtask: Handle notification actions
  - [ ] Subtask: Implement notification click navigation

```javascript
// Service worker push handler structure
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body,
    icon: '/icons/claude-ai-icon.svg',
    badge: '/icons/icon-128x128.png',
    tag: data.tag || 'claude-notification',
    data: { url: data.url || '/' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});
```

#### 4.2.3 Update Settings UI for Push
- [ ] **Task**: Add push notification settings section
  - [ ] Subtask: Create `src/components/settings/PushNotificationSettings.jsx`
  - [ ] Subtask: Add "Enable Push Notifications" toggle
  - [ ] Subtask: Show subscription status
  - [ ] Subtask: Display device registration info
  - [ ] Subtask: Add "Test Push" button
  - [ ] Subtask: Integrate into main NotificationSettings

#### 4.2.4 Update Notification Context
- [ ] **Task**: Extend NotificationContext with push support
  - [ ] Subtask: Add push notification state
  - [ ] Subtask: Add push subscription functions
  - [ ] Subtask: Add push-specific settings
  - [ ] Subtask: Maintain backward compatibility

### 4.3 Deliverables

| Deliverable | File | Description |
|-------------|------|-------------|
| VAPID Utils | `server/utils/vapidKeys.js` | Key management utilities |
| Push Routes | `server/routes/push.js` | API endpoints |
| Push Service | `server/services/pushService.js` | Push sending logic |
| DB Schema | `server/database/db.js` | Push subscriptions table |
| Push Hook | `src/hooks/usePushNotifications.js` | Frontend subscription hook |
| Push Settings | `src/components/settings/PushNotificationSettings.jsx` | Push settings UI |
| Updated SW | `public/sw.js` | Push event handlers |

---

## 5. Phase 3: E2E Testing

**Goal**: Comprehensive Playwright E2E tests for all notification features.

### 5.1 Test Configuration

```typescript
// playwright.config.ts updates
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    permissions: ['notifications'],
  },
  workers: 4, // Required per CLAUDE.md
});
```

### 5.2 Test Tasks

#### 5.2.1 Mobile Notification Settings Tests
- [ ] **Task**: Test mobile-specific settings UI
  - [ ] Subtask: Test mobile detection display
  - [ ] Subtask: Test PWA install prompt visibility
  - [ ] Subtask: Test mobile browser compatibility message
  - [ ] Subtask: Test iOS requirement notice

```javascript
// Test example
test('should show PWA install prompt on mobile', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    permissions: ['notifications'],
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3001');
  // ... test PWA prompt visibility
});
```

#### 5.2.2 Push Notification Settings Tests
- [ ] **Task**: Test push notification settings
  - [ ] Subtask: Test push toggle visibility
  - [ ] Subtask: Test subscription button functionality
  - [ ] Subtask: Test subscription status display
  - [ ] Subtask: Test unsubscribe functionality
  - [ ] Subtask: Test settings persistence

#### 5.2.3 Permission Flow Tests
- [ ] **Task**: Test notification permission flows
  - [ ] Subtask: Test permission granted state
  - [ ] Subtask: Test permission denied state
  - [ ] Subtask: Test permission default state
  - [ ] Subtask: Test permission request button

```javascript
// Test with granted permission
test.describe('Notifications with permission granted', () => {
  test.use({
    permissions: ['notifications'],
  });

  test('should enable notification toggle', async ({ page }) => {
    await page.goto('http://localhost:3001');
    await performLogin(page);
    await openNotificationSettings(page);

    const toggle = page.locator('[data-testid="notification-toggle"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
```

#### 5.2.4 Service Worker Tests
- [ ] **Task**: Test service worker registration
  - [ ] Subtask: Test SW registration success
  - [ ] Subtask: Test SW scope
  - [ ] Subtask: Test SW update handling

#### 5.2.5 Notification Trigger Tests
- [ ] **Task**: Test notification triggers on completion
  - [ ] Subtask: Test Claude completion triggers notification
  - [ ] Subtask: Test Cursor completion triggers notification
  - [ ] Subtask: Test Codex completion triggers notification
  - [ ] Subtask: Test only-when-unfocused setting

#### 5.2.6 Mobile Device Emulation Tests
- [ ] **Task**: Test mobile-specific behavior
  - [ ] Subtask: Test on iPhone device profile
  - [ ] Subtask: Test on Android device profile
  - [ ] Subtask: Test responsive UI
  - [ ] Subtask: Test PWA mode detection

```javascript
// Mobile emulation test
test.describe('Mobile notification behavior', () => {
  test.use({
    ...devices['Pixel 7'],
  });

  test('should show mobile-specific notification options', async ({ page }) => {
    await page.goto('http://localhost:3001');
    await performLogin(page);
    await openNotificationSettings(page);

    await expect(page.locator('[data-testid="mobile-notification-section"]')).toBeVisible();
  });
});
```

### 5.3 Test File Structure

```
tests/
├── notifications.spec.js          # Existing tests (to be extended)
├── notifications-mobile.spec.js   # New mobile-specific tests
└── notifications-push.spec.js     # New push notification tests
```

### 5.4 Test Coverage Matrix

| Feature | Desktop | Mobile (Foreground) | Mobile (PWA) | Push |
|---------|---------|---------------------|--------------|------|
| Settings Toggle | [ ] | [ ] | [ ] | [ ] |
| Permission Request | [ ] | [ ] | [ ] | [ ] |
| Permission Granted | [ ] | [ ] | [ ] | [ ] |
| Permission Denied | [ ] | [ ] | [ ] | [ ] |
| Notification Trigger | [ ] | [ ] | [ ] | [ ] |
| Only When Unfocused | [ ] | [ ] | [ ] | N/A |
| Sound Toggle | [ ] | [ ] | [ ] | [ ] |
| Test Button | [ ] | [ ] | [ ] | [ ] |
| Settings Persistence | [ ] | [ ] | [ ] | [ ] |

---

## 6. File Change Inventory

### 6.1 New Files

| File | Phase | Description |
|------|-------|-------------|
| `src/utils/mobileDetection.js` | 1 | Mobile/PWA detection utilities |
| `src/components/common/PWAInstallPrompt.jsx` | 1 | PWA install prompt |
| `src/hooks/usePushNotifications.js` | 2 | Push subscription hook |
| `src/components/settings/PushNotificationSettings.jsx` | 2 | Push settings UI |
| `server/routes/push.js` | 2 | Push API endpoints |
| `server/services/pushService.js` | 2 | Push notification service |
| `server/utils/vapidKeys.js` | 2 | VAPID key management |
| `tests/notifications-mobile.spec.js` | 3 | Mobile E2E tests |
| `tests/notifications-push.spec.js` | 3 | Push E2E tests |

### 6.2 Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `src/hooks/useNotifications.js` | 1, 2 | Add mobile-aware logic, push integration |
| `src/components/settings/NotificationSettings.jsx` | 1, 2 | Add mobile section, push section |
| `src/contexts/NotificationContext.jsx` | 2 | Add push notification state |
| `public/sw.js` | 1, 2 | Add notification click handler, push handler |
| `src/i18n/locales/en/settings.json` | 1, 2 | Add translation strings |
| `src/i18n/locales/zh-CN/settings.json` | 1, 2 | Add Chinese translations |
| `server/index.js` | 2 | Register push routes |
| `server/database/db.js` | 2 | Add push_subscriptions table |
| `server/claude-sdk.js` | 2 | Trigger push on completion |
| `server/cursor-cli.js` | 2 | Trigger push on completion |
| `server/openai-codex.js` | 2 | Trigger push on completion |
| `tests/notifications.spec.js` | 3 | Extend existing tests |
| `package.json` | 2 | Add web-push dependency |

---

## 7. Dependencies and Environment

### 7.1 NPM Dependencies

```json
{
  "dependencies": {
    "web-push": "^3.6.7"
  }
}
```

### 7.2 Environment Variables

```bash
# .env additions for Phase 2
VAPID_PUBLIC_KEY=BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE
VAPID_PRIVATE_KEY=I0_d0vnesxbBSUmlDdOKibGo6vEXRO-Vu88QlSlm5j0
VAPID_SUBJECT=mailto:admin@example.com
```

### 7.3 Browser Compatibility

| Browser | Desktop Notifications | Mobile Notifications | Push Notifications |
|---------|----------------------|---------------------|-------------------|
| Chrome Desktop | Yes | N/A | Yes |
| Firefox Desktop | Yes | N/A | Yes |
| Safari Desktop | Yes | N/A | Yes (macOS 13+) |
| Chrome Android | Yes | Yes | Yes |
| Firefox Android | Yes | Yes | Yes |
| Safari iOS | No | Yes (iOS 16.4+, PWA) | Yes (iOS 16.4+, PWA) |
| Edge Desktop | Yes | N/A | Yes |

### 7.4 VAPID Key Generation Script

```javascript
// scripts/generate-vapid-keys.js
const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('\nAdd these to your .env file');
```

---

## 8. Risk Assessment

### 8.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| iOS Safari limitations | Medium | High | Clear documentation, PWA install prompts |
| Push service downtime | Low | Medium | Graceful fallback to WebSocket notifications |
| VAPID key exposure | Low | High | Environment variables, key rotation procedure |
| Browser compatibility issues | Medium | Medium | Feature detection, graceful degradation |
| Service worker conflicts | Low | Medium | Proper versioning, update handling |

### 8.2 UX Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Notification fatigue | Medium | Medium | Smart notification grouping, user controls |
| Permission denial | Medium | Medium | Clear explanation, delayed prompts |
| Confusing mobile setup | Medium | Low | Step-by-step PWA install guide |

### 8.3 Security Considerations

1. **VAPID Keys**: Store securely in environment variables, never commit to repository
2. **Push Subscriptions**: Associate with authenticated users only
3. **Payload Validation**: Validate all push payloads server-side
4. **HTTPS Requirement**: Push API requires secure context (already handled)
5. **Rate Limiting**: Implement rate limiting on push endpoints

---

## 9. Success Criteria

### 9.1 Phase 1 Success Criteria

- [ ] Mobile users see mobile-specific notification information
- [ ] PWA install prompt appears for eligible mobile users
- [ ] Settings UI correctly shows mobile browser compatibility
- [ ] Notification click focuses the application window
- [ ] All existing notification tests pass
- [ ] New mobile notification tests pass

### 9.2 Phase 2 Success Criteria

- [ ] Users can subscribe to push notifications
- [ ] Push notifications delivered when browser is closed
- [ ] Push subscription persists across sessions
- [ ] Unsubscribe removes subscription completely
- [ ] Push notifications work on both desktop and mobile
- [ ] Backend correctly triggers push on task completion
- [ ] All push notification tests pass

### 9.3 Phase 3 Success Criteria

- [ ] 100% test coverage for notification settings UI
- [ ] All mobile emulation tests pass
- [ ] All permission flow tests pass
- [ ] Tests run successfully with 4 parallel workers
- [ ] No flaky tests
- [ ] Test execution completes within reasonable time

---

## Appendix A: Translation Strings

### English (`src/i18n/locales/en/settings.json`)

```json
{
  "notifications": {
    "title": "Notifications",
    "description": "Get notified when Claude, Cursor, or Codex finishes processing your request.",
    "mobile": {
      "title": "Mobile Notifications",
      "description": "Receive notifications on your mobile device.",
      "pwaRequired": "For the best mobile notification experience, add this app to your home screen.",
      "iosInstructions": "Tap the Share button, then 'Add to Home Screen'",
      "androidInstructions": "Tap the menu button, then 'Install app' or 'Add to Home Screen'",
      "iosVersionRequired": "iOS 16.4 or later required for notifications",
      "browserNotSupported": "Your mobile browser does not support notifications"
    },
    "push": {
      "title": "Push Notifications",
      "description": "Receive notifications even when the browser is closed.",
      "enable": "Enable Push Notifications",
      "subscribed": "Push notifications are active",
      "notSubscribed": "Push notifications are not active",
      "subscribe": "Subscribe",
      "unsubscribe": "Unsubscribe",
      "testButton": "Send Test Push",
      "subscriptionError": "Failed to subscribe to push notifications"
    }
  }
}
```

### Chinese (`src/i18n/locales/zh-CN/settings.json`)

```json
{
  "notifications": {
    "title": "通知",
    "description": "当 Claude、Cursor 或 Codex 完成处理您的请求时获得通知。",
    "mobile": {
      "title": "移动端通知",
      "description": "在您的移动设备上接收通知。",
      "pwaRequired": "为获得最佳移动端通知体验，请将此应用添加到主屏幕。",
      "iosInstructions": "点击分享按钮，然后选择"添加到主屏幕"",
      "androidInstructions": "点击菜单按钮，然后选择"安装应用"或"添加到主屏幕"",
      "iosVersionRequired": "需要 iOS 16.4 或更高版本才能使用通知功能",
      "browserNotSupported": "您的移动浏览器不支持通知功能"
    },
    "push": {
      "title": "推送通知",
      "description": "即使浏览器关闭也能接收通知。",
      "enable": "启用推送通知",
      "subscribed": "推送通知已激活",
      "notSubscribed": "推送通知未激活",
      "subscribe": "订阅",
      "unsubscribe": "取消订阅",
      "testButton": "发送测试推送",
      "subscriptionError": "订阅推送通知失败"
    }
  }
}
```

---

## Appendix B: API Specifications

### POST /api/push/subscribe

**Request:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0Q...",
      "auth": "tBHItJI5svbpez7KI4CCXg=="
    }
  },
  "deviceInfo": {
    "userAgent": "Mozilla/5.0...",
    "platform": "Android"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription created successfully"
}
```

### DELETE /api/push/unsubscribe

**Request:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription removed successfully"
}
```

### GET /api/push/status

**Response:**
```json
{
  "isSubscribed": true,
  "subscriptionCount": 2,
  "devices": [
    {
      "id": 1,
      "platform": "Android",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### GET /api/push/vapid-public-key

**Response:**
```json
{
  "publicKey": "BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE"
}
```

---

## Appendix C: Service Worker Code Examples

### Push Event Handler

```javascript
// public/sw.js

self.addEventListener('push', event => {
  if (!event.data) {
    console.log('[SW] Push event but no data');
    return;
  }

  try {
    const data = event.data.json();

    const options = {
      body: data.body || 'Task completed',
      icon: data.icon || '/icons/claude-ai-icon.svg',
      badge: '/icons/icon-128x128.png',
      tag: data.tag || 'claude-notification',
      requireInteraction: false,
      data: {
        url: data.url || '/',
        sessionId: data.sessionId,
        projectId: data.projectId
      },
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Claude Code', options)
    );
  } catch (error) {
    console.error('[SW] Error handling push:', error);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Check if already open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (url !== '/') {
              client.navigate(url);
            }
            return;
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

self.addEventListener('notificationclose', event => {
  console.log('[SW] Notification closed:', event.notification.tag);
});
```

---

## Appendix D: Mobile Detection Implementation

```javascript
// src/utils/mobileDetection.js

/**
 * Check if the device is mobile
 * @returns {boolean}
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Check if the device is iOS
 * @returns {boolean}
 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Check if the device is Android
 * @returns {boolean}
 */
export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

/**
 * Check if running as a PWA (standalone mode)
 * @returns {boolean}
 */
export function isPWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Check if the browser supports push notifications
 * @returns {boolean}
 */
export function supportsPushNotifications() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get iOS version number
 * @returns {number|null}
 */
export function getIOSVersion() {
  if (!isIOS()) return null;
  const match = navigator.userAgent.match(/OS (\d+)_/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check if iOS version supports notifications (16.4+)
 * @returns {boolean}
 */
export function iosSupportsNotifications() {
  const version = getIOSVersion();
  return version !== null && version >= 16;
}

/**
 * Check if the app can be installed as PWA
 * @returns {boolean}
 */
export function canInstallPWA() {
  // Check for beforeinstallprompt support or iOS
  return !isPWA() && (isIOS() || 'BeforeInstallPromptEvent' in window);
}

/**
 * Get device information for push subscription
 * @returns {object}
 */
export function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    isMobile: isMobile(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isPWA: isPWA(),
    language: navigator.language
  };
}
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-29*
*Author: Claude Code AI Assistant*
