/**
 * useSessionNavigation.js - Session Navigation State Machine
 *
 * This hook manages all session navigation state atomically, preventing race
 * conditions during session switching. It complements useChatSessionState which
 * handles processing state (loading/completion).
 *
 * Key features:
 * - Single source of truth for navigation state via sessionStateRef
 * - State machine with explicit states: idle, switching, loading, ready, error
 * - Atomic state transitions prevent race conditions
 * - 30-second timeout failsafe prevents permanently stuck states
 * - Proper cleanup for async operations
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';

/**
 * Navigation state constants
 * - IDLE: No navigation in progress
 * - SWITCHING: Session switch initiated, clearing old data
 * - LOADING: API call in progress
 * - READY: Messages loaded successfully
 * - ERROR: Navigation failed
 */
export const NAVIGATION_STATES = {
  IDLE: 'idle',
  SWITCHING: 'switching',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
};

// Action types
export const NAVIGATION_ACTIONS = {
  START_SWITCH: 'START_SWITCH',
  START_LOADING: 'START_LOADING',
  MESSAGES_LOADED: 'MESSAGES_LOADED',
  NAVIGATION_ERROR: 'NAVIGATION_ERROR',
  RESET: 'RESET',
  TIMEOUT_RESET: 'TIMEOUT_RESET'
};

// Initial state
const initialState = {
  navigationState: NAVIGATION_STATES.IDLE,
  targetSessionId: null,
  loadedSessionId: null,
  previousSessionId: null,
  navigationStartedAt: null,
  lastStateChangeAt: null,
  errorMessage: null
};

/**
 * State machine reducer for session navigation
 * All state updates are atomic - no partial updates
 */
function navigationReducer(state, action) {
  const now = Date.now();

  switch (action.type) {
    case NAVIGATION_ACTIONS.START_SWITCH: {
      // Guard: Don't start switch if already switching to same session
      if (state.navigationState === NAVIGATION_STATES.SWITCHING &&
          state.targetSessionId === action.targetSessionId) {
        return state;
      }

      return {
        ...state,
        navigationState: NAVIGATION_STATES.SWITCHING,
        targetSessionId: action.targetSessionId,
        previousSessionId: state.loadedSessionId,
        navigationStartedAt: now,
        lastStateChangeAt: now,
        errorMessage: null
      };
    }

    case NAVIGATION_ACTIONS.START_LOADING: {
      // Guard: Only transition from switching state
      if (state.navigationState !== NAVIGATION_STATES.SWITCHING) {
        // Allow transition from idle if we're loading the initial session
        if (state.navigationState !== NAVIGATION_STATES.IDLE) {
          return state;
        }
      }

      // Guard: Session ID must match target
      if (action.sessionId && state.targetSessionId &&
          action.sessionId !== state.targetSessionId) {
        console.log('[SessionNavigation] Ignoring START_LOADING - session mismatch');
        return state;
      }

      return {
        ...state,
        navigationState: NAVIGATION_STATES.LOADING,
        lastStateChangeAt: now
      };
    }

    case NAVIGATION_ACTIONS.MESSAGES_LOADED: {
      // Guard: Only process if session matches target
      if (action.sessionId !== state.targetSessionId) {
        console.log('[SessionNavigation] Ignoring MESSAGES_LOADED - session mismatch',
          { loaded: action.sessionId, target: state.targetSessionId });
        return state;
      }

      return {
        ...state,
        navigationState: NAVIGATION_STATES.READY,
        loadedSessionId: action.sessionId,
        targetSessionId: null,
        navigationStartedAt: null,
        lastStateChangeAt: now,
        errorMessage: null
      };
    }

    case NAVIGATION_ACTIONS.NAVIGATION_ERROR: {
      // Guard: Only process if session matches or no session specified
      if (action.sessionId && state.targetSessionId &&
          action.sessionId !== state.targetSessionId) {
        return state;
      }

      return {
        ...state,
        navigationState: NAVIGATION_STATES.ERROR,
        lastStateChangeAt: now,
        errorMessage: action.message || 'Navigation failed'
      };
    }

    case NAVIGATION_ACTIONS.RESET: {
      // Preserve currently loaded session when resetting
      return {
        ...initialState,
        loadedSessionId: state.loadedSessionId,
        lastStateChangeAt: now
      };
    }

    case NAVIGATION_ACTIONS.TIMEOUT_RESET: {
      // Only reset if we're actually stuck (not idle or ready)
      if (state.navigationState === NAVIGATION_STATES.IDLE ||
          state.navigationState === NAVIGATION_STATES.READY) {
        return state;
      }

      console.warn('[SessionNavigation] Navigation timeout - auto-resetting from state:',
        state.navigationState);

      return {
        ...state,
        navigationState: NAVIGATION_STATES.IDLE,
        targetSessionId: null,
        navigationStartedAt: null,
        lastStateChangeAt: now,
        errorMessage: 'Navigation timed out'
      };
    }

    default:
      console.warn('[SessionNavigation] Unknown action type:', action.type);
      return state;
  }
}

// Default timeout of 30 seconds for stuck navigation
const NAVIGATION_TIMEOUT_MS = 30000;

/**
 * Custom hook for managing session navigation state
 *
 * @param {Object} options - Configuration options
 * @param {number} options.timeoutMs - Timeout in ms for stuck navigation (default: 30000)
 * @returns {Object} Navigation state and action dispatchers
 */
export function useSessionNavigation(options = {}) {
  const { timeoutMs = NAVIGATION_TIMEOUT_MS } = options;

  const [state, dispatch] = useReducer(navigationReducer, initialState);

  // Single ref that tracks complete navigation state for synchronous access
  // This is the authoritative source - components should read from this ref
  // rather than React state when they need immediate consistency
  const sessionStateRef = useRef({
    targetSessionId: null,
    loadedSessionId: null,
    navigationState: NAVIGATION_STATES.IDLE,
    navigationStartedAt: null
  });

  // Timeout ref for cleanup
  const timeoutRef = useRef(null);

  // Keep ref in sync with reducer state
  useEffect(() => {
    sessionStateRef.current = {
      targetSessionId: state.targetSessionId,
      loadedSessionId: state.loadedSessionId,
      navigationState: state.navigationState,
      navigationStartedAt: state.navigationStartedAt
    };
  }, [state.targetSessionId, state.loadedSessionId, state.navigationState, state.navigationStartedAt]);

  // Timeout failsafe effect - auto-reset if navigation gets stuck
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Only set timeout if navigation is in progress
    if (state.navigationState === NAVIGATION_STATES.SWITCHING ||
        state.navigationState === NAVIGATION_STATES.LOADING) {
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: NAVIGATION_ACTIONS.TIMEOUT_RESET });
      }, timeoutMs);
    }

    // Cleanup on unmount or state change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [state.navigationState, timeoutMs]);

  /**
   * Initiate navigation to a new session
   * Updates ref synchronously for immediate consistency
   *
   * @param {string|Object} session - Session object or session ID
   * @returns {Object} Navigation state after update
   */
  const navigateToSession = useCallback((session) => {
    const sessionId = typeof session === 'string' ? session : session?.id;

    if (!sessionId) {
      console.warn('[SessionNavigation] navigateToSession called with no session ID');
      return sessionStateRef.current;
    }

    // Update ref synchronously BEFORE dispatch for immediate consistency
    sessionStateRef.current = {
      ...sessionStateRef.current,
      targetSessionId: sessionId,
      navigationState: NAVIGATION_STATES.SWITCHING,
      navigationStartedAt: Date.now()
    };

    dispatch({
      type: NAVIGATION_ACTIONS.START_SWITCH,
      targetSessionId: sessionId
    });

    return sessionStateRef.current;
  }, []);

  /**
   * Signal that API loading has started for a session
   *
   * @param {string} sessionId - The session ID being loaded
   */
  const startLoading = useCallback((sessionId) => {
    if (sessionStateRef.current.targetSessionId === sessionId ||
        sessionStateRef.current.navigationState === NAVIGATION_STATES.IDLE) {
      sessionStateRef.current = {
        ...sessionStateRef.current,
        navigationState: NAVIGATION_STATES.LOADING
      };

      dispatch({
        type: NAVIGATION_ACTIONS.START_LOADING,
        sessionId
      });
    }
  }, []);

  /**
   * Signal that messages have been loaded for a session
   * This completes the navigation and transitions to ready state
   *
   * @param {string} sessionId - The session ID that was loaded
   */
  const onMessagesLoaded = useCallback((sessionId) => {
    // Update ref synchronously
    if (sessionStateRef.current.targetSessionId === sessionId) {
      sessionStateRef.current = {
        ...sessionStateRef.current,
        targetSessionId: null,
        loadedSessionId: sessionId,
        navigationState: NAVIGATION_STATES.READY,
        navigationStartedAt: null
      };
    }

    dispatch({
      type: NAVIGATION_ACTIONS.MESSAGES_LOADED,
      sessionId
    });
  }, []);

  /**
   * Signal a navigation error
   *
   * @param {string} sessionId - The session ID that failed
   * @param {string} message - Error message
   */
  const onNavigationError = useCallback((sessionId, message) => {
    dispatch({
      type: NAVIGATION_ACTIONS.NAVIGATION_ERROR,
      sessionId,
      message
    });
  }, []);

  /**
   * Reset navigation state (e.g., when navigating to new session view)
   */
  const resetNavigation = useCallback(() => {
    sessionStateRef.current = {
      targetSessionId: null,
      loadedSessionId: sessionStateRef.current.loadedSessionId,
      navigationState: NAVIGATION_STATES.IDLE,
      navigationStartedAt: null
    };

    dispatch({ type: NAVIGATION_ACTIONS.RESET });
  }, []);

  /**
   * Check if currently navigating (switching or loading)
   *
   * @returns {boolean}
   */
  const isNavigating = useCallback(() => {
    const currentState = sessionStateRef.current.navigationState;
    return currentState === NAVIGATION_STATES.SWITCHING ||
           currentState === NAVIGATION_STATES.LOADING;
  }, []);

  /**
   * Check if navigation completed to a specific session
   *
   * @param {string} sessionId - Session ID to check
   * @returns {boolean}
   */
  const isSessionReady = useCallback((sessionId) => {
    return sessionStateRef.current.loadedSessionId === sessionId &&
           sessionStateRef.current.navigationState === NAVIGATION_STATES.READY;
  }, []);

  /**
   * Get the current target session (during navigation)
   *
   * @returns {string|null}
   */
  const getTargetSessionId = useCallback(() => {
    return sessionStateRef.current.targetSessionId;
  }, []);

  /**
   * Get the currently loaded session
   *
   * @returns {string|null}
   */
  const getLoadedSessionId = useCallback(() => {
    return sessionStateRef.current.loadedSessionId;
  }, []);

  /**
   * Check if a specific session is the navigation target
   * Use this to discard stale async results
   *
   * @param {string} sessionId - Session ID to check
   * @returns {boolean}
   */
  const isCurrentTarget = useCallback((sessionId) => {
    return sessionStateRef.current.targetSessionId === sessionId;
  }, []);

  return {
    // State (for React reactivity)
    navigationState: state.navigationState,
    targetSessionId: state.targetSessionId,
    loadedSessionId: state.loadedSessionId,
    previousSessionId: state.previousSessionId,
    errorMessage: state.errorMessage,

    // Ref for synchronous access (use in effects and handlers)
    sessionStateRef,

    // Actions
    navigateToSession,
    startLoading,
    onMessagesLoaded,
    onNavigationError,
    resetNavigation,

    // Utilities
    isNavigating,
    isSessionReady,
    getTargetSessionId,
    getLoadedSessionId,
    isCurrentTarget,

    // Constants
    NAVIGATION_STATES
  };
}
