/**
 * NotificationContext
 *
 * React context provider for browser notification functionality.
 * Provides notification state and actions to the entire application.
 *
 * @module contexts/NotificationContext
 */

import React, { createContext, useContext } from 'react';
import { useNotifications } from '../hooks/useNotifications';

const NotificationContext = createContext(null);

/**
 * Provider component for notification functionality
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const NotificationProvider = ({ children }) => {
  const notifications = useNotifications();

  return (
    <NotificationContext.Provider value={notifications}>
      {children}
    </NotificationContext.Provider>
  );
};

/**
 * Hook to access notification context
 * Must be used within a NotificationProvider
 *
 * @returns {Object} Notification state and actions
 * @throws {Error} If used outside of NotificationProvider
 */
export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
};
