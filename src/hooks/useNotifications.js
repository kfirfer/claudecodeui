/**
 * useNotifications Hook
 *
 * Core notification hook for browser notifications (desktop and mobile).
 * Uses Service Worker-based notifications for cross-platform compatibility.
 * Handles permission management, settings persistence, and notification sending.
 *
 * @module hooks/useNotifications
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import BrowserNotificationService, { notificationService } from '../services/browserNotificationService';
import { getNotificationSupport, detectPlatform } from '../utils/platformDetection';

const NOTIFICATION_SETTINGS_KEY = 'notification-settings';

const defaultSettings = {
  enabled: false,
  soundEnabled: false,
  onlyWhenUnfocused: true,
  permissionRequested: false,
  lastUpdated: null
};

/**
 * Custom hook for managing browser notifications
 *
 * @returns {Object} Notification state and actions
 * @property {string} permission - Current notification permission ('granted' | 'denied' | 'default' | 'unsupported')
 * @property {Object} settings - User notification settings
 * @property {boolean} isSupported - Whether the browser supports notifications
 * @property {boolean} isTabVisible - Whether the current tab is visible
 * @property {boolean} swRegistered - Whether the Service Worker is registered
 * @property {Object} platformSupport - Platform support information
 * @property {Object} platform - Platform detection results
 * @property {Function} requestPermission - Request notification permission from user
 * @property {Function} updateSettings - Update notification settings
 * @property {Function} sendNotification - Send a browser notification
 */
export const useNotifications = () => {
  // Initialize permission state
  const [permission, setPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Initialize settings from localStorage
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  // Track tab visibility
  const [isTabVisible, setIsTabVisible] = useState(() => {
    if (typeof document !== 'undefined') {
      return !document.hidden;
    }
    return true;
  });

  // Service Worker registration state
  const [swRegistered, setSwRegistered] = useState(false);

  // Platform support information
  const [platformSupport, setPlatformSupport] = useState(null);

  // Platform detection results
  const [platform, setPlatform] = useState(null);

  // Check platform support on mount
  useEffect(() => {
    setPlatformSupport(getNotificationSupport());
    setPlatform(detectPlatform());
  }, []);

  // Track document visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Sync settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save notification settings:', error);
    }
  }, [settings]);

  // Register SW when notifications are enabled and permission is granted
  useEffect(() => {
    if (settings.enabled && permission === 'granted' && BrowserNotificationService.isSupported()) {
      notificationService.register()
        .then(() => {
          setSwRegistered(true);
          console.log('[Notifications] Service Worker registered');
          return true;
        })
        .catch((error) => {
          setSwRegistered(false);
          console.error('[Notifications] Failed to register Service Worker:', error);
          return false;
        });
    }
  }, [settings.enabled, permission]);

  // Check if Notification API is supported
  const isSupported = useMemo(() => {
    return typeof window !== 'undefined' && 'Notification' in window;
  }, []);

  /**
   * Request notification permission from the user
   * @returns {Promise<string>} The permission result
   */
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

  /**
   * Update notification settings
   * @param {Object} updates - Settings to update
   */
  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString()
    }));
  }, []);

  /**
   * Send a browser notification
   * Uses Service Worker when available for cross-platform compatibility
   * Falls back to legacy Notification API for non-Safari desktop browsers
   *
   * @param {string} title - Notification title
   * @param {Object} options - Notification options (body, icon, tag, etc.)
   * @returns {Promise<boolean>} True if notification was sent successfully
   */
  const sendNotification = useCallback(async (title, options = {}) => {
    // Check if we should send the notification
    if (!isSupported) {
      console.log('[Notifications] Browser does not support notifications');
      return false;
    }

    if (permission !== 'granted') {
      console.log('[Notifications] Permission not granted:', permission);
      return false;
    }

    if (!settings.enabled) {
      console.log('[Notifications] Notifications are disabled in settings');
      return false;
    }

    // Respect "only when unfocused" setting
    // Check document.hidden directly to avoid stale closure from React state
    const currentlyVisible = typeof document !== 'undefined' ? !document.hidden : true;
    if (settings.onlyWhenUnfocused && currentlyVisible) {
      console.log('[Notifications] Tab is visible and onlyWhenUnfocused is enabled, skipping notification');
      return false;
    }

    const notificationOptions = {
      icon: '/icons/claude-ai-icon.svg',
      badge: '/icons/icon-128x128.png',
      tag: 'claude-complete',
      requireInteraction: false,
      silent: !settings.soundEnabled,
      ...options
    };

    try {
      // Use SW-based notification (works on all browsers including Safari)
      if (swRegistered && BrowserNotificationService.isSupported()) {
        await notificationService.showNotification(title, notificationOptions);
        console.log('[Notifications] Notification sent via SW:', title);
        return true;
      }

      // Try to register SW on-the-fly if not registered
      if (BrowserNotificationService.isSupported()) {
        try {
          await notificationService.register();
          setSwRegistered(true);
          await notificationService.showNotification(title, notificationOptions);
          console.log('[Notifications] Notification sent via SW (on-demand registration):', title);
          return true;
        } catch (swError) {
          console.warn('[Notifications] SW registration failed, trying legacy API:', swError);
        }
      }

      // Fallback to legacy Notification (only for non-Safari desktop)
      if (BrowserNotificationService.canUseLegacyNotification()) {
        const notification = new Notification(title, notificationOptions);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        console.log('[Notifications] Notification sent via legacy API:', title);
        return true;
      }

      console.warn('[Notifications] No notification method available');
      return false;
    } catch (error) {
      console.error('[Notifications] Failed to send notification:', error);
      return false;
    }
  }, [isSupported, permission, settings, swRegistered]);

  return {
    // State
    permission,
    settings,
    isSupported,
    isTabVisible,
    swRegistered,
    platformSupport,
    platform,

    // Actions
    requestPermission,
    updateSettings,
    sendNotification
  };
};
