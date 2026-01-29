# Fix Plan: Inconsistent Chat Behavior - "Thinking/Processing" Flickering

## Executive Summary

This document outlines a comprehensive plan to fix the inconsistent chat behavior where the "Thinking" and "Processing" states flicker back and forth and sometimes get stuck. The root cause is a combination of circular state dependencies, race conditions in WebSocket message handling, and multiple code paths that independently modify the loading state.

---

## Problem Statement

**Symptoms:**
- "Thinking" and "Processing" indicators rapidly alternate visibility
- UI sometimes gets stuck in loading state
- Inconsistent behavior across different providers (Claude, Cursor, Codex)
- State may be incorrectly restored when switching sessions

**Impact:**
- Poor user experience
- Confusion about whether the AI is actually processing
- UI can become unresponsive or misleading

---

## Root Cause Analysis

### Primary Root Causes

#### 1. Circular State Dependencies in useEffect Hooks (Critical)
**Location:** `src/components/ChatInterface.jsx:3359-3376`

Two useEffect hooks create a feedback loop:

```javascript
// Effect 1: isLoading → processingSessions
useEffect(() => {
  if (currentSessionId && isLoading && onSessionProcessing) {
    onSessionProcessing(currentSessionId);  // Adds to processingSessions Set
  }
}, [isLoading, currentSessionId, onSessionProcessing]);

// Effect 2: processingSessions → isLoading
useEffect(() => {
  if (currentSessionId && processingSessions) {
    const shouldBeProcessing = processingSessions.has(currentSessionId);
    if (shouldBeProcessing && !isLoading) {
      setIsLoading(true);  // Can re-enable isLoading!
    }
  }
}, [currentSessionId, processingSessions]);
```

**Problem:** When `isLoading` becomes `false` (completion), Effect 2 can immediately set it back to `true` if the session is still in `processingSessions` Set, causing flickering.

#### 2. Multiple State Setters Causing Re-renders
**Location:** Various completion handlers in `ChatInterface.jsx`

```javascript
// Lines 4033-4035, 4165-4166, 4186-4188, etc.
setIsLoading(false);
setCanAbortSession(false);
setClaudeStatus(null);
```

Each `setState` call triggers a separate re-render, causing visual flickering (3 renders per completion event).

#### 3. Race Conditions Between Message Types
**Location:** `src/components/ChatInterface.jsx:4283-4335`

Multiple message types can set `isLoading(true)`:
- `session-status` (line 4289) - if `isProcessing: true`
- `claude-status` (line 4331) - always sets `isLoading(true)`
- `claude-permission-request` (line 3800) - sets `isLoading(true)`

If `session-status` or `claude-status` arrives AFTER `claude-complete`, the loading state turns back ON after being turned OFF.

#### 4. WebSocket Connection State Reset
**Location:** `src/components/ChatInterface.jsx:3378-3387`

```javascript
useEffect(() => {
  if (!isConnected && isLoading) {
    setIsLoading(false);
    setCanAbortSession(false);
    setClaudeStatus(null);
  }
}, [isConnected, isLoading]);
```

Brief WebSocket disconnections immediately reset all loading state, then reconnection may restore it inconsistently.

#### 5. Inconsistent Codex State Management
**Location:** `src/components/ChatInterface.jsx:4163-4177`

```javascript
// turn_complete sets isLoading(false) but DOES NOT call onSessionNotProcessing
if (codexData.type === 'turn_complete') {
  setIsLoading(false);  // Missing: onSessionNotProcessing(sessionId)
}
```

Session remains in `processingSessions` Set, which can trigger the restoration effect.

#### 6. handleBackgroundLifecycle Creates Duplicate State Changes
**Location:** `src/components/ChatInterface.jsx:3457-3479`

This function resets loading state for "current session" completions, creating another code path that can conflict with main completion handlers.

### Secondary Issues

#### 7. Messages Array Never Cleaned
**Location:** `src/utils/websocket.js:56`

```javascript
setMessages(prev => [...prev, data]);
```

Messages accumulate indefinitely, potentially causing performance issues and stale message processing.

#### 8. No Message Deduplication or Ordering
WebSocket messages have no sequence numbers, and out-of-order delivery can cause state inconsistencies.

#### 9. ClaudeStatus Cycling Behavior
**Location:** `src/components/ClaudeStatus.jsx:46-51`

The component intentionally cycles through action words every 3 seconds. When `isLoading` toggles rapidly, the component unmounts/remounts, resetting the cycle to "Thinking" each time.

---

## Implementation Plan

### Phase 1: Unified State Management (Critical)
**Goal:** Consolidate all loading/processing state into a single source of truth with atomic updates.

#### Task 1.1: Create a Chat State Machine
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx` (new hook extraction)

Create a custom hook `useChatSessionState` that manages all session-related state atomically:

```javascript
const useChatSessionState = () => {
  const [sessionState, setSessionState] = useReducer(sessionReducer, {
    isLoading: false,
    canAbortSession: false,
    claudeStatus: null,
    processingSessionId: null,
    completedAt: null
  });

  // State machine actions
  const startProcessing = useCallback((sessionId) => {
    setSessionState({ type: 'START_PROCESSING', sessionId });
  }, []);

  const stopProcessing = useCallback((sessionId, reason) => {
    setSessionState({ type: 'STOP_PROCESSING', sessionId, reason });
  }, []);

  // ... other actions
};
```

**Subtasks:**
- [ ] 1.1.1: Define state machine states and transitions
- [ ] 1.1.2: Implement reducer with atomic state updates
- [ ] 1.1.3: Add guards to prevent invalid state transitions
- [ ] 1.1.4: Add timestamp tracking for state changes (for race condition detection)

#### Task 1.2: Eliminate Circular Dependencies
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx:3359-3376`

Replace the two competing useEffects with a single, controlled state synchronization:

```javascript
// BEFORE: Two competing useEffects
// AFTER: Single effect with clear precedence
useEffect(() => {
  // Only restore processing state when explicitly switching to a processing session
  // AND when there's no recent completion event (use completedAt timestamp)
  if (currentSessionId && processingSessions?.has(currentSessionId)) {
    const recentlyCompleted = completedAt && (Date.now() - completedAt < 1000);
    if (!isLoading && !recentlyCompleted) {
      startProcessing(currentSessionId);
    }
  }
}, [currentSessionId]); // Intentionally exclude processingSessions from deps
```

**Subtasks:**
- [ ] 1.2.1: Add `completedAt` timestamp tracking
- [ ] 1.2.2: Refactor both useEffects into single controlled effect
- [ ] 1.2.3: Add 1-second grace period after completion before allowing restoration
- [ ] 1.2.4: Add comprehensive tests for state transitions

#### Task 1.3: Batch State Updates
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx`

Use React 18's automatic batching or manual batching for grouped updates:

```javascript
// BEFORE: 3 separate setState calls
setIsLoading(false);
setCanAbortSession(false);
setClaudeStatus(null);

// AFTER: Single atomic update via reducer
dispatch({
  type: 'SESSION_COMPLETED',
  sessionId,
  timestamp: Date.now()
});
```

**Subtasks:**
- [ ] 1.3.1: Replace individual setStates with reducer dispatch in all completion handlers
- [ ] 1.3.2: Update `claude-complete` handler (lines 4027-4073)
- [ ] 1.3.3: Update `cursor-result` handler (lines 3919-3993)
- [ ] 1.3.4: Update `codex-complete` handler (lines 4181-4223)
- [ ] 1.3.5: Update error handlers (claude-error, cursor-error, codex-error)

---

### Phase 2: Message Handling Improvements
**Goal:** Prevent race conditions and ensure consistent message processing.

#### Task 2.1: Add Message Sequence Numbers
**Status:** [ ]
**Files:** `server/index.js`, `server/claude-sdk.js`, `src/components/ChatInterface.jsx`

**Server-side:**
```javascript
class WebSocketWriter {
  constructor(ws) {
    this.ws = ws;
    this.sessionId = null;
    this.sequenceNumber = 0;  // NEW
  }

  send(data) {
    if (this.ws.readyState === 1) {
      const messageWithSeq = {
        ...data,
        _seq: ++this.sequenceNumber,
        _timestamp: Date.now()
      };
      this.ws.send(JSON.stringify(messageWithSeq));
    }
  }
}
```

**Subtasks:**
- [ ] 2.1.1: Add sequence number to WebSocketWriter class
- [ ] 2.1.2: Track sequence numbers per session on client
- [ ] 2.1.3: Ignore messages with lower sequence numbers than last processed

#### Task 2.2: Implement Completion Message Priority
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx`

Add logic to ignore status messages that arrive after a completion message:

```javascript
// Track when session completed
const completionTimestamps = useRef(new Map());

// In message handler:
case 'claude-complete': {
  completionTimestamps.current.set(sessionId, Date.now());
  // ... existing handler
  break;
}

case 'session-status': {
  const completedAt = completionTimestamps.current.get(sessionId);
  if (completedAt && Date.now() - completedAt < 5000) {
    // Ignore status for recently completed sessions
    break;
  }
  // ... existing handler
  break;
}
```

**Subtasks:**
- [ ] 2.2.1: Track completion timestamps per session
- [ ] 2.2.2: Add guard in `session-status` handler
- [ ] 2.2.3: Add guard in `claude-status` handler
- [ ] 2.2.4: Clean up old completion timestamps periodically

#### Task 2.3: Fix Codex turn_complete Handler
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx:4163-4177`

```javascript
// BEFORE:
if (codexData.type === 'turn_complete') {
  setIsLoading(false);
}

// AFTER:
if (codexData.type === 'turn_complete') {
  const turnSessionId = latestMessage.sessionId || currentSessionId;
  dispatch({ type: 'SESSION_COMPLETED', sessionId: turnSessionId });
  if (onSessionNotProcessing) {
    onSessionNotProcessing(turnSessionId);
  }
}
```

**Subtasks:**
- [ ] 2.3.1: Add `onSessionNotProcessing` call to turn_complete handler
- [ ] 2.3.2: Add `onSessionInactive` call where appropriate
- [ ] 2.3.3: Test Codex session completion flow

---

### Phase 3: WebSocket Stability Improvements
**Goal:** Prevent false state resets from connection issues.

#### Task 3.1: Add Connection State Debouncing
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx:3378-3387`

```javascript
// BEFORE: Immediate reset on disconnect
useEffect(() => {
  if (!isConnected && isLoading) {
    setIsLoading(false);
    // ...
  }
}, [isConnected, isLoading]);

// AFTER: Debounced reset with grace period
const disconnectTimeoutRef = useRef(null);

useEffect(() => {
  if (!isConnected && isLoading) {
    // Wait 5 seconds before resetting state
    disconnectTimeoutRef.current = setTimeout(() => {
      console.log('WebSocket disconnected for 5s, resetting loading state');
      dispatch({ type: 'CONNECTION_LOST' });
    }, 5000);
  } else if (isConnected) {
    // Clear timeout if reconnected
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }
  }
  return () => {
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
    }
  };
}, [isConnected, isLoading]);
```

**Subtasks:**
- [ ] 3.1.1: Add 5-second grace period before resetting on disconnect
- [ ] 3.1.2: Cancel timeout on reconnection
- [ ] 3.1.3: Add visual indicator for "reconnecting" state

#### Task 3.2: Implement Message Queue Cleanup
**Status:** [ ]
**File:** `src/utils/websocket.js`

```javascript
// BEFORE: Messages accumulate forever
websocket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setMessages(prev => [...prev, data]);
};

// AFTER: Keep only recent messages per session
const MAX_MESSAGES_PER_SESSION = 100;

websocket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setMessages(prev => {
    const updated = [...prev, data];
    // Keep only last 100 messages overall
    if (updated.length > MAX_MESSAGES_PER_SESSION * 10) {
      return updated.slice(-MAX_MESSAGES_PER_SESSION * 10);
    }
    return updated;
  });
};
```

**Subtasks:**
- [ ] 3.2.1: Add message queue size limit
- [ ] 3.2.2: Implement periodic cleanup of old messages
- [ ] 3.2.3: Add message filtering by session ID

---

### Phase 4: Consolidate Completion Handlers
**Goal:** Ensure consistent behavior across all providers.

#### Task 4.1: Create Unified Completion Handler
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx`

Extract completion logic into a single reusable function:

```javascript
const handleSessionCompletion = useCallback((sessionId, provider, options = {}) => {
  const { exitCode = 0, isError = false, errorMessage = null } = options;

  // 1. Record completion timestamp (for race condition prevention)
  completionTimestamps.current.set(sessionId, Date.now());

  // 2. Atomic state update
  dispatch({
    type: 'SESSION_COMPLETED',
    sessionId,
    exitCode,
    isError,
    errorMessage,
    timestamp: Date.now()
  });

  // 3. Send browser notification
  const notificationContent = getNotificationContent(provider, { exitCode }, selectedProject);
  sendNotificationRef.current(notificationContent.title, {
    body: notificationContent.body,
    tag: notificationContent.tag
  });

  // 4. Update session protection state
  if (sessionId) {
    onSessionInactive?.(sessionId);
    onSessionNotProcessing?.(sessionId);
  }

  // 5. Clear permission requests
  setPendingPermissionRequests([]);

  // 6. Clean up persisted messages (if successful)
  if (!isError && selectedProject) {
    safeLocalStorage.removeItem(`chat_messages_${selectedProject.name}`);
  }
}, [dispatch, selectedProject, onSessionInactive, onSessionNotProcessing]);
```

**Subtasks:**
- [ ] 4.1.1: Create `handleSessionCompletion` function
- [ ] 4.1.2: Refactor `claude-complete` to use unified handler
- [ ] 4.1.3: Refactor `cursor-result` to use unified handler
- [ ] 4.1.4: Refactor `codex-complete` to use unified handler
- [ ] 4.1.5: Refactor `session-aborted` to use unified handler

#### Task 4.2: Create Unified Error Handler
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx`

```javascript
const handleSessionError = useCallback((sessionId, provider, error) => {
  handleSessionCompletion(sessionId, provider, {
    isError: true,
    errorMessage: error
  });

  setChatMessages(prev => [...prev, {
    type: 'error',
    content: `${provider} error: ${error}`,
    timestamp: new Date()
  }]);
}, [handleSessionCompletion, setChatMessages]);
```

**Subtasks:**
- [ ] 4.2.1: Create `handleSessionError` function
- [ ] 4.2.2: Refactor `claude-error` to use unified handler
- [ ] 4.2.3: Refactor `cursor-error` to use unified handler
- [ ] 4.2.4: Refactor `codex-error` to use unified handler

---

### Phase 5: Backend Improvements
**Goal:** Improve message reliability and ordering.

#### Task 5.1: Add Session Status Tracking on Backend
**Status:** [ ]
**Files:** `server/index.js`, `server/claude-sdk.js`

Track session completion state on backend to avoid sending stale status messages:

```javascript
// In claude-sdk.js
const completedSessions = new Set();

async function queryClaudeSDK(command, options, ws) {
  // ... existing code ...

  // On completion:
  completedSessions.add(capturedSessionId);
  ws.send({
    type: 'claude-complete',
    sessionId: capturedSessionId,
    exitCode: 0
  });
}

function isClaudeSDKSessionActive(sessionId) {
  // Check both active sessions AND that it hasn't completed
  const session = getSession(sessionId);
  return session && session.status === 'active' && !completedSessions.has(sessionId);
}
```

**Subtasks:**
- [ ] 5.1.1: Track completed sessions in claude-sdk.js
- [ ] 5.1.2: Track completed sessions in cursor-cli.js
- [ ] 5.1.3: Track completed sessions in openai-codex.js
- [ ] 5.1.4: Update `isXXXSessionActive` functions to check completion status

#### Task 5.2: Implement Message Ordering
**Status:** [ ]
**File:** `server/index.js`

Add timestamp and sequence to all WebSocket messages:

```javascript
class WebSocketWriter {
  constructor(ws) {
    this.ws = ws;
    this.sessionId = null;
    this.sequenceNumber = 0;
    this.messageTimestamps = new Map();
  }

  send(data) {
    if (this.ws.readyState === 1) {
      const seq = ++this.sequenceNumber;
      const message = {
        ...data,
        _meta: {
          seq,
          timestamp: Date.now(),
          sessionId: this.sessionId
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

**Subtasks:**
- [ ] 5.2.1: Add `_meta` field to all WebSocket messages
- [ ] 5.2.2: Include sequence number and timestamp
- [ ] 5.2.3: Update client to handle `_meta` field

---

### Phase 6: UI Improvements
**Goal:** Improve visual feedback and prevent confusing state displays.

#### Task 6.1: Debounce Loading Indicator
**Status:** [ ]
**File:** `src/components/ClaudeStatus.jsx`

Add minimum display time to prevent rapid flickering:

```javascript
function ClaudeStatus({ status, onAbort, isLoading, provider }) {
  const [showIndicator, setShowIndicator] = useState(false);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    if (isLoading) {
      // Show immediately when loading starts
      setShowIndicator(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else {
      // Delay hiding by 500ms to prevent flicker
      hideTimeoutRef.current = setTimeout(() => {
        setShowIndicator(false);
      }, 500);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isLoading]);

  if (!showIndicator) return null;
  // ... rest of component
}
```

**Subtasks:**
- [ ] 6.1.1: Add 500ms hide delay to ClaudeStatus
- [ ] 6.1.2: Add smooth fade-out animation
- [ ] 6.1.3: Preserve elapsed time across brief state changes

#### Task 6.2: Add "Stuck" Detection and Recovery
**Status:** [ ]
**File:** `src/components/ChatInterface.jsx`

Add detection for sessions that appear stuck:

```javascript
useEffect(() => {
  if (!isLoading) return;

  // If loading for more than 5 minutes without any messages, consider stuck
  const stuckTimeout = setTimeout(() => {
    console.warn('Session appears stuck, offering recovery option');
    setShowStuckRecovery(true);
  }, 5 * 60 * 1000);

  return () => clearTimeout(stuckTimeout);
}, [isLoading, lastMessageTimestamp]);
```

**Subtasks:**
- [ ] 6.2.1: Track last message timestamp
- [ ] 6.2.2: Add 5-minute timeout for stuck detection
- [ ] 6.2.3: Add UI for "Force Reset" option
- [ ] 6.2.4: Implement force reset functionality

---

### Phase 7: Testing
**Goal:** Ensure fixes work correctly and prevent regressions.

#### Task 7.1: Unit Tests for State Machine
**Status:** [ ]
**File:** `tests/chatSessionState.test.js` (new file)

**Subtasks:**
- [ ] 7.1.1: Test START_PROCESSING transition
- [ ] 7.1.2: Test STOP_PROCESSING transition
- [ ] 7.1.3: Test race condition prevention (completion → status)
- [ ] 7.1.4: Test debouncing behavior
- [ ] 7.1.5: Test provider-specific transitions

#### Task 7.2: Integration Tests for Message Flow
**Status:** [ ]
**File:** `tests/messageFlow.test.js` (new file)

**Subtasks:**
- [ ] 7.2.1: Test normal message flow (start → response → complete)
- [ ] 7.2.2: Test out-of-order message handling
- [ ] 7.2.3: Test WebSocket reconnection during processing
- [ ] 7.2.4: Test multi-session interference prevention
- [ ] 7.2.5: Test error recovery flows

#### Task 7.3: E2E Tests
**Status:** [ ]
**File:** `tests/chat.spec.js`

**Subtasks:**
- [ ] 7.3.1: Test that loading indicator appears on message send
- [ ] 7.3.2: Test that loading indicator disappears on completion
- [ ] 7.3.3: Test that loading indicator doesn't flicker
- [ ] 7.3.4: Test session switching during processing
- [ ] 7.3.5: Test abort functionality

---

## Implementation Order

```
Phase 1 (Critical) ──┬── Task 1.1: State Machine
                     ├── Task 1.2: Eliminate Circular Deps
                     └── Task 1.3: Batch State Updates

Phase 2 ─────────────┬── Task 2.1: Message Sequence Numbers
                     ├── Task 2.2: Completion Priority
                     └── Task 2.3: Fix Codex Handler

Phase 3 ─────────────┬── Task 3.1: Connection Debouncing
                     └── Task 3.2: Message Queue Cleanup

Phase 4 ─────────────┬── Task 4.1: Unified Completion Handler
                     └── Task 4.2: Unified Error Handler

Phase 5 ─────────────┬── Task 5.1: Backend Status Tracking
                     └── Task 5.2: Message Ordering

Phase 6 ─────────────┬── Task 6.1: Debounce Loading Indicator
                     └── Task 6.2: Stuck Detection

Phase 7 ─────────────┬── Task 7.1: Unit Tests
                     ├── Task 7.2: Integration Tests
                     └── Task 7.3: E2E Tests
```

---

## Dependencies

| Task | Depends On |
|------|------------|
| 1.2 | 1.1 |
| 1.3 | 1.1 |
| 2.2 | 1.3 |
| 2.3 | 1.3 |
| 4.1 | 1.1, 1.3 |
| 4.2 | 4.1 |
| 6.1 | 1.1 |
| 6.2 | 1.1, 4.1 |
| 7.1 | 1.1 |
| 7.2 | 2.1, 2.2 |
| 7.3 | All previous |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regression in existing functionality | Medium | High | Comprehensive E2E tests |
| Performance impact from state machine | Low | Medium | Benchmark before/after |
| Breaking changes to message format | Low | High | Version message protocol |
| Incomplete provider coverage | Medium | Medium | Test all 3 providers |

---

## Success Criteria

1. **No flickering:** Loading indicator should not flash on/off rapidly
2. **No stuck states:** UI should never remain in loading state indefinitely without activity
3. **Consistent behavior:** All three providers (Claude, Cursor, Codex) behave identically
4. **Graceful recovery:** Connection loss should not cause permanent state corruption
5. **Performance:** No noticeable lag when switching sessions

---

## Files to Modify

### Critical Path (Phase 1)
- `src/components/ChatInterface.jsx` - Major refactoring
- `src/components/ClaudeStatus.jsx` - Minor updates
- `src/App.jsx` - Minor updates to callbacks

### Supporting Changes (Phases 2-6)
- `src/utils/websocket.js` - Message handling improvements
- `server/index.js` - WebSocket improvements
- `server/claude-sdk.js` - Session tracking
- `server/cursor-cli.js` - Session tracking
- `server/openai-codex.js` - Session tracking

### New Files
- `src/hooks/useChatSessionState.js` - New state machine hook
- `tests/chatSessionState.test.js` - Unit tests
- `tests/messageFlow.test.js` - Integration tests

---

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1 | 2-3 days | P0 - Critical |
| Phase 2 | 1-2 days | P0 - Critical |
| Phase 3 | 1 day | P1 - High |
| Phase 4 | 1 day | P1 - High |
| Phase 5 | 1 day | P2 - Medium |
| Phase 6 | 0.5 days | P2 - Medium |
| Phase 7 | 2 days | P1 - High |

**Total estimated effort:** 8-10 days

---

## Quick Wins (Immediate Relief)

If full implementation is not immediately feasible, these quick fixes can provide partial relief:

1. **Add 500ms debounce to ClaudeStatus hide** (30 min)
2. **Add completion timestamp tracking and guards** (2 hours)
3. **Fix Codex turn_complete missing onSessionNotProcessing** (30 min)
4. **Add 5-second grace period for WebSocket disconnect** (1 hour)

These quick wins should reduce flickering significantly while the full solution is implemented.
