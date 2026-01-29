/**
 * NotificationSettings Component
 *
 * Settings panel for configuring desktop browser notifications.
 * Allows users to enable/disable notifications, configure notification
 * behavior, and test notification functionality.
 *
 * @module components/settings/NotificationSettings
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { Bell, BellOff, Volume2, VolumeX, AlertCircle, Check, X } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * NotificationSettings component for the Settings panel
 */
const NotificationSettings = () => {
  const { t } = useTranslation('settings');
  const {
    permission,
    settings,
    isSupported,
    requestPermission,
    updateSettings
  } = useNotificationContext();

  /**
   * Handle enabling/disabling notifications
   * Requests permission if not already granted
   */
  const handleToggleEnabled = async () => {
    if (!settings.enabled && permission === 'default') {
      // Request permission when enabling for the first time
      const result = await requestPermission();
      if (result === 'granted') {
        updateSettings({ enabled: true });
      }
    } else {
      updateSettings({ enabled: !settings.enabled });
    }
  };

  /**
   * Send a test notification to verify functionality
   */
  const handleTestNotification = () => {
    // Temporarily disable the onlyWhenUnfocused check for test
    const notification = new Notification(t('notifications.testTitle'), {
      body: t('notifications.testBody'),
      icon: '/icons/claude-ai-icon.svg',
      tag: 'test-notification'
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  };

  // Show unsupported message if browser doesn't support notifications
  if (!isSupported) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-medium text-foreground">
            {t('notifications.title')}
          </h3>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="w-5 h-5" />
            <span>{t('notifications.browserNotSupported')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-medium text-foreground">
          {t('notifications.title')}
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {t('notifications.description')}
      </p>

      {/* Permission Status */}
      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {t('notifications.permissionStatus')}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              permission === 'granted'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : permission === 'denied'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
            }`}
            data-testid="permission-badge"
          >
            {permission === 'granted' && <Check className="w-3 h-3" />}
            {permission === 'denied' && <X className="w-3 h-3" />}
            {permission === 'default' && <AlertCircle className="w-3 h-3" />}
            {permission === 'granted'
              ? t('notifications.permissionGranted')
              : permission === 'denied'
                ? t('notifications.permissionDenied')
                : t('notifications.permissionDefault')}
          </span>
        </div>
      </div>

      {/* Permission Denied Warning */}
      {permission === 'denied' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{t('notifications.notificationsBlocked')}</span>
          </div>
        </div>
      )}

      {/* Request Permission Button */}
      {permission === 'default' && (
        <Button
          onClick={requestPermission}
          variant="outline"
          className="w-full"
          data-testid="request-permission-btn"
        >
          <Bell className="w-4 h-4 mr-2" />
          {t('notifications.enableNotifications')}
        </Button>
      )}

      {/* Settings Toggles */}
      <div className="space-y-4">
        {/* Enable Notifications Toggle */}
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.enabled ? (
                <Bell className="w-5 h-5 text-blue-600" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium text-foreground">
                  {t('notifications.toggles.enableDesktop')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleEnabled}
              disabled={permission === 'denied'}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                settings.enabled
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              } ${permission === 'denied' ? 'opacity-50 cursor-not-allowed' : ''}`}
              role="switch"
              aria-checked={settings.enabled}
              aria-label={t('notifications.toggles.enableDesktop')}
              data-testid="notification-toggle"
            >
              <span
                className={`${
                  settings.enabled ? 'translate-x-7' : 'translate-x-1'
                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200`}
              />
            </button>
          </div>
        </div>

        {/* Only When Unfocused Toggle */}
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-foreground">
                {t('notifications.toggles.onlyWhenUnfocused')}
              </div>
              <div className="text-sm text-muted-foreground">
                {t('notifications.toggles.onlyWhenUnfocusedDescription')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ onlyWhenUnfocused: !settings.onlyWhenUnfocused })}
              disabled={!settings.enabled || permission !== 'granted'}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                settings.onlyWhenUnfocused
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              } ${!settings.enabled || permission !== 'granted' ? 'opacity-50 cursor-not-allowed' : ''}`}
              role="switch"
              aria-checked={settings.onlyWhenUnfocused}
              aria-label={t('notifications.toggles.onlyWhenUnfocused')}
              data-testid="only-unfocused-toggle"
            >
              <span
                className={`${
                  settings.onlyWhenUnfocused ? 'translate-x-7' : 'translate-x-1'
                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200`}
              />
            </button>
          </div>
        </div>

        {/* Sound Toggle */}
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.soundEnabled ? (
                <Volume2 className="w-5 h-5 text-blue-600" />
              ) : (
                <VolumeX className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium text-foreground">
                  {t('notifications.toggles.playSound')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              disabled={!settings.enabled || permission !== 'granted'}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                settings.soundEnabled
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              } ${!settings.enabled || permission !== 'granted' ? 'opacity-50 cursor-not-allowed' : ''}`}
              role="switch"
              aria-checked={settings.soundEnabled}
              aria-label={t('notifications.toggles.playSound')}
              data-testid="sound-toggle"
            >
              <span
                className={`${
                  settings.soundEnabled ? 'translate-x-7' : 'translate-x-1'
                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Test Notification Button */}
      {permission === 'granted' && settings.enabled && (
        <Button
          onClick={handleTestNotification}
          variant="outline"
          className="w-full"
          data-testid="test-notification-btn"
        >
          <Bell className="w-4 h-4 mr-2" />
          {t('notifications.testButton')}
        </Button>
      )}
    </div>
  );
};

export default NotificationSettings;
