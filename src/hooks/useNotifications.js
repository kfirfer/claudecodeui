/**
 * useNotifications Hook
 *
 * Core notification hook for browser desktop notifications.
 * Handles permission management, settings persistence, and notification sending.
 *
 * @module hooks/useNotifications
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

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
 * @property {Function} requestPermission - Request notification permission from user
 * @property {Function} updateSettings - Update notification settings
 * @property {Function} sendNotification - Send a desktop notification
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
   * Send a desktop notification
   * @param {string} title - Notification title
   * @param {Object} options - Notification options (body, icon, tag, etc.)
   * @returns {Notification|null} The notification instance or null if not sent
   */
  const sendNotification = useCallback((title, options = {}) => {
    // Check if we should send the notification
    if (!isSupported) {
      console.debug('[Notifications] Browser does not support notifications');
      return null;
    }

    if (permission !== 'granted') {
      console.debug('[Notifications] Permission not granted:', permission);
      return null;
    }

    if (!settings.enabled) {
      console.debug('[Notifications] Notifications are disabled in settings');
      return null;
    }

    // Respect "only when unfocused" setting
    if (settings.onlyWhenUnfocused && isTabVisible) {
      console.debug('[Notifications] Tab is visible and onlyWhenUnfocused is enabled, skipping notification');
      return null;
    }

    try {
      const notification = new Notification(title, {
        icon: '/icons/claude-ai-icon.svg',
        badge: '/icons/icon-128x128.png',
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

      console.debug('[Notifications] Notification sent:', title, options.body);
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
