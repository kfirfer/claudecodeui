# Fix Inconsistent Navigation Between Chats - Implementation Plan

## Validation Status

**Last Validated**: 2025-01-31
**Validated Against**: Current codebase

| Section | Status | Notes |
|---------|--------|-------|
| Line number references | ✅ Verified | All code locations confirmed accurate |
| Root cause analysis | ✅ Verified | All 6 issues confirmed in codebase |
| React best practices | ✅ Verified | Confirmed via React official docs |
| Existing hooks | ⚠️ Updated | Added note about `useChatSessionState` hook |
| Test file locations | ⚠️ Updated | Some navigation tests already exist |

---

## Executive Summary

This document outlines a comprehensive plan to fix the inconsistent chat session navigation issue where messages sometimes fail to load correctly or don't load at all until the page is refreshed. The root cause analysis identified multiple race conditions and timing issues in the session state management architecture.

---

## Problem Statement

**Symptom**: When navigating between chat sessions via the Sidebar, messages occasionally:
1. Don't load at all (blank chat view)
2. Show messages from the wrong session
3. Require a page refresh to display correctly

**Impact**: Users experience data loss perception and must manually refresh the page to continue working.

---

## Root Cause Analysis

### Architecture Overview

The session navigation system uses a complex multi-ref approach in `ChatInterface.jsx`:

| Ref | Purpose | Risk |
|-----|---------|------|
| `activeSessionIdRef` | WebSocket message filtering | Wrong session ID blocks messages |
| `messagesLoadedForSessionRef` | Tracks loaded session | If not cleared, API won't reload |
| `loadingTargetSessionRef` | Prevents stale async data | If not checked, wrong messages shown |
| `sessionSwitchInProgressRef` | Blocks messages during switch | If stuck, messages permanently blocked |
| `apiCallInProgressRef` | Prevents duplicate API calls | If stuck, prevents any API calls |
| `hasActiveSessionMessagesRef` | Prevents clearing active messages | If true, API messages skipped |

### Identified Issues

#### Issue 1: React State Batching Race Condition
**Location**: `App.jsx:614-615`, `ChatInterface.jsx:2185-2209`

```javascript
// App.jsx:614-615
setForceSessionSwitchCounter(prev => prev + 1);
setSelectedSession(session);
```

When React batches these updates, the `useLayoutEffect` at line 2185 runs with the **new** counter but potentially the **old** `selectedSession?.id`, causing `activeSessionIdRef` to be set incorrectly.

**Evidence**: The effect uses `selectedSession?.id` on line 2191:
```javascript
activeSessionIdRef.current = selectedSession?.id || null;
```

#### Issue 2: Missing Cleanup in Async loadMessages Effect
**Location**: `ChatInterface.jsx:3369-3620`

The `loadMessages` async effect lacks proper React cleanup pattern. React's recommended pattern uses `let ignore = false` with cleanup, but the current implementation only uses refs for tracking:

```javascript
// Current approach (problematic)
loadingTargetSessionRef.current = targetSessionId;
// ... async API call ...
if (loadingTargetSessionRef.current !== targetSessionId) return;
```

The issue: If the effect re-runs during an async call, the ref is overwritten but the previous async call is still in progress and checking against the **updated** ref value.

#### Issue 3: sessionSwitchInProgressRef Gets Stuck
**Location**: `ChatInterface.jsx:4001-4008`

The flag blocks WebSocket messages during session switch:
```javascript
if (sessionSwitchInProgressRef.current && !lifecycleMessageTypes.has(...)) {
  return; // Messages blocked
}
```

If `loadMessages` throws an error or doesn't complete properly, this flag remains `true` forever, permanently blocking messages.

#### Issue 4: Dependency Array Inconsistencies
**Location**: `ChatInterface.jsx:3620`

The `loadMessages` effect has an eslint-disable comment for intentionally omitted dependencies:
```javascript
// eslint-disable-next-line react-hooks/exhaustive-deps -- currentSessionId, loadSessionMessages, sendMessage, ws are used inside but intentionally excluded
```

This pattern is fragile because `currentSessionId` is used in multiple conditions inside the effect but isn't in the dependency array, leading to stale closures.

#### Issue 5: Multiple Effects Competing for Session State
**Location**: Multiple effects across `ChatInterface.jsx`

There are **5 different effects** that modify session-related state:
1. Line 2136: `currentSessionId` sync effect (`useEffect`)
2. Line 2150: `activeSessionIdRef` sync effect (`useLayoutEffect`)
3. Line 2176: `isPendingSessionRef` sync effect (`useLayoutEffect`)
4. Line 2185: Force session switch effect (`useLayoutEffect`)
5. Line 2215: Session change reset effect (`useEffect`)
6. Line 3369: Main `loadMessages` effect (`useEffect`)

These effects can run in unpredictable orders during React's concurrent rendering.

#### Issue 6: currentSessionId State Lag
**Location**: `ChatInterface.jsx:2136-2144`

```javascript
useEffect(() => {
  if (sessionId && sessionId !== currentSessionId) {
    setCurrentSessionId(sessionId); // Async update
  }
}, [selectedSession?.id, currentSessionId]);
```

`currentSessionId` updates are asynchronous, but the `loadMessages` effect uses it in conditions at line 3446:
```javascript
} else if (currentSessionId === null) {
```

This creates a timing gap where `currentSessionId` hasn't caught up with `selectedSession.id`.

---

## Solution Design

### Existing Infrastructure to Build Upon

**Important**: The codebase already has a `useChatSessionState` hook (`src/hooks/useChatSessionState.js`) that manages session *processing* state (loading, aborting, completion). The new `useSessionNavigation` hook should complement this by managing session *navigation* state. Consider:

1. **Option A**: Create separate `useSessionNavigation` hook (as planned) - keeps concerns separate
2. **Option B**: Extend `useChatSessionState` to include navigation state - single source of truth

**Recommendation**: Option A is preferred to maintain separation of concerns (processing vs navigation).

### Principle 1: Single Source of Truth

Consolidate session state management into a single ref that is updated synchronously and atomically during navigation.

### Principle 2: Proper Async Cleanup

Implement React's recommended `ignore` flag pattern for all async effects.

### Principle 3: Defensive Programming

Add timeout-based failsafes to prevent permanently stuck flags.

### Principle 4: State Machine Approach

Treat session navigation as a state machine with explicit states:
- `idle` - No navigation in progress
- `switching` - Session switch initiated
- `loading` - API call in progress
- `ready` - Messages loaded

---

## Implementation Plan

### Phase 1: Session State Consolidation [ ]
**Goal**: Create a single, authoritative session state management system

#### Task 1.1: Create useSessionNavigation Hook [ ]
**File**: `src/hooks/useSessionNavigation.js` (new file)

Create a custom hook that encapsulates all session navigation logic:

**Subtasks**:
- [ ] 1.1.1: Define navigation state machine with states: `idle`, `switching`, `loading`, `ready`, `error`
- [ ] 1.1.2: Create single `sessionStateRef` that atomically tracks: `targetSessionId`, `loadedSessionId`, `navigationState`, `timestamp`
- [ ] 1.1.3: Implement `navigateToSession(session)` function that synchronously updates all refs
- [ ] 1.1.4: Implement `onMessagesLoaded(sessionId)` callback for API completion
- [ ] 1.1.5: Add 30-second timeout failsafe to auto-reset stuck navigation states
- [ ] 1.1.6: Export hook with navigation functions and current state

**Deliverable**: New `useSessionNavigation` hook with unified state management

#### Task 1.2: Add Session Navigation Context [ ]
**File**: `src/contexts/SessionNavigationContext.jsx` (new file)

**Subtasks**:
- [ ] 1.2.1: Create React context for session navigation
- [ ] 1.2.2: Wrap `useSessionNavigation` hook in provider
- [ ] 1.2.3: Export `useSessionNavigationContext` consumer hook
- [ ] 1.2.4: Add TypeScript-like JSDoc types for all exports

**Deliverable**: Context provider for cross-component session state access

---

### Phase 2: Fix App.jsx Session Selection [ ]
**Goal**: Ensure atomic session switch signaling

#### Task 2.1: Refactor handleSessionSelect [ ]
**File**: `src/App.jsx`
**Location**: Lines 612-643 (actual handleSessionSelect function body)

**Subtasks**:
- [ ] 2.1.1: Pass session ID directly via counter update instead of relying on state sync
- [ ] 2.1.2: Use React's `flushSync` to force synchronous state update for critical navigation
- [ ] 2.1.3: Add session navigation context consumption
- [ ] 2.1.4: Update `handleNewSession` to use same atomic pattern
- [ ] 2.1.5: Add `import { flushSync } from 'react-dom';` at top of file (not currently imported)

**Code Change**:
```javascript
// Add import at top of file
import { flushSync } from 'react-dom';

// Before (lines 614-615)
setForceSessionSwitchCounter(prev => prev + 1);
setSelectedSession(session);

// After
flushSync(() => {
  setSelectedSession(session);
  setForceSessionSwitchCounter(prev => ({
    count: prev.count + 1,
    targetSessionId: session.id  // Include target in counter object
  }));
});
```

**⚠️ Performance Note**: Per React docs, `flushSync` can significantly hurt performance and should be used as a last resort. Consider alternative approaches first:
1. **Alternative 1**: Pass `targetSessionId` in counter object without flushSync (simpler, may work)
2. **Alternative 2**: Use a ref to store targetSessionId synchronously before state updates

Test Alternative 1 first before resorting to `flushSync`.

**Deliverable**: Atomic session selection with guaranteed ordering

---

### Phase 3: Fix ChatInterface loadMessages Effect [ ]
**Goal**: Implement proper async cleanup and race condition prevention

#### Task 3.1: Implement Proper Async Cleanup Pattern [ ]
**File**: `src/components/ChatInterface.jsx`
**Location**: Lines 3369-3620

**Subtasks**:
- [ ] 3.1.1: Add `ignore` flag with cleanup function per React best practices
- [ ] 3.1.2: Check `ignore` flag after every `await` call
- [ ] 3.1.3: Remove redundant `loadingTargetSessionRef` checks (replaced by `ignore` flag)
- [ ] 3.1.4: Add try-finally block to ensure `sessionSwitchInProgressRef` is always reset

**Code Pattern**:
```javascript
useEffect(() => {
  let ignore = false;

  const loadMessages = async () => {
    try {
      // ... setup
      const messages = await loadSessionMessages(...);

      if (ignore) return; // Check after every await

      // ... set state
    } finally {
      // ALWAYS reset flags, even on error
      if (!ignore) {
        sessionSwitchInProgressRef.current = false;
      }
    }
  };

  loadMessages();

  return () => {
    ignore = true;
  };
}, [dependencies]);
```

**Deliverable**: Race-condition-free message loading

#### Task 3.2: Fix Dependency Array [ ]
**File**: `src/components/ChatInterface.jsx`
**Location**: Line 3620

**Subtasks**:
- [ ] 3.2.1: Move `currentSessionId` usage outside effect or add to dependencies
- [ ] 3.2.2: Use refs for values that shouldn't trigger re-runs
- [ ] 3.2.3: Remove eslint-disable comment after proper fix
- [ ] 3.2.4: Document why each dependency is included

**Deliverable**: Correct dependency array without eslint overrides

---

### Phase 4: Consolidate Session Effects [ ]
**Goal**: Reduce from 5+ effects to 2-3 well-defined effects

#### Task 4.1: Merge Session ID Sync Effects [ ]
**File**: `src/components/ChatInterface.jsx`
**Location**: Lines 2136-2209

**Subtasks**:
- [ ] 4.1.1: Combine `currentSessionId` sync (2136), `activeSessionIdRef` sync (2150), and force switch effect (2185) into single `useLayoutEffect`
- [ ] 4.1.2: Ensure all ref updates happen atomically in one effect
- [ ] 4.1.3: Use the session navigation hook for state management
- [ ] 4.1.4: Remove session change reset effect (2215) - redundant with consolidated effect

**Before** (5 effects):
```javascript
useEffect(() => { /* currentSessionId sync */ }, [...]);
useLayoutEffect(() => { /* activeSessionIdRef sync */ }, [...]);
useLayoutEffect(() => { /* force session switch */ }, [...]);
useEffect(() => { /* session change reset */ }, [...]);
useEffect(() => { /* loadMessages */ }, [...]);
```

**After** (2 effects):
```javascript
useLayoutEffect(() => { /* unified session state sync */ }, [...]);
useEffect(() => { /* loadMessages with proper cleanup */ }, [...]);
```

**Deliverable**: Simplified, predictable effect ordering

---

### Phase 5: Add Defensive Timeout Failsafes [ ]
**Goal**: Prevent permanently stuck states

#### Task 5.1: Add Timeout Recovery for sessionSwitchInProgressRef [ ]
**File**: `src/components/ChatInterface.jsx`

**Subtasks**:
- [ ] 5.1.1: Add 10-second timeout that auto-resets `sessionSwitchInProgressRef`
- [ ] 5.1.2: Log warning when timeout triggers (indicates bug to investigate)
- [ ] 5.1.3: Clear timeout on successful completion
- [ ] 5.1.4: Add same pattern for `apiCallInProgressRef`

**Code Pattern**:
```javascript
useLayoutEffect(() => {
  if (sessionSwitchInProgressRef.current) {
    const timeoutId = setTimeout(() => {
      console.warn('[Session] Navigation timeout - auto-resetting stuck flag');
      sessionSwitchInProgressRef.current = false;
    }, 10000);

    return () => clearTimeout(timeoutId);
  }
}, [forceSessionSwitchCounter]);
```

**Deliverable**: Self-healing navigation system

---

### Phase 6: WebSocket Message Filtering Improvements [ ]
**Goal**: Ensure messages are never incorrectly blocked

#### Task 6.1: Simplify WebSocket Session Filtering [ ]
**File**: `src/components/ChatInterface.jsx`
**Location**: Lines 3880-4008

**Subtasks**:
- [ ] 6.1.1: Use session navigation hook for current session ID
- [ ] 6.1.2: Reduce complex `shouldBypassSessionFilter` logic
- [ ] 6.1.3: Add clear logging for blocked messages (debug mode)
- [ ] 6.1.4: Handle edge case where `activeSessionIdRef` is null during transition

**Deliverable**: Reliable WebSocket message routing

#### Task 6.2: Add Message Queueing During Navigation [ ]
**File**: `src/components/ChatInterface.jsx`

**Subtasks**:
- [ ] 6.2.1: Instead of dropping messages during `sessionSwitchInProgressRef`, queue them
- [ ] 6.2.2: Process queued messages after navigation completes
- [ ] 6.2.3: Discard queue if session switch completed to different session
- [ ] 6.2.4: Add queue size limit (50 messages) to prevent memory issues

**Deliverable**: No dropped messages during navigation

---

### Phase 7: Testing [ ]
**Goal**: Comprehensive test coverage for session navigation

**Note**: Some session navigation E2E tests already exist in `tests/project-workflow.spec.js`:
- `multiple sessions with navigation during AI thinking` (line 448)
- `session URL navigation loads correct session` (line 950)

These tests verify basic navigation works but do NOT test race conditions or rapid switching.

#### Task 7.1: Add Unit Tests for useSessionNavigation Hook [ ]
**File**: `tests/hooks/useSessionNavigation.test.js` (new file)

**Subtasks**:
- [ ] 7.1.1: Test state transitions: idle -> switching -> loading -> ready
- [ ] 7.1.2: Test timeout recovery
- [ ] 7.1.3: Test rapid navigation (switch before load completes)
- [ ] 7.1.4: Test error state recovery

**Deliverable**: Unit test coverage for navigation hook

#### Task 7.2: Enhance E2E Tests for Session Navigation [ ]
**File**: `tests/project-workflow.spec.js` (existing file - add new tests)

**Subtasks**:
- [ ] 7.2.1: Add test for rapid session switching (click 5 sessions quickly) - verify no blank screens
- [ ] 7.2.2: Add test for switching back to same session - verify messages reload
- [ ] 7.2.3: Add test for navigation during active streaming - verify graceful handling
- [ ] 7.2.4: Add console error assertions to existing navigation tests
- [ ] 7.2.5: Add test for stuck navigation recovery (if timeout triggers)

**Deliverable**: Enhanced E2E test coverage for navigation edge cases

#### Task 7.3: Add Integration Tests for WebSocket Filtering [ ]
**File**: `tests/project-workflow.spec.js` (add to existing file per project guidelines)

**Subtasks**:
- [ ] 7.3.1: Test messages arrive for correct session only (no cross-session bleed)
- [ ] 7.3.2: Test messages queued during navigation
- [ ] 7.3.3: Test session-created event handling with rapid navigation
- [ ] 7.3.4: Test background session completion notifications

**Deliverable**: Integration test coverage for WebSocket routing

---

### Phase 8: Code Cleanup and Documentation [ ]
**Goal**: Ensure maintainability

#### Task 8.1: Remove Redundant Code [ ]
**File**: `src/components/ChatInterface.jsx`

**Subtasks**:
- [ ] 8.1.1: Remove unused refs after consolidation
- [ ] 8.1.2: Remove duplicate session ID tracking
- [ ] 8.1.3: Clean up eslint-disable comments
- [ ] 8.1.4: Remove debug console.log statements (keep warnings/errors)

**Deliverable**: Cleaner, more maintainable code

#### Task 8.2: Update Architecture Documentation [ ]
**File**: `CLAUDE.md`

**Subtasks**:
- [ ] 8.2.1: Update Session State Management Architecture section
- [ ] 8.2.2: Document new `useSessionNavigation` hook
- [ ] 8.2.3: Update refs table with new simplified structure
- [ ] 8.2.4: Add troubleshooting guide for session navigation issues

**Deliverable**: Updated documentation

---

## Implementation Order and Dependencies

```
Phase 1 (Foundation)
├── Task 1.1 ──────────────────────────────────────────────────────┐
└── Task 1.2 (depends on 1.1) ─────────────────────────────────────┤
                                                                   │
Phase 2 (App.jsx)                                                  │
└── Task 2.1 (depends on 1.2) ─────────────────────────────────────┤
                                                                   │
Phase 3 (loadMessages)                                             │
├── Task 3.1 (can run parallel with Phase 2) ──────────────────────┤
└── Task 3.2 (depends on 3.1) ─────────────────────────────────────┤
                                                                   │
Phase 4 (Effect Consolidation)                                     │
└── Task 4.1 (depends on 1.2, 3.2) ────────────────────────────────┤
                                                                   │
Phase 5 (Timeouts)                                                 │
└── Task 5.1 (depends on 4.1) ─────────────────────────────────────┤
                                                                   │
Phase 6 (WebSocket)                                                │
├── Task 6.1 (depends on 4.1) ─────────────────────────────────────┤
└── Task 6.2 (depends on 6.1) ─────────────────────────────────────┤
                                                                   │
Phase 7 (Testing)                                                  │
├── Task 7.1 (depends on 1.1) ─────────────────────────────────────┤
├── Task 7.2 (depends on 6.2) ─────────────────────────────────────┤
└── Task 7.3 (depends on 6.2) ─────────────────────────────────────┤
                                                                   │
Phase 8 (Cleanup)                                                  │
├── Task 8.1 (depends on 7.2, 7.3) ────────────────────────────────┘
└── Task 8.2 (depends on 8.1)
```

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation**:
- Implement changes incrementally with feature flags
- Run full E2E test suite after each phase
- Maintain backward compatibility during transition

### Risk 2: Performance Regression
**Mitigation**:
- Profile before and after changes
- Ensure no new re-renders introduced
- Use React DevTools to verify effect frequency

### Risk 3: Incomplete Migration
**Mitigation**:
- Remove old code only after new code is verified
- Keep both systems running in parallel initially
- Add logging to detect old code paths still in use

---

## Success Criteria

1. **Zero navigation failures**: Users can switch between any sessions without messages failing to load
2. **Sub-second navigation**: Session switch completes within 500ms for cached sessions
3. **No stuck states**: Navigation timeouts auto-recover within 10 seconds
4. **Test coverage**: >80% coverage for session navigation code paths
5. **No console errors**: Navigation produces no errors or warnings in console
6. **All E2E tests pass**: `npm run test:e2e` passes with 0 failures

---

## Rollback Plan

If issues are discovered post-deployment:

1. **Feature Flag Disable**: Toggle `ENABLE_NEW_NAVIGATION` to false
2. **Git Revert**: `git revert` the merge commit
3. **Hotfix Branch**: Create `hotfix/navigation-rollback` for immediate fix

---

## Appendix A: Code Snippets Reference

### Current Problem Code (ChatInterface.jsx:2185-2209)
```javascript
// Simplified for illustration - actual code has more comments
useLayoutEffect(() => {
  if (forceSessionSwitchCounter !== prevForceSessionSwitchRef.current) {
    sessionSwitchInProgressRef.current = true;
    // BUG: selectedSession?.id may be stale here due to React batching
    // When App.jsx calls setForceSessionSwitchCounter then setSelectedSession,
    // React may batch these and this effect runs with new counter but OLD session
    activeSessionIdRef.current = selectedSession?.id || null;
    sessionMessagesSessionIdRef.current = null;
    messagesLoadedForSessionRef.current = null;
    apiCallInProgressRef.current = null;
    hasActiveSessionMessagesRef.current = false;
    setChatMessages([]);
    setSessionMessages([]);
    if (selectedProject) {
      safeLocalStorage.removeItem(`chat_messages_${selectedProject.name}`);
    }
    prevForceSessionSwitchRef.current = forceSessionSwitchCounter;
  }
}, [forceSessionSwitchCounter, selectedSession?.id, selectedProject]);
```

### Proposed Fix Pattern
```javascript
useLayoutEffect(() => {
  const switchInfo = forceSessionSwitchCounter;
  if (switchInfo.count !== prevForceSessionSwitchRef.current.count) {
    // Use targetSessionId from counter object - guaranteed to be the correct value
    const targetId = switchInfo.targetSessionId;

    sessionSwitchInProgressRef.current = true;
    activeSessionIdRef.current = targetId;
    // ... rest of cleanup

    // Set timeout failsafe
    const timeoutId = setTimeout(() => {
      if (sessionSwitchInProgressRef.current) {
        console.warn('[Session] Navigation stuck - auto-resetting');
        sessionSwitchInProgressRef.current = false;
      }
    }, 10000);

    prevForceSessionSwitchRef.current = switchInfo;

    return () => clearTimeout(timeoutId);
  }
}, [forceSessionSwitchCounter]);
```

---

## Appendix B: Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useSessionNavigation.js` | NEW - Session navigation hook |
| `src/contexts/SessionNavigationContext.jsx` | NEW - Navigation context |
| `src/App.jsx` | Refactor `handleSessionSelect`, add context, import `flushSync` |
| `src/components/ChatInterface.jsx` | Major refactor of effects and refs |
| `src/components/Sidebar.jsx` | Consume navigation context |
| `tests/hooks/useSessionNavigation.test.js` | NEW - Hook unit tests |
| `tests/project-workflow.spec.js` | ADD navigation edge case tests (per project guidelines: add to existing files) |
| `CLAUDE.md` | Documentation updates |

**Note**: Per project guidelines in CLAUDE.md: "incorporate the relevant test logic directly into the corresponding existing test files rather than creating separate new tests."

---

## Appendix C: React Best Practices Applied

Per React documentation, async effects should use the `ignore` flag pattern:

```javascript
useEffect(() => {
  let ignore = false;

  async function fetchData() {
    const result = await someAsyncOperation();
    if (!ignore) {
      setState(result);
    }
  }

  fetchData();

  return () => {
    ignore = true;
  };
}, [dependencies]);
```

This pattern ensures:
1. State updates only happen if component is still mounted
2. State updates only happen if the effect hasn't been re-run
3. Race conditions from rapid dependency changes are prevented

---

## Appendix D: Validation Notes (2025-01-31)

### Verified Line Numbers

| Location | Claimed | Actual | Status |
|----------|---------|--------|--------|
| App.jsx handleSessionSelect batched updates | 614-615 | 614-615 | ✅ Correct |
| ChatInterface.jsx useLayoutEffect force switch | 2185-2209 | 2185-2209 | ✅ Correct |
| ChatInterface.jsx loadMessages effect | 3369-3620 | 3369-3620 | ✅ Correct |
| ChatInterface.jsx eslint-disable | 3620 | 3619-3620 | ✅ Correct |
| ChatInterface.jsx currentSessionId sync | 2136-2144 | 2136-2144 | ✅ Correct |
| ChatInterface.jsx activeSessionIdRef sync | 2150 | 2150-2172 | ✅ Correct |
| ChatInterface.jsx session change reset | 2215 | 2215-2243 | ✅ Correct |
| ChatInterface.jsx WebSocket filtering | 4001-4008 | 4001-4008 | ✅ Correct |
| Sidebar.jsx handleSessionClick | - | 278-294 | ✅ Exists |

### Verified React Patterns

1. **`ignore` flag pattern**: Confirmed in React official documentation as the recommended approach for async effects (https://react.dev/reference/react/useEffect)

2. **`flushSync`**: Confirmed in React documentation with caveats:
   - Import from `'react-dom'`
   - Can significantly hurt performance
   - Should be used as last resort
   - May force pending Suspense boundaries to show fallback

### Existing Infrastructure Discovered

1. **`useChatSessionState` hook** (`src/hooks/useChatSessionState.js`):
   - Already manages session processing state (loading, completion, errors)
   - Uses reducer pattern with guards against race conditions
   - Has `RESET_FOR_SESSION_SWITCH` action type
   - New navigation hook should complement, not duplicate this

2. **Existing E2E tests** (`tests/project-workflow.spec.js`):
   - `multiple sessions with navigation during AI thinking` (line 448)
   - `session URL navigation loads correct session` (line 950)
   - Tests exist but don't cover race conditions or rapid switching

3. **Sidebar pending session handling** (`src/components/Sidebar.jsx:278-294`):
   - Already handles temp->real session ID resolution
   - Uses `pendingSessions` prop to look up confirmed IDs

### Discrepancies Corrected

1. **Effect count**: Plan originally said "4 different effects" but listed 5. Updated to correctly list 6 effects.

2. **Test file strategy**: Original plan proposed creating new test files (`tests/session-navigation.spec.js`, `tests/websocket-filtering.spec.js`). Updated to follow project guidelines which specify adding tests to existing files.

3. **flushSync import**: Original plan didn't mention that `flushSync` needs to be imported from `'react-dom'`. Added this requirement.

4. **Performance caveat**: Added React docs warning about `flushSync` performance impact and suggested alternatives to try first.
