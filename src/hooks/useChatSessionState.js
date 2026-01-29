/**
 * useChatSessionState.js - Unified Chat Session State Machine
 *
 * This hook manages all loading/processing state atomically using useReducer,
 * preventing race conditions and flickering from multiple competing state updates.
 *
 * Key features:
 * - Single source of truth for session processing state
 * - Atomic state updates via reducer dispatch
 * - Completion timestamp tracking to prevent stale status messages from re-enabling loading
 * - Guards against invalid state transitions
 */

import { useReducer, useCallback, useRef } from 'react';

// Action types
export const SESSION_ACTIONS = {
  START_PROCESSING: 'START_PROCESSING',
  STOP_PROCESSING: 'STOP_PROCESSING',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SESSION_ERROR: 'SESSION_ERROR',
  UPDATE_STATUS: 'UPDATE_STATUS',
  CONNECTION_LOST: 'CONNECTION_LOST',
  RESET_STATE: 'RESET_STATE',
  RESTORE_PROCESSING: 'RESTORE_PROCESSING',
  // For session switching - resets state but doesn't prevent restore
  RESET_FOR_SESSION_SWITCH: 'RESET_FOR_SESSION_SWITCH',
  // Legacy actions for backward compatibility
  SET_IS_LOADING: 'SET_IS_LOADING',
  SET_CAN_ABORT: 'SET_CAN_ABORT',
  SET_CLAUDE_STATUS: 'SET_CLAUDE_STATUS'
};

// Initial state
const initialState = {
  isLoading: false,
  canAbortSession: false,
  claudeStatus: null,
  processingSessionId: null,
  completedAt: null,
  lastStateChangeAt: null
};

/**
 * State machine reducer for chat session state
 * All state updates are atomic - no partial updates
 */
function sessionReducer(state, action) {
  const now = Date.now();

  switch (action.type) {
    case SESSION_ACTIONS.START_PROCESSING: {
      // Guard: Don't start if recently completed (within 1 second)
      // This prevents stale status messages from re-enabling loading
      if (state.completedAt && (now - state.completedAt < 1000)) {
        console.log('[SessionState] Ignoring START_PROCESSING - recently completed');
        return state;
      }

      return {
        ...state,
        isLoading: true,
        canAbortSession: true,
        processingSessionId: action.sessionId || state.processingSessionId,
        claudeStatus: action.status || state.claudeStatus,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.STOP_PROCESSING: {
      // Guard: Only stop if we're actually processing
      if (!state.isLoading) {
        return state;
      }

      // Guard: Only stop if sessionId matches (or no sessionId specified)
      if (action.sessionId && state.processingSessionId &&
          action.sessionId !== state.processingSessionId) {
        console.log('[SessionState] Ignoring STOP_PROCESSING - session mismatch');
        return state;
      }

      return {
        ...state,
        isLoading: false,
        canAbortSession: false,
        claudeStatus: null,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.SESSION_COMPLETED: {
      // Record completion timestamp to prevent race conditions
      return {
        ...state,
        isLoading: false,
        canAbortSession: false,
        claudeStatus: null,
        processingSessionId: null,
        completedAt: now,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.SESSION_ERROR: {
      // Same as completed but marks error
      return {
        ...state,
        isLoading: false,
        canAbortSession: false,
        claudeStatus: null,
        completedAt: now,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.UPDATE_STATUS: {
      // Guard: Don't update status if recently completed
      if (state.completedAt && (now - state.completedAt < 1000)) {
        console.log('[SessionState] Ignoring UPDATE_STATUS - recently completed');
        return state;
      }

      // Only update claudeStatus, don't change loading state
      return {
        ...state,
        claudeStatus: action.status,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.CONNECTION_LOST: {
      // Only reset if we were loading
      if (!state.isLoading) {
        return state;
      }

      return {
        ...state,
        isLoading: false,
        canAbortSession: false,
        claudeStatus: null,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.RESTORE_PROCESSING: {
      // Guard: Don't restore if recently completed (within 1 second)
      if (state.completedAt && (now - state.completedAt < 1000)) {
        console.log('[SessionState] Ignoring RESTORE_PROCESSING - recently completed');
        return state;
      }

      // Guard: Don't restore if already loading
      if (state.isLoading) {
        return state;
      }

      return {
        ...state,
        isLoading: true,
        canAbortSession: true,
        processingSessionId: action.sessionId,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.RESET_STATE: {
      return {
        ...initialState,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.RESET_FOR_SESSION_SWITCH: {
      // Reset state but DON'T set completedAt - allows restore to work
      return {
        ...state,
        isLoading: false,
        canAbortSession: false,
        claudeStatus: null,
        processingSessionId: null,
        // Don't set completedAt - this is a switch, not a completion
        lastStateChangeAt: now
      };
    }

    // Legacy setters for backward compatibility
    case SESSION_ACTIONS.SET_IS_LOADING: {
      // Guard: Don't set loading to true if recently completed
      if (action.value && state.completedAt && (now - state.completedAt < 1000)) {
        console.log('[SessionState] Ignoring SET_IS_LOADING(true) - recently completed');
        return state;
      }
      return {
        ...state,
        isLoading: action.value,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.SET_CAN_ABORT: {
      return {
        ...state,
        canAbortSession: action.value,
        lastStateChangeAt: now
      };
    }

    case SESSION_ACTIONS.SET_CLAUDE_STATUS: {
      // Guard: Don't update status if recently completed
      if (action.value && state.completedAt && (now - state.completedAt < 1000)) {
        console.log('[SessionState] Ignoring SET_CLAUDE_STATUS - recently completed');
        return state;
      }
      return {
        ...state,
        claudeStatus: action.value,
        lastStateChangeAt: now
      };
    }

    default:
      console.warn('[SessionState] Unknown action type:', action.type);
      return state;
  }
}

/**
 * Custom hook for managing chat session state
 * @returns {Object} State and action dispatchers
 */
export function useChatSessionState() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  // Track completion timestamps per session for race condition prevention
  const completionTimestamps = useRef(new Map());

  // Action creators with useCallback for stable references
  const startProcessing = useCallback((sessionId, status = null) => {
    dispatch({
      type: SESSION_ACTIONS.START_PROCESSING,
      sessionId,
      status
    });
  }, []);

  const stopProcessing = useCallback((sessionId) => {
    dispatch({
      type: SESSION_ACTIONS.STOP_PROCESSING,
      sessionId
    });
  }, []);

  const sessionCompleted = useCallback((sessionId) => {
    // Record completion timestamp for this session
    if (sessionId) {
      completionTimestamps.current.set(sessionId, Date.now());

      // Clean up old timestamps (older than 30 seconds)
      const cutoff = Date.now() - 30000;
      for (const [id, timestamp] of completionTimestamps.current.entries()) {
        if (timestamp < cutoff) {
          completionTimestamps.current.delete(id);
        }
      }
    }

    dispatch({
      type: SESSION_ACTIONS.SESSION_COMPLETED,
      sessionId
    });
  }, []);

  const sessionError = useCallback((sessionId) => {
    if (sessionId) {
      completionTimestamps.current.set(sessionId, Date.now());
    }

    dispatch({
      type: SESSION_ACTIONS.SESSION_ERROR,
      sessionId
    });
  }, []);

  const updateStatus = useCallback((status) => {
    dispatch({
      type: SESSION_ACTIONS.UPDATE_STATUS,
      status
    });
  }, []);

  const connectionLost = useCallback(() => {
    dispatch({ type: SESSION_ACTIONS.CONNECTION_LOST });
  }, []);

  const restoreProcessing = useCallback((sessionId) => {
    // Check if this session recently completed
    const completedAt = completionTimestamps.current.get(sessionId);
    if (completedAt && (Date.now() - completedAt < 5000)) {
      console.log('[SessionState] Not restoring - session recently completed');
      return false;
    }

    dispatch({
      type: SESSION_ACTIONS.RESTORE_PROCESSING,
      sessionId
    });
    return true;
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: SESSION_ACTIONS.RESET_STATE });
  }, []);

  // Reset for session switching - doesn't prevent restore
  const resetForSessionSwitch = useCallback(() => {
    dispatch({ type: SESSION_ACTIONS.RESET_FOR_SESSION_SWITCH });
  }, []);

  // Legacy setters for backward compatibility
  // These have guards to prevent race conditions
  const setIsLoading = useCallback((value) => {
    dispatch({ type: SESSION_ACTIONS.SET_IS_LOADING, value });
  }, []);

  const setCanAbortSession = useCallback((value) => {
    dispatch({ type: SESSION_ACTIONS.SET_CAN_ABORT, value });
  }, []);

  const setClaudeStatus = useCallback((value) => {
    dispatch({ type: SESSION_ACTIONS.SET_CLAUDE_STATUS, value });
  }, []);

  // Check if a session recently completed (for external use)
  const hasRecentlyCompleted = useCallback((sessionId) => {
    const completedAt = completionTimestamps.current.get(sessionId);
    return completedAt && (Date.now() - completedAt < 5000);
  }, []);

  return {
    // State
    isLoading: state.isLoading,
    canAbortSession: state.canAbortSession,
    claudeStatus: state.claudeStatus,
    processingSessionId: state.processingSessionId,
    completedAt: state.completedAt,

    // Actions
    startProcessing,
    stopProcessing,
    sessionCompleted,
    sessionError,
    updateStatus,
    connectionLost,
    restoreProcessing,
    resetState,
    resetForSessionSwitch,

    // Legacy setters (with guards for race condition prevention)
    setIsLoading,
    setCanAbortSession,
    setClaudeStatus,

    // Utilities
    hasRecentlyCompleted,
    completionTimestamps
  };
}
