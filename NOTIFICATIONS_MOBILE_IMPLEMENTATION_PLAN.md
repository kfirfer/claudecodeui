# Mobile Browser Notifications Implementation Plan

## Validation Status

**Last Validated**: 2026-01-29
**Validated Against Codebase**: Yes ✓

### Key Findings from Validation:
1. ✅ Current `useNotifications.js` uses `new Notification()` constructor (line 150)
2. ✅ Current `NotificationSettings.jsx` uses `new Notification()` directly in test button (line 51)
3. ✅ Current `main.jsx` unregisters ALL service workers (lines 11-20)
4. ✅ Current i18n key is `toggles.enableDesktop` (not `toggles.enable`)
5. ✅ Tests reference "Desktop Notifications" heading (lines 278, 507, 515, 526)
6. ✅ `src/services/` directory does not exist (will be created)
7. ✅ ChatInterface uses `sendNotificationRef` pattern for notifications

---

## Executive Summary

This plan details the implementation of unified browser notifications that work consistently across desktop and mobile browsers. The current implementation uses the native `new Notification()` constructor which works on desktop browsers but fails silently on mobile browsers (especially Safari). The solution involves using `ServiceWorkerRegistration.showNotification()` as the primary notification method, which is the universal standard supported by all modern browsers.

**Key Insight**: The native `new Notification()` constructor does NOT work on Safari (desktop or mobile). `ServiceWorkerRegistration.showNotification()` is required for cross-platform compatibility.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Technical Requirements](#technical-requirements)
3. [Architecture Design](#architecture-design)
4. [Implementation Phases](#implementation-phases)
5. [File Changes Summary](#file-changes-summary)
6. [Testing Strategy](#testing-strategy)
7. [Platform Compatibility Matrix](#platform-compatibility-matrix)
8. [Risks and Mitigations](#risks-and-mitigations)

---

## Current State Analysis

### Existing Implementation

| File | Purpose | Current Status | Changes Needed |
|------|---------|----------------|----------------|
| `src/hooks/useNotifications.js` | Core notification hook | Uses `new Notification()` at line 150 | Add SW registration, update sendNotification |
| `src/contexts/NotificationContext.jsx` | React context provider | Simple pass-through | No changes needed |
| `src/components/settings/NotificationSettings.jsx` | Settings UI | Uses `new Notification()` at line 51 for test | Update test button + mobile guidance UI |
| `src/utils/notificationContent.js` | Notification content formatting | Formats title/body/tag | No changes needed |
| `src/i18n/locales/en/settings.json` | English translations | Uses `enableDesktop` key | Rename key, add mobile strings |
| `src/i18n/locales/zh-CN/settings.json` | Chinese translations | Uses `enableDesktop` key | Rename key, add mobile strings |
| `public/sw.js` | Existing service worker (caching) | Caching only, no notifications | Keep separate (no changes) |
| `public/manifest.json` | PWA manifest | Already configured correctly | No changes needed |
| `src/main.jsx` | App entry point | Unregisters ALL SWs (lines 11-20) | Filter to preserve notification SW |
| `tests/notifications.spec.js` | Playwright tests | Checks "Desktop Notifications" heading | Update heading assertions |

### Current Notification Flow

```
User enables notifications
        |
        v
requestPermission() called
        |
        v
new Notification() created  <-- FAILS on mobile/Safari
        |
        v
Notification displayed (desktop only)
```

### Problems with Current Implementation

1. **`new Notification()` not supported on Safari** (desktop and mobile)
2. **Mobile Chrome requires Service Worker** for notifications to work properly
3. **iOS Safari** requires the app to be "Added to Home Screen" for notifications
4. **No fallback mechanism** for unsupported scenarios
5. **UI labels mention "Desktop"** which confuses mobile users

---

## Technical Requirements

### Browser API Requirements

| Requirement | Desktop Chrome | Desktop Safari | Mobile Chrome | iOS Safari |
|-------------|----------------|----------------|---------------|------------|
| `Notification.requestPermission()` | Yes | Yes | Yes | Yes (with restrictions) |
| `new Notification()` | Yes | **NO** | Limited | **NO** |
| `ServiceWorkerRegistration.showNotification()` | Yes | Yes | Yes | Yes |
| Requires Service Worker | No | **YES** | **YES** | **YES** |
| Requires Add to Home Screen | No | No | No | **YES** |

### Key Technical Decisions

1. **Use `ServiceWorkerRegistration.showNotification()`** as the primary method
2. **Create a dedicated notification service worker** separate from caching
3. **Separate notification SW** - keep `notification-sw.js` separate from existing `sw.js` (caching)
4. **Conditional SW registration** - only when notifications are enabled
5. **Platform detection** - show appropriate guidance per platform
6. **Graceful degradation** - clear messaging when not supported

---

## Architecture Design

### New Notification Flow

```
User enables notifications
        |
        v
requestPermission() called
        |
        v
Register notification Service Worker
        |
        v
navigator.serviceWorker.ready
        |
        v
registration.showNotification()  <-- Works on ALL browsers
        |
        v
SW handles notificationclick event
        |
        v
Notification displayed + interaction handled
```

### Component Architecture

```
src/
├── hooks/
│   └── useNotifications.js          # Updated - uses SW-based notifications
├── services/
│   └── browserNotificationService.js # NEW - SW registration & notification logic
├── contexts/
│   └── NotificationContext.jsx       # Unchanged
├── components/
│   └── settings/
│       └── NotificationSettings.jsx  # Updated - "Browser Notifications" + mobile UI
├── utils/
│   ├── notificationContent.js        # Unchanged
│   └── platformDetection.js          # NEW - device/browser detection
└── i18n/
    └── locales/
        ├── en/settings.json          # Updated strings
        └── zh-CN/settings.json       # Updated strings

public/
└── notification-sw.js                # NEW - dedicated notification SW
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
**Goal**: Create the foundational service worker and notification service

#### [✅ COMPLETE] Task 1.1: Create Notification Service Worker
**File**: `public/notification-sw.js`

**Description**: Create a minimal service worker dedicated to handling notifications. This SW only handles notification events, not caching.

**Subtasks**:
- [ ] 1.1.1: Create `notification-sw.js` file in public directory
- [ ] 1.1.2: Implement `notificationclick` event handler
- [ ] 1.1.3: Implement `notificationclose` event handler
- [ ] 1.1.4: Add message passing for SW state communication
- [ ] 1.1.5: Add version management for SW updates

**Code Structure**:
```javascript
// notification-sw.js
const SW_VERSION = '1.0.0';

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/');
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // Optional: Analytics or cleanup
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: SW_VERSION });
  }
});
```

---

#### [✅ COMPLETE] Task 1.2: Create Browser Notification Service
**File**: `src/services/browserNotificationService.js`

**Note**: The `src/services/` directory does not exist and will be created.

**Description**: Create a service module that handles Service Worker registration and provides a unified API for sending notifications across all browsers.

**Subtasks**:
- [ ] 1.2.1: Create service file with class structure
- [ ] 1.2.2: Implement SW registration logic
- [ ] 1.2.3: Implement `showNotification()` method using SW
- [ ] 1.2.4: Implement permission request handling
- [ ] 1.2.5: Add support detection methods
- [ ] 1.2.6: Implement cleanup/unregister methods
- [ ] 1.2.7: Add error handling and logging

**Code Structure**:
```javascript
// browserNotificationService.js

class BrowserNotificationService {
  constructor() {
    this.registration = null;
    this.isRegistering = false;
  }

  // Check if browser supports SW-based notifications
  static isSupported() {
    return 'serviceWorker' in navigator &&
           'Notification' in window &&
           'showNotification' in ServiceWorkerRegistration.prototype;
  }

  // Check if we can use the legacy Notification constructor
  static canUseLegacyNotification() {
    // Safari doesn't support new Notification()
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    return 'Notification' in window && !isSafari;
  }

  // Register the notification service worker
  async register() {
    if (this.registration) return this.registration;
    if (this.isRegistering) return this.waitForRegistration();

    this.isRegistering = true;

    try {
      this.registration = await navigator.serviceWorker.register(
        '/notification-sw.js',
        { scope: '/' }
      );

      // Wait for the SW to be ready
      await navigator.serviceWorker.ready;

      return this.registration;
    } catch (error) {
      console.error('[NotificationService] Failed to register SW:', error);
      throw error;
    } finally {
      this.isRegistering = false;
    }
  }

  // Send notification using Service Worker
  async showNotification(title, options = {}) {
    if (!this.registration) {
      await this.register();
    }

    const notificationOptions = {
      icon: '/icons/claude-ai-icon.svg',
      badge: '/icons/icon-128x128.png',
      tag: options.tag || 'default',
      requireInteraction: false,
      ...options
    };

    return this.registration.showNotification(title, notificationOptions);
  }

  // Unregister the service worker
  async unregister() {
    if (this.registration) {
      await this.registration.unregister();
      this.registration = null;
    }
  }
}

export const notificationService = new BrowserNotificationService();
export default BrowserNotificationService;
```

---

#### [✅ COMPLETE] Task 1.3: Create Platform Detection Utility
**File**: `src/utils/platformDetection.js`

**Description**: Create utility functions to detect the user's platform, browser, and notification capabilities for showing appropriate UI guidance.

**Subtasks**:
- [ ] 1.3.1: Implement mobile device detection
- [ ] 1.3.2: Implement browser detection (Chrome, Safari, Firefox, etc.)
- [ ] 1.3.3: Implement iOS detection
- [ ] 1.3.4: Implement PWA/standalone mode detection
- [ ] 1.3.5: Create capability summary function

**Code Structure**:
```javascript
// platformDetection.js

export const detectPlatform = () => {
  const ua = navigator.userAgent;

  return {
    // Device type
    isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    isAndroid: /Android/i.test(ua),

    // Browser
    isChrome: /Chrome/i.test(ua) && !/Edge|Edg/i.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
    isFirefox: /Firefox/i.test(ua),
    isEdge: /Edge|Edg/i.test(ua),

    // PWA mode
    isPWA: window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true,

    // Feature support
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotificationAPI: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
  };
};

export const getNotificationSupport = () => {
  const platform = detectPlatform();

  // iOS Safari requires PWA mode for notifications
  if (platform.isIOS && platform.isSafari && !platform.isPWA) {
    return {
      supported: false,
      reason: 'ios-safari-requires-pwa',
      message: 'Add this app to your Home Screen to enable notifications'
    };
  }

  // Check for basic requirements
  if (!platform.hasServiceWorker || !platform.hasNotificationAPI) {
    return {
      supported: false,
      reason: 'browser-not-supported',
      message: 'Your browser does not support notifications'
    };
  }

  return {
    supported: true,
    reason: null,
    message: null
  };
};
```

---

### Phase 2: Hook and Context Updates
**Goal**: Update the notification hook to use the new service

#### [✅ COMPLETE] Task 2.1: Update useNotifications Hook
**File**: `src/hooks/useNotifications.js`

**Description**: Refactor the hook to use `browserNotificationService` for sending notifications via Service Worker while maintaining backward compatibility.

**Subtasks**:
- [ ] 2.1.1: Import the notification service and platform detection
- [ ] 2.1.2: Add Service Worker registration on enable
- [ ] 2.1.3: Update `sendNotification` to use SW-based method
- [ ] 2.1.4: Add fallback to legacy `new Notification()` where supported
- [ ] 2.1.5: Add platform capability state
- [ ] 2.1.6: Add SW registration status tracking
- [ ] 2.1.7: Handle SW registration errors gracefully
- [ ] 2.1.8: Update cleanup logic for SW unregistration

**Key Changes**:
```javascript
// Updated useNotifications.js structure

import { notificationService } from '../services/browserNotificationService';
import { getNotificationSupport, detectPlatform } from '../utils/platformDetection';

export const useNotifications = () => {
  // ... existing state ...

  const [swRegistered, setSwRegistered] = useState(false);
  const [platformSupport, setPlatformSupport] = useState(null);

  // Check platform support on mount
  useEffect(() => {
    setPlatformSupport(getNotificationSupport());
  }, []);

  // Register SW when notifications are enabled
  useEffect(() => {
    if (settings.enabled && permission === 'granted') {
      notificationService.register()
        .then(() => setSwRegistered(true))
        .catch(() => setSwRegistered(false));
    }
  }, [settings.enabled, permission]);

  // Updated sendNotification function
  const sendNotification = useCallback(async (title, options = {}) => {
    // ... validation checks ...

    try {
      // Use SW-based notification (works on all browsers)
      if (swRegistered) {
        await notificationService.showNotification(title, options);
        console.log('[Notifications] Notification sent via SW:', title);
        return true;
      }

      // Fallback to legacy Notification (only for non-Safari desktop)
      if (BrowserNotificationService.canUseLegacyNotification()) {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        console.log('[Notifications] Notification sent via legacy API:', title);
        return notification;
      }

      console.warn('[Notifications] No notification method available');
      return null;
    } catch (error) {
      console.error('[Notifications] Failed to send notification:', error);
      return null;
    }
  }, [swRegistered, permission, settings]);

  return {
    // ... existing returns ...
    swRegistered,
    platformSupport,
  };
};
```

---

### Phase 3: UI Updates
**Goal**: Update the settings UI to support "Browser Notifications" naming and add mobile-specific guidance

#### [✅ COMPLETE] Task 3.1: Update NotificationSettings Component
**File**: `src/components/settings/NotificationSettings.jsx`

**Description**: Rename from "Desktop Notifications" to "Browser Notifications" and add platform-specific guidance for mobile users.

**Subtasks**:
- [ ] 3.1.1: Update section title from "Desktop" to "Browser"
- [ ] 3.1.2: Add platform detection display
- [ ] 3.1.3: Add iOS Safari "Add to Home Screen" instructions
- [ ] 3.1.4: Add mobile browser capability indicators
- [ ] 3.1.5: Update toggle labels (change `toggles.enableDesktop` to `toggles.enable` in component)
- [ ] 3.1.6: Add Service Worker registration status indicator
- [ ] 3.1.7: Update `handleTestNotification()` to use SW-based `notificationService.showNotification()` instead of `new Notification()`
- [ ] 3.1.8: Add troubleshooting section for common issues

**New UI Elements**:
```jsx
// Platform-specific guidance component
const PlatformGuidance = ({ platform, platformSupport }) => {
  if (!platformSupport.supported) {
    if (platformSupport.reason === 'ios-safari-requires-pwa') {
      return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800 dark:text-blue-200">
                {t('notifications.mobile.iosSetupTitle')}
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {t('notifications.mobile.iosSetupDescription')}
              </p>
              <ol className="text-sm text-blue-700 dark:text-blue-300 mt-2 list-decimal list-inside space-y-1">
                <li>{t('notifications.mobile.iosStep1')}</li>
                <li>{t('notifications.mobile.iosStep2')}</li>
                <li>{t('notifications.mobile.iosStep3')}</li>
              </ol>
            </div>
          </div>
        </div>
      );
    }
  }

  return null;
};
```

---

#### [✅ COMPLETE] Task 3.2: Update i18n Translations (English)
**File**: `src/i18n/locales/en/settings.json`

**Description**: Update notification-related translation strings to use "Browser Notifications" instead of "Desktop Notifications" and add mobile-specific strings.

**Subtasks**:
- [ ] 3.2.1: Rename "Desktop Notifications" to "Browser Notifications" (key: `notifications.title`)
- [ ] 3.2.2: Update description text (key: `notifications.description`)
- [ ] 3.2.3: Rename `toggles.enableDesktop` to `toggles.enable`
- [ ] 3.2.4: Add iOS Safari setup instructions (new keys under `notifications.mobile.*`)
- [ ] 3.2.5: Add mobile browser guidance strings
- [ ] 3.2.6: Add Service Worker status strings (new keys under `notifications.status.*`)
- [ ] 3.2.7: Add troubleshooting strings (new keys under `notifications.troubleshooting.*`)

**Current Keys (for reference)**:
- `toggles.enableDesktop` → will be renamed to `toggles.enable`

**Updated Strings**:
```json
{
  "notifications": {
    "title": "Browser Notifications",
    "description": "Get notified on any device when Claude, Cursor, or Codex finishes processing your request.",
    "permissionStatus": "Permission Status",
    "permissionGranted": "Granted",
    "permissionDenied": "Denied",
    "permissionDefault": "Not Set",
    "enableNotifications": "Enable Notifications",
    "notificationsBlocked": "Notifications are blocked. Please enable them in your browser settings.",
    "browserNotSupported": "Your browser does not support browser notifications.",
    "toggles": {
      "enable": "Enable browser notifications",
      "onlyWhenUnfocused": "Only notify when tab is unfocused",
      "onlyWhenUnfocusedDescription": "Only show notifications when the browser tab is not active",
      "playSound": "Play notification sound"
    },
    "testButton": "Send Test Notification",
    "testTitle": "Test Notification",
    "testBody": "Browser notifications are working correctly!",
    "mobile": {
      "title": "Mobile Notifications",
      "iosSetupTitle": "iOS Safari Setup Required",
      "iosSetupDescription": "To receive notifications on iOS Safari, add this app to your Home Screen:",
      "iosStep1": "Tap the Share button in Safari",
      "iosStep2": "Select 'Add to Home Screen'",
      "iosStep3": "Open the app from your Home Screen and enable notifications",
      "androidInfo": "Android Chrome supports notifications in the browser.",
      "mobileInfo": "Mobile browser notifications work best when the app is added to your home screen."
    },
    "status": {
      "swRegistered": "Service Worker registered",
      "swNotRegistered": "Service Worker not registered",
      "swRegistering": "Registering Service Worker...",
      "ready": "Ready to receive notifications",
      "notReady": "Not ready - enable notifications to set up"
    },
    "troubleshooting": {
      "title": "Troubleshooting",
      "checkPermissions": "Check that notifications are allowed in browser settings",
      "clearCache": "Try clearing browser cache and reloading",
      "reopenApp": "Close and reopen the app",
      "checkPWA": "For iOS, ensure the app is opened from the Home Screen"
    }
  }
}
```

---

#### [✅ COMPLETE] Task 3.3: Update i18n Translations (Chinese)
**File**: `src/i18n/locales/zh-CN/settings.json`

**Description**: Add corresponding Chinese translations for all new notification strings.

**Subtasks**:
- [ ] 3.3.1: Translate "Browser Notifications" title and description (update `notifications.title` and `notifications.description`)
- [ ] 3.3.2: Rename `toggles.enableDesktop` to `toggles.enable` with translation "启用浏览器通知"
- [ ] 3.3.3: Translate iOS Safari setup instructions
- [ ] 3.3.4: Translate mobile browser guidance
- [ ] 3.3.5: Translate status messages
- [ ] 3.3.6: Translate troubleshooting strings

---

### Phase 4: Integration
**Goal**: Update main.jsx to handle SW registration properly and ensure ChatInterface uses the new system

#### [✅ COMPLETE] Task 4.1: Update main.jsx Service Worker Handling
**File**: `src/main.jsx`

**Description**: Modify the current SW unregistration logic to preserve the notification SW while still clearing stale caching SWs.

**Subtasks**:
- [ ] 4.1.1: Keep notification SW registration logic separate
- [ ] 4.1.2: Only unregister caching SWs, not notification SW
- [ ] 4.1.3: Add SW scope filtering for selective unregistration

**Updated Logic**:
```javascript
// main.jsx - Updated SW handling

// Clean up stale caching service workers, but preserve notification SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      // Only unregister the caching SW (sw.js), not notification-sw.js
      if (registration.active?.scriptURL.includes('sw.js') &&
          !registration.active?.scriptURL.includes('notification-sw.js')) {
        registration.unregister();
      }
    });
  }).catch(err => {
    console.warn('Failed to manage service workers:', err);
  });
}
```

---

#### [✅ COMPLETE] Task 4.2: Verify ChatInterface Integration
**File**: `src/components/ChatInterface.jsx`

**Description**: Verify that the ChatInterface correctly uses the updated notification system. No major changes expected as it uses the context.

**Current Implementation Details**:
- ChatInterface uses `sendNotificationRef` pattern (useRef) to always have latest sendNotification function
- Notifications are triggered at lines: 3437, 3536, 4212 (fire-and-forget, no await needed)
- ChatInterface does NOT await sendNotification results, so async change is backward compatible
- No changes required to ChatInterface if useNotifications hook maintains same API

**Subtasks**:
- [ ] 4.2.1: Review sendNotification usage in ChatInterface (uses ref pattern at line 1957-1963)
- [ ] 4.2.2: Verify notification content formatting still works (uses `getNotificationContent` from utils)
- [ ] 4.2.3: Test claude-complete, cursor-complete, codex-complete handlers
- [ ] 4.2.4: Verify async/await compatibility (sendNotification will become async with SW)

---

### Phase 5: Testing
**Goal**: Comprehensive testing of the notification system across platforms

#### [✅ COMPLETE] Task 5.1: Update Existing Notification Tests
**File**: `tests/notifications.spec.js`

**Description**: Update the existing Playwright tests to work with the new SW-based notification system.

**Subtasks**:
- [ ] 5.1.1: Update test setup to handle SW registration
- [ ] 5.1.2: Update console log patterns for SW notifications (currently checks for `[Notifications] Notification sent`)
- [ ] 5.1.3: Update heading assertions from "Desktop Notifications" to "Browser Notifications" (lines 278, 507, 515, 526)
- [ ] 5.1.4: Add SW registration verification tests
- [ ] 5.1.5: Update permission flow tests

---

#### [ ] Task 5.2: Add Mobile Browser Tests
**File**: `tests/notifications.spec.js`

**Description**: Add new tests specifically for mobile browser notification behavior using Playwright's mobile emulation.

**Subtasks**:
- [ ] 5.2.1: Add mobile Chrome viewport tests
- [ ] 5.2.2: Add mobile Safari viewport tests (limited, as Safari has restrictions)
- [ ] 5.2.3: Add platform detection accuracy tests
- [ ] 5.2.4: Add iOS guidance display tests
- [ ] 5.2.5: Add SW registration on mobile tests

**Test Structure**:
```javascript
test.describe('Mobile Browser Notifications', () => {
  test.use({
    viewport: { width: 375, height: 812 }, // iPhone X dimensions
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)...'
  });

  test('should show iOS Safari setup instructions', async ({ page }) => {
    // Test iOS Safari guidance appears
  });

  test('should register SW on mobile Chrome', async ({ page }) => {
    // Test SW registration works on mobile
  });
});
```

---

#### [ ] Task 5.3: Add Service Worker Tests
**File**: `tests/notifications.spec.js`

**Description**: Add tests for Service Worker registration, notification sending, and click handling.

**Subtasks**:
- [ ] 5.3.1: Test SW registration success
- [ ] 5.3.2: Test SW registration failure handling
- [ ] 5.3.3: Test notification sending via SW
- [ ] 5.3.4: Test notification click handler (window focus)
- [ ] 5.3.5: Test SW unregistration on disable

---

#### [ ] Task 5.4: Add Platform Detection Tests
**File**: `tests/notifications.spec.js`

**Description**: Add tests to verify platform detection accuracy.

**Subtasks**:
- [ ] 5.4.1: Test iOS detection
- [ ] 5.4.2: Test Android detection
- [ ] 5.4.3: Test Chrome detection
- [ ] 5.4.4: Test Safari detection
- [ ] 5.4.5: Test PWA mode detection
- [ ] 5.4.6: Test capability determination

---

#### [ ] Task 5.5: Manual Testing Checklist
**Description**: Manual testing steps for real devices.

**Checklist**:
- [ ] 5.5.1: Test on Chrome desktop (Windows)
- [ ] 5.5.2: Test on Chrome desktop (macOS)
- [ ] 5.5.3: Test on Safari desktop (macOS)
- [ ] 5.5.4: Test on Firefox desktop
- [ ] 5.5.5: Test on Chrome mobile (Android)
- [ ] 5.5.6: Test on Safari mobile (iOS) - Add to Home Screen flow
- [ ] 5.5.7: Test on Chrome mobile (iOS)
- [ ] 5.5.8: Verify notification click focuses app
- [ ] 5.5.9: Verify "only when unfocused" works on mobile
- [ ] 5.5.10: Verify sound toggle works

---

### Phase 6: Documentation and Cleanup
**Goal**: Document the changes and clean up any temporary code

#### [ ] Task 6.1: Add Inline Documentation
**Description**: Ensure all new code is well-documented with JSDoc comments.

**Subtasks**:
- [ ] 6.1.1: Document browserNotificationService.js
- [ ] 6.1.2: Document platformDetection.js
- [ ] 6.1.3: Document notification-sw.js
- [ ] 6.1.4: Update useNotifications.js documentation

---

#### [ ] Task 6.2: Update CLAUDE.md if Needed
**File**: `CLAUDE.md`

**Description**: Update project documentation if the notification architecture changes warrant it.

**Subtasks**:
- [ ] 6.2.1: Review if architecture section needs updates
- [ ] 6.2.2: Add notes about notification SW if relevant

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `public/notification-sw.js` | **CREATE** | Dedicated notification service worker |
| `src/services/` | **CREATE DIR** | New directory for services (does not exist) |
| `src/services/browserNotificationService.js` | **CREATE** | SW registration and notification service |
| `src/utils/platformDetection.js` | **CREATE** | Device/browser detection utilities |
| `src/hooks/useNotifications.js` | **MODIFY** | Use SW-based notifications |
| `src/components/settings/NotificationSettings.jsx` | **MODIFY** | Rename to "Browser", add mobile guidance, update test button |
| `src/i18n/locales/en/settings.json` | **MODIFY** | Update notification strings, rename `enableDesktop` → `enable` |
| `src/i18n/locales/zh-CN/settings.json` | **MODIFY** | Update Chinese translations, rename key |
| `src/main.jsx` | **MODIFY** | Selective SW unregistration (preserve notification-sw.js) |
| `tests/notifications.spec.js` | **MODIFY** | Update heading assertions, add mobile and SW tests |

---

## Testing Strategy

### Test Categories

1. **Unit Tests** (if applicable)
   - Platform detection functions
   - Notification content formatting

2. **Integration Tests** (Playwright)
   - Settings UI displays correctly
   - Permission flow works
   - Toggle states persist
   - SW registration succeeds
   - Notifications trigger on completion

3. **Cross-Platform Tests** (Playwright + Manual)
   - Desktop Chrome
   - Desktop Safari
   - Desktop Firefox
   - Mobile Chrome (emulated)
   - Mobile Safari (manual only)

4. **E2E Flow Tests**
   - Enable notifications -> Create project -> Send prompt -> Receive notification
   - Same flow on mobile viewport

### Test Execution Commands

```bash
# Run all tests
npm run test:e2e

# Run notification tests only
npx playwright test notifications.spec.js

# Run with specific browser
npx playwright test notifications.spec.js --project=chromium

# Run mobile tests only
npx playwright test notifications.spec.js -g "Mobile"
```

---

## Platform Compatibility Matrix

| Platform | Browser | Notification Method | Works? | Notes |
|----------|---------|---------------------|--------|-------|
| Desktop | Chrome | SW or Legacy | Yes | Full support |
| Desktop | Safari | SW only | Yes | Legacy API not supported |
| Desktop | Firefox | SW or Legacy | Yes | Full support |
| Desktop | Edge | SW or Legacy | Yes | Full support |
| Android | Chrome | SW | Yes | Requires SW registration |
| Android | Firefox | SW | Yes | Requires SW registration |
| iOS | Safari (browser) | N/A | **No** | Must use PWA mode |
| iOS | Safari (PWA) | SW | Yes | After Add to Home Screen |
| iOS | Chrome | N/A | **No** | Uses Safari engine (WebKit) |

---

## Risks and Mitigations

### Risk 1: iOS Safari Requires PWA Mode
**Risk**: Users on iOS Safari won't receive notifications in the browser.
**Mitigation**: Clear UI guidance with step-by-step "Add to Home Screen" instructions.

### Risk 2: Service Worker Registration Failures
**Risk**: SW registration may fail due to HTTPS requirements or browser restrictions.
**Mitigation**:
- Graceful error handling with fallback to legacy API where possible
- Clear error messaging to users
- Logging for debugging

### Risk 3: Notification Permission Denied
**Risk**: Users may have denied notification permission previously.
**Mitigation**:
- Clear instructions on how to re-enable in browser settings
- Troubleshooting section in settings

### Risk 4: Breaking Existing Desktop Notifications
**Risk**: Changes might break notifications for desktop users.
**Mitigation**:
- Maintain backward compatibility with legacy API for supported browsers
- Comprehensive testing on all desktop browsers
- Gradual rollout with feature flag if needed

### Risk 5: Service Worker Cache Conflicts
**Risk**: The notification SW might conflict with the existing caching SW.
**Mitigation**:
- Keep notification SW completely separate (different file, different purpose)
- Use specific SW scope
- Test SW coexistence thoroughly

---

## Dependencies

### External Dependencies
- None (uses standard Web APIs)

### Internal Dependencies
- `NotificationContext` (existing)
- `useNotifications` hook (existing, will be modified)
- i18n system (existing)

### Browser API Dependencies
- Service Worker API
- Notification API
- PushManager API (for capability detection only)

---

## Rollback Plan

If critical issues are discovered post-implementation:

1. **Quick Rollback**: Revert to using `new Notification()` only by changing a flag in `browserNotificationService.js`
2. **Full Rollback**: Revert the PR/commit containing these changes
3. **Partial Rollback**: Keep SW registration but disable for specific platforms via platform detection

---

## Success Criteria

1. **Desktop browsers**: Notifications work as before (no regression)
2. **Mobile Chrome (Android)**: Notifications work in browser
3. **iOS Safari (PWA)**: Notifications work after Add to Home Screen
4. **iOS Safari (browser)**: Clear guidance shown to user
5. **All tests pass**: Existing and new tests green
6. **No console errors**: Clean console in production
7. **Settings UI**: Clearly shows "Browser Notifications" with platform-appropriate guidance

---

## Implementation Timeline (Suggested)

| Phase | Tasks | Priority |
|-------|-------|----------|
| Phase 1 | Core Infrastructure | High |
| Phase 2 | Hook Updates | High |
| Phase 3 | UI Updates | Medium |
| Phase 4 | Integration | High |
| Phase 5 | Testing | High |
| Phase 6 | Documentation | Low |

---

## Appendix A: Service Worker Notification Options

Full options available for `registration.showNotification()`:

```javascript
{
  // Basic options
  body: 'Notification body text',
  icon: '/path/to/icon.png',
  badge: '/path/to/badge.png', // Small monochrome icon
  image: '/path/to/image.png', // Large image in notification

  // Behavior
  tag: 'unique-tag', // Replace notifications with same tag
  renotify: false, // Re-alert for replaced notifications
  requireInteraction: false, // Keep notification visible until dismissed
  silent: false, // Suppress vibration and sound

  // Timing
  timestamp: Date.now(), // When the event occurred

  // Actions (max 2 on most platforms)
  actions: [
    { action: 'view', title: 'View', icon: '/icons/view.png' },
    { action: 'dismiss', title: 'Dismiss', icon: '/icons/dismiss.png' }
  ],

  // Data
  data: { /* arbitrary data accessible in notificationclick */ },

  // Mobile specific
  vibrate: [200, 100, 200], // Vibration pattern

  // Direction
  dir: 'auto', // 'ltr', 'rtl', 'auto'
  lang: 'en-US'
}
```

---

## Appendix B: Browser Notification Permission States

| State | Description | Can Request? |
|-------|-------------|--------------|
| `default` | User hasn't decided yet | Yes |
| `granted` | User allowed notifications | No (already granted) |
| `denied` | User blocked notifications | No (must change in settings) |

---

## Appendix C: Debugging Tips

### Check SW Registration
```javascript
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Registered SWs:', regs);
  regs.forEach(reg => {
    console.log('  Scope:', reg.scope);
    console.log('  Active:', reg.active?.scriptURL);
  });
});
```

### Check Notification Permission
```javascript
console.log('Permission:', Notification.permission);
```

### Test SW Notification Manually
```javascript
navigator.serviceWorker.ready.then(reg => {
  reg.showNotification('Test', { body: 'Manual test' });
});
```

### Listen for SW Messages
```javascript
navigator.serviceWorker.addEventListener('message', event => {
  console.log('Message from SW:', event.data);
});
```
