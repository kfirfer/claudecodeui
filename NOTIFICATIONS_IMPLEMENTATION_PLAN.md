# Browser Notifications Implementation Plan

This document outlines a comprehensive implementation plan for adding browser notifications to Claude Code UI when Claude Code (or other AI agents) finishes working. The plan includes a settings toggle and E2E tests using Playwright.

---

## Table of Contents

1. [Overview](#overview)
2. [Technical Architecture](#technical-architecture)
3. [Phase 1: Core Notification Infrastructure](#phase-1-core-notification-infrastructure)
4. [Phase 2: Settings UI Integration](#phase-2-settings-ui-integration)
5. [Phase 3: Chat Completion Integration](#phase-3-chat-completion-integration)
6. [Phase 4: E2E Testing with Playwright](#phase-4-e2e-testing-with-playwright)
7. [Phase 5: Quality Assurance and Documentation](#phase-5-quality-assurance-and-documentation)
8. [File Structure](#file-structure)
9. [Dependencies and Prerequisites](#dependencies-and-prerequisites)
10. [Risk Mitigation](#risk-mitigation)

---

## Overview

### Objective
Implement browser notifications that alert users when Claude Code (or Cursor/Codex agents) completes a task, with configurable settings and comprehensive test coverage.

### Key Features
- Desktop browser notifications on task completion
- Toggle to enable/disable notifications in settings
- Option to notify only when browser tab is unfocused
- Optional sound notification
- Permission management with graceful degradation
- Full E2E test coverage with Playwright

### Success Criteria
- Notifications appear reliably when agents complete tasks
- Settings persist across sessions
- Works across major browsers (Chrome, Firefox, Safari, Edge)
- All E2E tests pass
- Meets accessibility standards
- Zero regressions in existing functionality

---

## Technical Architecture

### Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌────────────────────────────────────┐ │
│  │  Settings.jsx    │    │  NotificationContext (new)         │ │
│  │  - Toggle UI     │◄──►│  - useNotifications hook           │ │
│  │  - Permission UI │    │  - Permission state                │ │
│  └──────────────────┘    │  - sendNotification()              │ │
│                          └──────────────┬─────────────────────┘ │
│                                         │                        │
│  ┌──────────────────────────────────────▼───────────────────┐   │
│  │  ChatInterface.jsx                                        │   │
│  │  - claude-complete event handler (~line 3923)             │   │
│  │  - Triggers notification on completion                    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket
┌──────────────────────────────────────────────────────────────────┐
│                          Backend                                  │
├──────────────────────────────────────────────────────────────────┤
│  server/claude-sdk.js (line 633-640)                             │
│  - Emits 'claude-complete' event                                 │
│  - sessionId, exitCode, isNewSession                             │
└──────────────────────────────────────────────────────────────────┘
```

### Settings Data Structure

```javascript
// localStorage key: 'notification-settings'
{
  enabled: boolean,              // Master toggle for notifications
  soundEnabled: boolean,         // Play sound with notification
  onlyWhenUnfocused: boolean,    // Only notify when tab is not active
  permissionRequested: boolean,  // Track if we've asked for permission
  lastUpdated: string            // ISO timestamp
}
```

### Browser Notification API Usage

```javascript
// Permission states: 'default' | 'granted' | 'denied'
// API: new Notification(title, options)
// Options: { body, icon, tag, requireInteraction, silent }
```

---

## Phase 1: Core Notification Infrastructure

**Objective**: Create the foundational notification service layer

### Task 1.1: Create useNotifications Hook
**Status**: [ ]
**File**: `src/hooks/useNotifications.js`

#### Subtasks:
- [ ] 1.1.1 Create hook file with basic structure
- [ ] 1.1.2 Implement permission state management
- [ ] 1.1.3 Implement `requestPermission()` function
- [ ] 1.1.4 Implement `sendNotification()` function
- [ ] 1.1.5 Add document visibility tracking (`document.hidden`)
- [ ] 1.1.6 Add localStorage integration for settings
- [ ] 1.1.7 Add browser support detection

#### Implementation Details:

```javascript
// src/hooks/useNotifications.js
import { useState, useEffect, useCallback, useMemo } from 'react';

const NOTIFICATION_SETTINGS_KEY = 'notification-settings';

const defaultSettings = {
  enabled: false,
  soundEnabled: false,
  onlyWhenUnfocused: true,
  permissionRequested: false,
  lastUpdated: null
};

export const useNotifications = () => {
  const [permission, setPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);

  // Track document visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const isSupported = useMemo(() => {
    return typeof window !== 'undefined' && 'Notification' in window;
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return 'unsupported';

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setSettings(prev => ({
        ...prev,
        permissionRequested: true,
        lastUpdated: new Date().toISOString()
      }));
      return result;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }, [isSupported]);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString()
    }));
  }, []);

  const sendNotification = useCallback((title, options = {}) => {
    if (!isSupported || permission !== 'granted' || !settings.enabled) {
      return null;
    }

    // Respect "only when unfocused" setting
    if (settings.onlyWhenUnfocused && isTabVisible) {
      return null;
    }

    try {
      const notification = new Notification(title, {
        icon: '/icons/claude-ai-icon.svg',   // Use existing icon
        badge: '/icons/icon-128x128.png',    // Use existing badge icon
        tag: 'claude-complete',
        requireInteraction: false,
        silent: !settings.soundEnabled,
        ...options
      });

      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return notification;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return null;
    }
  }, [isSupported, permission, settings, isTabVisible]);

  return {
    // State
    permission,
    settings,
    isSupported,
    isTabVisible,

    // Actions
    requestPermission,
    updateSettings,
    sendNotification
  };
};

export default useNotifications;
```

---

### Task 1.2: Create NotificationContext Provider
**Status**: [ ]
**File**: `src/contexts/NotificationContext.jsx`

#### Subtasks:
- [ ] 1.2.1 Create context with createContext
- [ ] 1.2.2 Create NotificationProvider component
- [ ] 1.2.3 Export useNotificationContext hook
- [ ] 1.2.4 Add provider to App.jsx component tree

#### Implementation Details:

```javascript
// src/contexts/NotificationContext.jsx
import React, { createContext, useContext } from 'react';
import { useNotifications } from '../hooks/useNotifications';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const notifications = useNotifications();

  return (
    <NotificationContext.Provider value={notifications}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
};

export default NotificationContext;
```

---

### Task 1.3: Add NotificationProvider to App.jsx
**Status**: [ ]
**File**: `src/App.jsx`

#### Subtasks:
- [ ] 1.3.1 Import NotificationProvider
- [ ] 1.3.2 Wrap application with NotificationProvider
- [ ] 1.3.3 Ensure proper provider nesting order

#### Implementation Details:

**IMPORTANT**: The actual App.jsx provider hierarchy (lines 1017-1042) is:
```
I18nextProvider > ThemeProvider > AuthProvider > WebSocketProvider > ToastProvider > ConfirmProvider > TasksSettingsProvider > TaskMasterProvider
```

```javascript
// In src/App.jsx, add to imports:
import { NotificationProvider } from './contexts/NotificationContext';

// Insert NotificationProvider between ConfirmProvider and TasksSettingsProvider (~line 1022):
<I18nextProvider i18n={i18n}>
  <ThemeProvider>
    <AuthProvider>
      <WebSocketProvider>
        <ToastProvider>
          <ConfirmProvider>
            <NotificationProvider>        {/* <-- ADD HERE */}
              <TasksSettingsProvider>
                <TaskMasterProvider>
                  {/* ... rest of app */}
                </TaskMasterProvider>
              </TasksSettingsProvider>
            </NotificationProvider>
          </ConfirmProvider>
        </ToastProvider>
      </WebSocketProvider>
    </AuthProvider>
  </ThemeProvider>
</I18nextProvider>
```

This placement ensures NotificationProvider has access to Toast for fallback notifications, but doesn't depend on TasksSettings or TaskMaster.

---

### Task 1.4: Create Notification Sound Asset
**Status**: [ ]
**File**: `public/sounds/notification.mp3`

#### Subtasks:
- [ ] 1.4.1 Add notification sound file (short, pleasant tone)
- [ ] 1.4.2 Ensure file is appropriately sized (<50KB)
- [ ] 1.4.3 Add audio playback utility function

---

## Phase 2: Settings UI Integration

**Objective**: Add notification controls to the Settings panel

**Dependencies**: Phase 1 complete

### Task 2.1: Create NotificationSettings Component
**Status**: [ ]
**File**: `src/components/settings/NotificationSettings.jsx`

#### Subtasks:
- [ ] 2.1.1 Create component file with proper structure
- [ ] 2.1.2 Add master enable/disable toggle
- [ ] 2.1.3 Add "only when unfocused" toggle
- [ ] 2.1.4 Add sound notification toggle
- [ ] 2.1.5 Add permission status display
- [ ] 2.1.6 Add "Request Permission" button
- [ ] 2.1.7 Add informational text for denied permissions
- [ ] 2.1.8 Style consistently with existing settings panels

#### Implementation Details:

```javascript
// src/components/settings/NotificationSettings.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { Bell, BellOff, Volume2, VolumeX, AlertCircle, Check, X } from 'lucide-react';

const NotificationSettings = () => {
  const { t } = useTranslation('settings');
  const {
    permission,
    settings,
    isSupported,
    requestPermission,
    updateSettings
  } = useNotificationContext();

  const handleToggleEnabled = () => {
    if (!settings.enabled && permission === 'default') {
      // Request permission when enabling for the first time
      requestPermission().then((result) => {
        if (result === 'granted') {
          updateSettings({ enabled: true });
        }
      });
    } else {
      updateSettings({ enabled: !settings.enabled });
    }
  };

  if (!isSupported) {
    return (
      <div className="notification-settings">
        <div className="settings-section">
          <h3>Desktop Notifications</h3>
          <div className="settings-notice warning">
            <AlertCircle size={16} />
            <span>Your browser does not support desktop notifications.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notification-settings">
      <div className="settings-section">
        <h3>Desktop Notifications</h3>
        <p className="settings-description">
          Get notified when Claude finishes processing your request.
        </p>

        {/* Permission Status */}
        <div className="permission-status">
          <span className="permission-label">Permission Status:</span>
          <span className={`permission-badge ${permission}`}>
            {permission === 'granted' && <Check size={14} />}
            {permission === 'denied' && <X size={14} />}
            {permission === 'default' && <AlertCircle size={14} />}
            {permission.charAt(0).toUpperCase() + permission.slice(1)}
          </span>
        </div>

        {permission === 'denied' && (
          <div className="settings-notice warning">
            <AlertCircle size={16} />
            <span>
              Notifications are blocked. Please enable them in your browser settings.
            </span>
          </div>
        )}

        {permission === 'default' && (
          <button
            className="request-permission-btn"
            onClick={requestPermission}
          >
            <Bell size={16} />
            Enable Notifications
          </button>
        )}

        {/* Settings Toggles */}
        <div className="settings-toggles">
          <label className="toggle-row">
            <span className="toggle-label">
              {settings.enabled ? <Bell size={18} /> : <BellOff size={18} />}
              Enable desktop notifications
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={handleToggleEnabled}
              disabled={permission === 'denied'}
            />
          </label>

          <label className="toggle-row">
            <span className="toggle-label">
              Only notify when tab is unfocused
            </span>
            <input
              type="checkbox"
              checked={settings.onlyWhenUnfocused}
              onChange={() => updateSettings({
                onlyWhenUnfocused: !settings.onlyWhenUnfocused
              })}
              disabled={!settings.enabled || permission !== 'granted'}
            />
          </label>

          <label className="toggle-row">
            <span className="toggle-label">
              {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              Play notification sound
            </span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={() => updateSettings({
                soundEnabled: !settings.soundEnabled
              })}
              disabled={!settings.enabled || permission !== 'granted'}
            />
          </label>
        </div>

        {/* Test Notification */}
        {permission === 'granted' && settings.enabled && (
          <button
            className="test-notification-btn"
            onClick={() => {
              new Notification(t('notifications.testTitle'), {
                body: t('notifications.testBody'),
                icon: '/icons/claude-ai-icon.svg',
                tag: 'test-notification'
              });
            }}
          >
            {t('notifications.testButton')}
          </button>
        )}
      </div>
    </div>
  );
};

export default NotificationSettings;
```

---

### Task 2.2: Integrate NotificationSettings into Settings.jsx
**Status**: [ ]
**File**: `src/components/Settings.jsx`

#### Subtasks:
- [ ] 2.2.1 Import NotificationSettings component
- [ ] 2.2.2 Add "Notifications" tab to settings tabs (after 'tasks' tab, ~line 986)
- [ ] 2.2.3 Render NotificationSettings in appropriate tab panel
- [ ] 2.2.4 Add notification icon (Bell from lucide-react) to tab
- [ ] 2.2.5 Add i18n translation keys

#### Implementation Details:

**Current Tab Structure** (Settings.jsx lines 927-986):
- agents (line 927-940)
- appearance (line 941-951)
- git (line 952-963)
- api (line 964-975)
- tasks (line 976-986)

Add notifications tab after tasks:

```javascript
// In Settings.jsx imports (add Bell icon):
import { X, Settings as SettingsIcon, Moon, Sun, Globe, FolderOpen, Key, GitBranch, Bell } from 'lucide-react';
import NotificationSettings from './settings/NotificationSettings';

// Add new tab button after tasks tab (~line 986):
<button
  type="button"
  onClick={() => setActiveTab('notifications')}
  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
    activeTab === 'notifications'
      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
      : 'border-transparent text-muted-foreground hover:text-foreground'
  }`}
>
  <Bell className="w-4 h-4 inline mr-2" />
  {t('mainTabs.notifications')}
</button>

// Add tab content rendering (after tasks tab content):
{activeTab === 'notifications' && <NotificationSettings />}
```

**i18n Translation Keys** (add to `src/i18n/locales/en/settings.json`):
```json
{
  "mainTabs": {
    "notifications": "Notifications"
  },
  "notifications": {
    "title": "Desktop Notifications",
    "description": "Get notified when Claude finishes processing your request.",
    "permissionStatus": "Permission Status",
    "permissionGranted": "Granted",
    "permissionDenied": "Denied",
    "permissionDefault": "Not Set",
    "enableNotifications": "Enable Notifications",
    "notificationsBlocked": "Notifications are blocked. Please enable them in your browser settings.",
    "browserNotSupported": "Your browser does not support desktop notifications.",
    "toggles": {
      "enableDesktop": "Enable desktop notifications",
      "onlyWhenUnfocused": "Only notify when tab is unfocused",
      "playSound": "Play notification sound"
    },
    "testButton": "Send Test Notification",
    "testTitle": "Test Notification",
    "testBody": "Notifications are working correctly!"
  }
}
```

---

### Task 2.3: Add NotificationSettings Styles
**Status**: [ ]
**File**: `src/components/settings/NotificationSettings.css` or add to existing styles

#### Subtasks:
- [ ] 2.3.1 Style permission status badge
- [ ] 2.3.2 Style toggle rows
- [ ] 2.3.3 Style buttons (request permission, test notification)
- [ ] 2.3.4 Style warning notices
- [ ] 2.3.5 Ensure dark/light theme compatibility

---

## Phase 3: Chat Completion Integration

**Objective**: Trigger notifications when Claude/Cursor/Codex completes a task

**Dependencies**: Phase 1, Phase 2 complete

### Task 3.1: Add Notification Trigger to ChatInterface
**Status**: [ ]
**File**: `src/components/ChatInterface.jsx`

#### Subtasks:
- [ ] 3.1.1 Import useNotificationContext
- [ ] 3.1.2 Add notification trigger in `claude-complete` handler (~line 3923)
- [ ] 3.1.3 Add notification trigger for `cursor-complete` if applicable
- [ ] 3.1.4 Add notification trigger for `codex-complete` if applicable
- [ ] 3.1.5 Format notification content with project/session info
- [ ] 3.1.6 Handle notification click to focus chat

#### Implementation Details:

```javascript
// In ChatInterface.jsx

// Import at top
import { useNotificationContext } from '../contexts/NotificationContext';

// Inside component
const { sendNotification, settings } = useNotificationContext();

// In the claude-complete case handler (around line 3923):
case 'claude-complete': {
  // ... existing completion logic ...

  // Trigger browser notification
  if (settings.enabled) {
    const projectName = currentProject?.name || 'Unknown Project';
    sendNotification('Claude Code Finished', {
      body: `Task completed in ${projectName}`,
      tag: `claude-complete-${data.sessionId}`,
      data: { sessionId: data.sessionId, projectPath: currentProject?.path }
    });
  }

  // ... rest of existing logic ...
  break;
}
```

---

### Task 3.2: Add Agent-Specific Notification Content
**Status**: [ ]
**File**: `src/utils/notificationContent.js`

#### Subtasks:
- [ ] 3.2.1 Create utility file for notification content formatting
- [ ] 3.2.2 Add agent-specific titles (Claude, Cursor, Codex)
- [ ] 3.2.3 Add project/session context to notification body
- [ ] 3.2.4 Handle edge cases (no project, aborted sessions)

#### Implementation Details:

```javascript
// src/utils/notificationContent.js
export const getNotificationContent = (agent, data, project) => {
  const agentNames = {
    claude: 'Claude Code',
    cursor: 'Cursor',
    codex: 'OpenAI Codex'
  };

  const agentName = agentNames[agent] || 'AI Assistant';
  const projectName = project?.name || 'your project';

  if (data.aborted) {
    return {
      title: `${agentName} Stopped`,
      body: `Session was aborted in ${projectName}`,
      tag: `${agent}-aborted-${data.sessionId}`
    };
  }

  if (data.exitCode !== 0) {
    return {
      title: `${agentName} Finished with Errors`,
      body: `Task completed with exit code ${data.exitCode} in ${projectName}`,
      tag: `${agent}-error-${data.sessionId}`
    };
  }

  return {
    title: `${agentName} Finished`,
    body: `Task completed successfully in ${projectName}`,
    tag: `${agent}-complete-${data.sessionId}`
  };
};
```

---

### Task 3.3: Add Sound Notification Support
**Status**: [ ]
**File**: `src/utils/notificationSound.js`

#### Subtasks:
- [ ] 3.3.1 Create audio playback utility
- [ ] 3.3.2 Integrate with notification trigger
- [ ] 3.3.3 Handle audio playback errors gracefully
- [ ] 3.3.4 Respect user sound preferences

#### Implementation Details:

```javascript
// src/utils/notificationSound.js
let audioContext = null;
let notificationBuffer = null;

export const initNotificationSound = async () => {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch('/sounds/notification.mp3');
    const arrayBuffer = await response.arrayBuffer();
    notificationBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.warn('Failed to initialize notification sound:', error);
  }
};

export const playNotificationSound = () => {
  if (!audioContext || !notificationBuffer) return;

  try {
    const source = audioContext.createBufferSource();
    source.buffer = notificationBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (error) {
    console.warn('Failed to play notification sound:', error);
  }
};
```

---

### Task 3.4: Add Notification Click Handler
**Status**: [ ]
**File**: Integrated in `src/hooks/useNotifications.js`

#### Subtasks:
- [ ] 3.4.1 Focus browser window on notification click
- [ ] 3.4.2 Navigate to relevant session/project if possible
- [ ] 3.4.3 Close notification after click

---

## Phase 4: E2E Testing with Playwright

**Objective**: Comprehensive test coverage for notification feature

**Dependencies**: Phases 1-3 complete

### Task 4.1: Create Notification Test Utilities
**Status**: [ ]
**File**: `tests/utils/notification-mocks.js`

#### Subtasks:
- [ ] 4.1.1 Create mock for Notification API with 'granted' permission
- [ ] 4.1.2 Create mock for Notification API with 'denied' permission
- [ ] 4.1.3 Create mock for Notification API with 'default' permission
- [ ] 4.1.4 Create mock for unsupported browser
- [ ] 4.1.5 Create notification tracker to capture sent notifications

#### Implementation Details:

```javascript
// tests/utils/notification-mocks.js

/**
 * Mocks the Notification API with specified permission
 */
export const mockNotificationAPI = (page, permission = 'granted') => {
  return page.addInitScript((perm) => {
    window.__notificationHistory = [];

    class MockNotification {
      constructor(title, options = {}) {
        this.title = title;
        this.body = options.body || '';
        this.icon = options.icon || '';
        this.tag = options.tag || '';
        this.onclick = null;

        window.__notificationHistory.push({
          title,
          body: options.body,
          icon: options.icon,
          tag: options.tag,
          timestamp: Date.now()
        });
      }

      close() {}
    }

    MockNotification.permission = perm;
    MockNotification.requestPermission = async () => {
      MockNotification.permission = 'granted';
      return 'granted';
    };

    window.Notification = MockNotification;
  }, permission);
};

/**
 * Mocks unsupported browser (no Notification API)
 */
export const mockUnsupportedBrowser = (page) => {
  return page.addInitScript(() => {
    delete window.Notification;
  });
};

/**
 * Gets the notification history from the page
 */
export const getNotificationHistory = async (page) => {
  return page.evaluate(() => window.__notificationHistory || []);
};

/**
 * Clears the notification history
 */
export const clearNotificationHistory = async (page) => {
  return page.evaluate(() => {
    window.__notificationHistory = [];
  });
};
```

---

### Task 4.2: Create Notification Settings Tests
**Status**: [ ]
**File**: `tests/notifications-settings.spec.js`

#### Subtasks:
- [ ] 4.2.1 Test: Settings panel shows notification toggle
- [ ] 4.2.2 Test: Toggle state persists in localStorage
- [ ] 4.2.3 Test: Permission request button appears when permission is default
- [ ] 4.2.4 Test: Permission status badge displays correctly for each state
- [ ] 4.2.5 Test: Disabled state when permission is denied
- [ ] 4.2.6 Test: Test notification button works when enabled

#### Implementation Details:

```javascript
// tests/notifications-settings.spec.js
import { test, expect } from '@playwright/test';
import { mockNotificationAPI, mockUnsupportedBrowser } from './utils/notification-mocks';

test.describe('Notification Settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
    await page.goto('/');
    // Login if required
    await page.waitForSelector('[data-testid="settings-button"]');
  });

  test('should display notification toggle in settings', async ({ page }) => {
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    await expect(page.locator('[data-testid="notification-toggle"]')).toBeVisible();
    await expect(page.locator('text=Desktop Notifications')).toBeVisible();
  });

  test('should persist toggle state in localStorage', async ({ page }) => {
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    // Enable notifications
    await page.click('[data-testid="notification-toggle"]');

    // Verify localStorage
    const settings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('notification-settings'));
    });
    expect(settings.enabled).toBe(true);

    // Reload and verify persistence
    await page.reload();
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    await expect(page.locator('[data-testid="notification-toggle"]')).toBeChecked();
  });

  test('should show permission request button when permission is default', async ({ page }) => {
    await mockNotificationAPI(page, 'default');
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    await expect(page.locator('[data-testid="request-permission-btn"]')).toBeVisible();
    await expect(page.locator('text=Enable Notifications')).toBeVisible();
  });

  test('should display correct permission status badge', async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    await expect(page.locator('.permission-badge.granted')).toBeVisible();
    await expect(page.locator('text=Granted')).toBeVisible();
  });

  test('should disable toggles when permission is denied', async ({ page }) => {
    await mockNotificationAPI(page, 'denied');
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    await expect(page.locator('[data-testid="notification-toggle"]')).toBeDisabled();
    await expect(page.locator('text=Notifications are blocked')).toBeVisible();
  });

  test('should show unsupported message when Notification API unavailable', async ({ page }) => {
    await mockUnsupportedBrowser(page);
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    await expect(page.locator('text=does not support desktop notifications')).toBeVisible();
  });
});
```

---

### Task 4.3: Create Notification Trigger Tests
**Status**: [ ]
**File**: `tests/notifications-trigger.spec.js`

#### Subtasks:
- [ ] 4.3.1 Test: Notification fires on chat completion when enabled
- [ ] 4.3.2 Test: Notification does NOT fire when disabled
- [ ] 4.3.3 Test: Notification only fires when tab unfocused (if setting enabled)
- [ ] 4.3.4 Test: Notification content includes correct title and body
- [ ] 4.3.5 Test: Duplicate notifications are prevented (using tag)

#### Implementation Details:

```javascript
// tests/notifications-trigger.spec.js
import { test, expect } from '@playwright/test';
import {
  mockNotificationAPI,
  getNotificationHistory,
  clearNotificationHistory
} from './utils/notification-mocks';

test.describe('Notification Triggers', () => {
  test.beforeEach(async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
    await page.goto('/');
    // Login and setup
  });

  test('should fire notification on chat completion when enabled', async ({ page }) => {
    // Enable notifications in settings
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');
    await page.click('[data-testid="notification-toggle"]');
    await page.keyboard.press('Escape');

    // Clear any previous notifications
    await clearNotificationHistory(page);

    // Simulate sending a message (this requires WebSocket mock or real interaction)
    // For E2E, we can trigger the completion event directly
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-123', exitCode: 0 }
      }));
    });

    // Check notification was sent
    const notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(1);
    expect(notifications[0].title).toContain('Claude');
    expect(notifications[0].title).toContain('Finished');
  });

  test('should NOT fire notification when disabled', async ({ page }) => {
    // Ensure notifications are disabled (default state)
    await clearNotificationHistory(page);

    // Trigger completion
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-123', exitCode: 0 }
      }));
    });

    // Verify no notification
    const notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(0);
  });

  test('should respect onlyWhenUnfocused setting', async ({ page }) => {
    // Enable notifications with onlyWhenUnfocused
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');
    await page.click('[data-testid="notification-toggle"]');
    await page.click('[data-testid="only-unfocused-toggle"]');
    await page.keyboard.press('Escape');

    await clearNotificationHistory(page);

    // Tab is focused, should not notify
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-123', exitCode: 0 }
      }));
    });

    let notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(0);

    // Simulate tab unfocused
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-456', exitCode: 0 }
      }));
    });

    notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(1);
  });

  test('notification should contain project name', async ({ page }) => {
    // Enable notifications
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');
    await page.click('[data-testid="notification-toggle"]');
    await page.keyboard.press('Escape');

    // Select a project first
    await page.click('[data-testid="project-selector"]');
    await page.click('[data-testid="project-item-test-project"]');

    await clearNotificationHistory(page);

    // Trigger completion
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-123', exitCode: 0 }
      }));
    });

    const notifications = await getNotificationHistory(page);
    expect(notifications[0].body).toContain('test-project');
  });
});
```

---

### Task 4.4: Create Permission Flow Tests
**Status**: [ ]
**File**: `tests/notifications-permissions.spec.js`

#### Subtasks:
- [ ] 4.4.1 Test: App handles granted permission correctly
- [ ] 4.4.2 Test: App handles denied permission gracefully
- [ ] 4.4.3 Test: Request permission flow works correctly
- [ ] 4.4.4 Test: Permission state updates reactively

#### Implementation Details:

```javascript
// tests/notifications-permissions.spec.js
import { test, expect } from '@playwright/test';
import { mockNotificationAPI } from './utils/notification-mocks';

test.describe('Notification Permissions', () => {
  test('should handle granted permission correctly', async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    // Should show enabled state
    await expect(page.locator('.permission-badge.granted')).toBeVisible();
    await expect(page.locator('[data-testid="notification-toggle"]')).not.toBeDisabled();
    await expect(page.locator('[data-testid="test-notification-btn"]')).toBeVisible();
  });

  test('should handle denied permission gracefully', async ({ page }) => {
    await mockNotificationAPI(page, 'denied');
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    // Should show denied state with helpful message
    await expect(page.locator('.permission-badge.denied')).toBeVisible();
    await expect(page.locator('[data-testid="notification-toggle"]')).toBeDisabled();
    await expect(page.locator('text=enable them in your browser settings')).toBeVisible();
  });

  test('should request permission when clicking enable button', async ({ page }) => {
    await mockNotificationAPI(page, 'default');
    await page.goto('/');

    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');

    // Click request permission button
    await page.click('[data-testid="request-permission-btn"]');

    // Permission should now be granted (mocked)
    await expect(page.locator('.permission-badge.granted')).toBeVisible();
    await expect(page.locator('[data-testid="notification-toggle"]')).not.toBeDisabled();
  });
});
```

---

### Task 4.5: Create Integration Tests
**Status**: [ ]
**File**: `tests/notifications-integration.spec.js`

#### Subtasks:
- [ ] 4.5.1 Test: Full flow - enable notifications, chat, receive notification
- [ ] 4.5.2 Test: Settings changes take effect immediately without reload
- [ ] 4.5.3 Test: Multiple agent types trigger appropriate notifications

#### Implementation Details:

```javascript
// tests/notifications-integration.spec.js
import { test, expect } from '@playwright/test';
import {
  mockNotificationAPI,
  getNotificationHistory,
  clearNotificationHistory
} from './utils/notification-mocks';

test.describe('Notification Integration', () => {
  test('full notification flow', async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
    await page.goto('/');

    // 1. Open settings and enable notifications
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');
    await page.click('[data-testid="notification-toggle"]');
    await page.keyboard.press('Escape');

    // 2. Start a chat session
    await page.fill('[data-testid="chat-input"]', 'Hello, Claude!');
    await page.click('[data-testid="send-button"]');

    // 3. Wait for response and completion
    await page.waitForSelector('[data-testid="message-complete"]', { timeout: 60000 });

    // 4. Verify notification was sent
    const notifications = await getNotificationHistory(page);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[notifications.length - 1].title).toContain('Finished');
  });

  test('settings changes take effect immediately', async ({ page }) => {
    await mockNotificationAPI(page, 'granted');
    await page.goto('/');

    await clearNotificationHistory(page);

    // Initially disabled - trigger should not notify
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-1', exitCode: 0 }
      }));
    });

    let notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(0);

    // Enable notifications
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="settings-tab-notifications"]');
    await page.click('[data-testid="notification-toggle"]');
    await page.keyboard.press('Escape');

    // Now trigger should notify (no reload needed)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-claude-complete', {
        detail: { sessionId: 'test-2', exitCode: 0 }
      }));
    });

    notifications = await getNotificationHistory(page);
    expect(notifications.length).toBe(1);
  });
});
```

---

## Phase 5: Quality Assurance and Documentation

**Objective**: Ensure code quality, cross-browser compatibility, and proper documentation

**Dependencies**: Phases 1-4 complete

### Task 5.1: Code Quality Checks
**Status**: [ ]

#### Subtasks:
- [ ] 5.1.1 Run `npm run lint` and fix all issues
- [ ] 5.1.2 Run `npm run type-check` and resolve TypeScript errors
- [ ] 5.1.3 Run `npm run lint:knip` to check for unused code
- [ ] 5.1.4 Ensure all new code follows existing patterns and conventions

---

### Task 5.2: Cross-Browser Testing
**Status**: [ ]

#### Subtasks:
- [ ] 5.2.1 Test in Chrome (primary)
- [ ] 5.2.2 Test in Firefox
- [ ] 5.2.3 Test in Safari (if available)
- [ ] 5.2.4 Test in Edge
- [ ] 5.2.5 Document any browser-specific behaviors or limitations

---

### Task 5.3: Accessibility Audit
**Status**: [ ]

#### Subtasks:
- [ ] 5.3.1 Add proper ARIA labels to notification settings controls
- [ ] 5.3.2 Ensure keyboard navigation works for all settings
- [ ] 5.3.3 Add aria-live region for permission status changes
- [ ] 5.3.4 Test with screen reader (VoiceOver/NVDA)
- [ ] 5.3.5 Ensure sufficient color contrast for status badges

---

### Task 5.4: Documentation Updates
**Status**: [ ]

#### Subtasks:
- [ ] 5.4.1 Add JSDoc comments to useNotifications hook
- [ ] 5.4.2 Add JSDoc comments to NotificationContext
- [ ] 5.4.3 Add inline comments for complex logic
- [ ] 5.4.4 Update CLAUDE.md with new component locations

---

### Task 5.5: Run Full Test Suite
**Status**: [ ]

#### Subtasks:
- [ ] 5.5.1 Run `npm run test:e2e` for all Playwright tests
- [ ] 5.5.2 Fix any failing tests
- [ ] 5.5.3 Verify no regressions in existing functionality
- [ ] 5.5.4 Generate test coverage report

---

## File Structure

After implementation, the following files will be added/modified:

```
src/
├── hooks/
│   └── useNotifications.js          # NEW - Core notification hook
├── contexts/
│   └── NotificationContext.jsx      # NEW - Context provider
├── components/
│   ├── Settings.jsx                 # MODIFIED - Add notifications tab
│   ├── ChatInterface.jsx            # MODIFIED - Add notification triggers
│   └── settings/
│       ├── NotificationSettings.jsx # NEW - Settings UI component
│       └── NotificationSettings.css # NEW - Styles
├── utils/
│   ├── notificationContent.js       # NEW - Content formatting
│   └── notificationSound.js         # NEW - Audio utilities
├── App.jsx                          # MODIFIED - Add NotificationProvider
public/
├── claude-icon.png                  # NEW or existing - Notification icon
├── claude-badge.png                 # NEW - Badge icon
└── sounds/
    └── notification.mp3             # NEW - Notification sound
tests/
├── utils/
│   └── notification-mocks.js        # NEW - Test utilities
├── notifications-settings.spec.js   # NEW - Settings tests
├── notifications-trigger.spec.js    # NEW - Trigger tests
├── notifications-permissions.spec.js# NEW - Permission tests
└── notifications-integration.spec.js# NEW - Integration tests
```

---

## Dependencies and Prerequisites

### Required Dependencies
- No new npm packages required (uses native Notification API)

### Browser Requirements
- Modern browser with Notification API support
- HTTPS connection (required for Notification API in production)

### Development Prerequisites
- Node.js and npm installed
- Playwright installed for E2E tests
- Access to browser developer tools for debugging

---

## Risk Mitigation

### Risk: Permission Denied by Default
**Mitigation**:
- Request permission only after user engagement (clicking enable button)
- Provide clear instructions for enabling in browser settings
- Use toast notifications as fallback for in-app feedback

### Risk: Browser Compatibility Issues
**Mitigation**:
- Feature detection before using Notification API
- Graceful degradation when not supported
- Cross-browser testing in Phase 5

### Risk: Notification Fatigue
**Mitigation**:
- "Only when unfocused" option enabled by default
- Use notification tags to prevent duplicates
- Clear, concise notification content

### Risk: Test Flakiness
**Mitigation**:
- Mock Notification API instead of relying on browser prompts
- Use deterministic test data
- Add appropriate waits and retries

---

## Implementation Timeline Summary

| Phase | Description | Estimated Complexity | Dependencies |
|-------|-------------|---------------------|--------------|
| 1 | Core Infrastructure | Medium | None |
| 2 | Settings UI | Medium | Phase 1 |
| 3 | Chat Integration | Low | Phase 1, 2 |
| 4 | E2E Testing | High | Phase 1, 2, 3 |
| 5 | QA & Documentation | Low | Phase 1-4 |

---

## Acceptance Criteria

### Functional Requirements
- [ ] Notifications appear when Claude/Cursor/Codex completes a task
- [ ] Settings toggle enables/disables notifications
- [ ] "Only when unfocused" setting works correctly
- [ ] Permission request flow works smoothly
- [ ] Notification click focuses the app window

### Non-Functional Requirements
- [ ] All E2E tests pass
- [ ] No lint errors or type errors
- [ ] Works in Chrome, Firefox, and Edge
- [ ] Accessible with keyboard and screen readers
- [ ] No performance regression

### Code Quality Requirements
- [ ] Follows existing codebase patterns
- [ ] Properly documented with JSDoc
- [ ] Modular and maintainable structure
- [ ] No unused code or dependencies
