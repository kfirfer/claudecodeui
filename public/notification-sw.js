/**
 * Notification Service Worker
 *
 * Dedicated service worker for handling browser notifications.
 * This SW only handles notification events, not caching.
 * It's separate from sw.js (caching) to avoid conflicts.
 *
 * @module notification-sw
 */

const SW_VERSION = '1.0.0';

/**
 * Handle notification click events
 * Focuses the app window or opens a new one when notification is clicked
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing window and focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // No existing window found, open a new one
        return clients.openWindow('/');
      })
  );
});

/**
 * Handle notification close events
 * Can be used for analytics or cleanup
 */
self.addEventListener('notificationclose', () => {
  // Optional: Analytics or cleanup
  // Currently a no-op, but kept for future use
});

/**
 * Handle messages from the main thread
 * Supports version checking and other commands
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: SW_VERSION });
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Install event - immediately activate
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

/**
 * Activate event - claim clients immediately
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
