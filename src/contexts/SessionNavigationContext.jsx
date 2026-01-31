/**
 * SessionNavigationContext.jsx - Session Navigation Context Provider
 *
 * Provides session navigation state and actions to all components via React context.
 * This context wraps the useSessionNavigation hook to make navigation state
 * accessible throughout the component tree.
 *
 * Usage:
 *   // In App.jsx or main component tree
 *   <SessionNavigationProvider>
 *     <App />
 *   </SessionNavigationProvider>
 *
 *   // In any child component
 *   const { navigateToSession, isNavigating } = useSessionNavigationContext();
 */

import React, { createContext, useContext } from 'react';
import { useSessionNavigation, NAVIGATION_STATES } from '../hooks/useSessionNavigation';

/**
 * @typedef {Object} SessionNavigationContextValue
 * @property {string} navigationState - Current navigation state (idle/switching/loading/ready/error)
 * @property {string|null} targetSessionId - Session being navigated to
 * @property {string|null} loadedSessionId - Currently loaded session
 * @property {string|null} previousSessionId - Previously loaded session
 * @property {string|null} errorMessage - Error message if navigation failed
 * @property {React.RefObject} sessionStateRef - Ref for synchronous state access
 * @property {function(string|Object): Object} navigateToSession - Start navigation to a session
 * @property {function(string): void} startLoading - Signal API loading started
 * @property {function(string): void} onMessagesLoaded - Signal messages loaded successfully
 * @property {function(string, string): void} onNavigationError - Signal navigation error
 * @property {function(): void} resetNavigation - Reset navigation state
 * @property {function(): boolean} isNavigating - Check if navigation in progress
 * @property {function(string): boolean} isSessionReady - Check if session is ready
 * @property {function(): string|null} getTargetSessionId - Get current target session
 * @property {function(): string|null} getLoadedSessionId - Get loaded session
 * @property {function(string): boolean} isCurrentTarget - Check if session is current target
 * @property {Object} NAVIGATION_STATES - Navigation state constants
 */

const SessionNavigationContext = createContext(null);

/**
 * Hook to access session navigation context
 * @public
 * @returns {SessionNavigationContextValue} The session navigation context value
 * @throws {Error} If used outside of SessionNavigationProvider
 */
export const useSessionNavigationContext = () => {
  const context = useContext(SessionNavigationContext);
  if (!context) {
    throw new Error('useSessionNavigationContext must be used within a SessionNavigationProvider');
  }
  return context;
};

/**
 * Optional hook that doesn't throw if context is missing
 * Useful for components that may be rendered outside the provider
 * @public
 * @returns {SessionNavigationContextValue|null} The context value or null if not in provider
 */
export const useSessionNavigationContextOptional = () => {
  return useContext(SessionNavigationContext);
};

/**
 * Provider component for session navigation context
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {Object} props.options - Options passed to useSessionNavigation
 * @param {number} props.options.timeoutMs - Timeout for stuck navigation (default: 30000)
 */
export const SessionNavigationProvider = ({ children, options = {} }) => {
  const navigation = useSessionNavigation(options);

  // Expose NAVIGATION_STATES constant for consumers
  const value = {
    ...navigation,
    NAVIGATION_STATES
  };

  return (
    <SessionNavigationContext.Provider value={value}>
      {children}
    </SessionNavigationContext.Provider>
  );
};

// Re-export constants for convenience
export { NAVIGATION_STATES };
