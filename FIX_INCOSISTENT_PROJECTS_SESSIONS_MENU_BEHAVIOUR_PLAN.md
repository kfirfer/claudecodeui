# Fix Plan: Inconsistent Projects/Sessions Menu Behavior

## Executive Summary

This document provides a comprehensive plan to fix inconsistent behavior in the Projects and Sessions menu, specifically addressing the reported issue where clicking "Show more sessions" briefly displays content then folds again after approximately one second. During investigation, 15 additional issues were discovered ranging from critical bugs to UX improvements.

---

## Problem Statement

**Reported Issue:** When clicking "Show more sessions" button, sessions load and display briefly, then disappear after ~1 second (appearing as if the menu "folded again").

**Root Cause Identified:** The `useEffect` at `Sidebar.jsx:131-134` unconditionally resets `additionalSessions` state whenever the `projects` prop changes:

```javascript
useEffect(() => {
  setAdditionalSessions({});
  setInitialSessionsLoaded(new Set());
}, [projects]);
```

**Bug Flow:**
1. User clicks "Show more sessions" → `loadMoreSessions()` called
2. API returns sessions → `additionalSessions` state updated
3. Sessions appear in UI ✓
4. File watcher detects change in `~/.claude/projects` (300ms debounce)
5. Server sends `projects_updated` WebSocket message
6. `App.jsx` receives message → calls `setProjects(updatedProjects)` (line 253)
7. `Sidebar` useEffect triggered → `setAdditionalSessions({})`
8. Additional sessions disappear → appears as "folded again"

---

## Additional Issues Discovered

| # | Issue | Severity | File:Line |
|---|-------|----------|-----------|
| 1 | additionalSessions reset on WebSocket update | **CRITICAL** | Sidebar.jsx:131-134 |
| 2 | Direct prop mutation in loadMoreSessions | **CRITICAL** | Sidebar.jsx:448 |
| 3 | currentSessionId not synced with selectedSession | **CRITICAL** | ChatInterface.jsx:1996 |
| 4 | sessions.length >= 0 always true (logic bug) | **HIGH** | Sidebar.jsx:148 |
| 5 | loadMoreSessions lacks concurrent request protection | **HIGH** | Sidebar.jsx:419-456 |
| 6 | Session protection timing gap | **HIGH** | App.jsx:233-234 |
| 7 | Session replacement race condition | **HIGH** | ChatInterface.jsx:3657-3667 |
| 8 | Single-project-expand with no user indication | **MEDIUM** | Sidebar.jsx:196-204 |
| 9 | Mobile/Desktop click handler inconsistency | **MEDIUM** | Sidebar.jsx:841-1149 |
| 10 | localStorage polling every 1s (performance) | **MEDIUM** | Sidebar.jsx:183-187 |
| 11 | deletingProjects set may not clear on error | **MEDIUM** | Sidebar.jsx:385-415 |
| 12 | getAllSessions lacks deduplication | **MEDIUM** | Sidebar.jsx:234-245 |
| 13 | checkInterval listener duplication potential | **LOW** | Sidebar.jsx:156-193 |
| 14 | JSON.stringify may throw on circular refs | **LOW** | App.jsx:260 |
| 15 | Auto-expansion closes other projects (UX) | **LOW** | Sidebar.jsx:137-141 |

---

## Architecture Solution

Following React best practices for WebSocket state management:

**Principle:** Separate server-driven data from local UI state. WebSocket updates should only modify server data, not reset user interactions.

**Implementation Strategy:**
1. **Lift `additionalSessions` to App.jsx** - Treat as part of projects data model
2. **Merge updates intelligently** - Compare project names, don't overwrite blindly
3. **Preserve UI state** - Keep `expandedProjects`, `loadingSessions` as local UI state
4. **Add deduplication** - Prevent duplicate sessions in combined lists

---

## Phase 1: Critical Bug Fixes (Primary Issue)

### Task 1.1: Fix additionalSessions Reset on WebSocket Update
**Status:** [ ] Not Started
**Priority:** P0 - Critical
**Estimated Complexity:** Medium
**Files:** `src/components/Sidebar.jsx`, `src/App.jsx`

#### Subtasks:
- [ ] 1.1.1: Lift `additionalSessions` state from Sidebar to App.jsx
- [ ] 1.1.2: Pass `additionalSessions` and `setAdditionalSessions` as props to Sidebar
- [ ] 1.1.3: Modify useEffect to only clear sessions for projects that no longer exist
- [ ] 1.1.4: Update `handleSidebarRefresh` to preserve additionalSessions
- [ ] 1.1.5: Add integration test for "Show more sessions" persistence

#### Implementation Details:

**Option A (Recommended): Lift state to App.jsx**

```javascript
// App.jsx - Add state
const [additionalSessions, setAdditionalSessions] = useState({});

// Pass to Sidebar
<Sidebar
  projects={projects}
  additionalSessions={additionalSessions}
  setAdditionalSessions={setAdditionalSessions}
  ...
/>

// In projects_updated handler, preserve additionalSessions
if (latestMessage.type === 'projects_updated') {
  const updatedProjects = latestMessage.projects;
  setProjects(updatedProjects);

  // Clean up additionalSessions for deleted projects only
  setAdditionalSessions(prev => {
    const validProjectNames = new Set(updatedProjects.map(p => p.name));
    const cleaned = {};
    for (const [key, value] of Object.entries(prev)) {
      if (validProjectNames.has(key)) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  });
}
```

**Option B: Smart Reset in Sidebar useEffect**

```javascript
// Sidebar.jsx - Replace lines 131-134
useEffect(() => {
  // Only clear additionalSessions for projects that no longer exist
  setAdditionalSessions(prev => {
    const validProjectNames = new Set(projects.map(p => p.name));
    const cleaned = {};
    for (const [key, value] of Object.entries(prev)) {
      if (validProjectNames.has(key)) {
        cleaned[key] = value;
      }
    }
    // Only update if something actually changed
    const hasChanges = Object.keys(prev).length !== Object.keys(cleaned).length;
    return hasChanges ? cleaned : prev;
  });

  // Same for initialSessionsLoaded
  setInitialSessionsLoaded(prev => {
    const validProjectNames = new Set(projects.map(p => p.name));
    const cleaned = new Set([...prev].filter(name => validProjectNames.has(name)));
    return cleaned.size !== prev.size ? cleaned : prev;
  });
}, [projects]);
```

#### Deliverables:
- Modified `App.jsx` with lifted state (if Option A)
- Modified `Sidebar.jsx` with smart reset logic
- Integration test proving persistence across WebSocket updates

#### Tests:
```javascript
// tests/sessions-menu.spec.js
test('Show more sessions persists after WebSocket update', async ({ page }) => {
  // 1. Navigate to project with many sessions
  // 2. Expand project
  // 3. Click "Show more sessions"
  // 4. Wait for sessions to load
  // 5. Trigger a file change in ~/.claude/projects
  // 6. Verify additional sessions are still visible
});
```

---

### Task 1.2: Fix Direct Prop Mutation
**Status:** [ ] Not Started
**Priority:** P0 - Critical
**Files:** `src/components/Sidebar.jsx:448`

#### Subtasks:
- [ ] 1.2.1: Identify all places where `project.sessionMeta` is mutated
- [ ] 1.2.2: Replace direct mutation with callback to update projects state
- [ ] 1.2.3: Add callback prop `onUpdateProjectMeta` from App.jsx

#### Implementation:

```javascript
// Sidebar.jsx - Replace line 448
// BEFORE (BAD):
project.sessionMeta = { ...project.sessionMeta, hasMore: false };

// AFTER (GOOD):
if (result.hasMore === false && onUpdateProjectMeta) {
  onUpdateProjectMeta(project.name, { hasMore: false });
}

// App.jsx - Add handler
const handleUpdateProjectMeta = useCallback((projectName, metaUpdate) => {
  setProjects(prev => prev.map(p =>
    p.name === projectName
      ? { ...p, sessionMeta: { ...p.sessionMeta, ...metaUpdate } }
      : p
  ));
}, []);

// Pass to Sidebar
<Sidebar onUpdateProjectMeta={handleUpdateProjectMeta} ... />
```

#### Deliverables:
- Prop mutation removed
- State updates flow through proper channels
- React reconciliation works correctly

---

### Task 1.3: Fix currentSessionId Sync Issue
**Status:** [ ] Not Started
**Priority:** P0 - Critical
**Files:** `src/components/ChatInterface.jsx`

#### Subtasks:
- [ ] 1.3.1: Add useEffect to sync currentSessionId with selectedSession.id
- [ ] 1.3.2: Review all places that manually set currentSessionId
- [ ] 1.3.3: Consolidate session ID management logic
- [ ] 1.3.4: Add test for session switching behavior

#### Implementation:

```javascript
// ChatInterface.jsx - Add sync effect
useEffect(() => {
  if (selectedSession?.id && selectedSession.id !== currentSessionId) {
    setCurrentSessionId(selectedSession.id);
  }
}, [selectedSession?.id, currentSessionId]);
```

#### Deliverables:
- Session ID always in sync
- Messages sent to correct session
- No race conditions on session switch

---

## Phase 2: High Priority Bug Fixes

### Task 2.1: Fix sessions.length >= 0 Logic Bug
**Status:** [ ] Not Started
**Priority:** P1 - High
**Files:** `src/components/Sidebar.jsx:148`

#### Subtasks:
- [ ] 2.1.1: Change condition from `>= 0` to `> 0`
- [ ] 2.1.2: Verify intended behavior with product owner
- [ ] 2.1.3: Add unit test for edge case

#### Implementation:

```javascript
// BEFORE (line 148):
if (project.sessions && project.sessions.length >= 0) {  // Always true!

// AFTER:
if (project.sessions && project.sessions.length > 0) {  // Only true if has sessions
```

---

### Task 2.2: Add Concurrent Request Protection to loadMoreSessions
**Status:** [ ] Not Started
**Priority:** P1 - High
**Files:** `src/components/Sidebar.jsx:419-456`

#### Subtasks:
- [ ] 2.2.1: Add request ID tracking to detect stale responses
- [ ] 2.2.2: Add timeout handling for hung requests
- [ ] 2.2.3: Prevent duplicate session loading
- [ ] 2.2.4: Add error toast for failed loads

#### Implementation:

```javascript
const loadMoreSessions = async (project) => {
  const canLoadMore = project.sessionMeta?.hasMore !== false;

  if (!canLoadMore || loadingSessions[project.name]) {
    return;
  }

  // Generate request ID for staleness check
  const requestId = Date.now();
  loadingRequestIds.current[project.name] = requestId;

  setLoadingSessions(prev => ({ ...prev, [project.name]: true }));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const currentSessionCount = (project.sessions?.length || 0) +
                                (additionalSessions[project.name]?.length || 0);

    const response = await api.sessions(project.name, 5, currentSessionCount, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Check if this request is still relevant
    if (loadingRequestIds.current[project.name] !== requestId) {
      return; // Stale request, ignore
    }

    if (response.ok) {
      const result = await response.json();

      // Deduplicate sessions by ID
      setAdditionalSessions(prev => {
        const existing = prev[project.name] || [];
        const existingIds = new Set(existing.map(s => s.id));
        const newSessions = result.sessions.filter(s => !existingIds.has(s.id));

        return {
          ...prev,
          [project.name]: [...existing, ...newSessions]
        };
      });

      if (result.hasMore === false && onUpdateProjectMeta) {
        onUpdateProjectMeta(project.name, { hasMore: false });
      }
    } else {
      toast.error(t('messages.loadSessionsFailed'));
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      toast.error(t('messages.loadSessionsTimeout'));
    } else {
      console.error('Error loading more sessions:', error);
      toast.error(t('messages.loadSessionsError'));
    }
  } finally {
    if (loadingRequestIds.current[project.name] === requestId) {
      setLoadingSessions(prev => ({ ...prev, [project.name]: false }));
      delete loadingRequestIds.current[project.name];
    }
  }
};
```

---

### Task 2.3: Fix Session Protection Timing Gap
**Status:** [ ] Not Started
**Priority:** P1 - High
**Files:** `src/App.jsx:233-234`, `src/components/ChatInterface.jsx`

#### Subtasks:
- [ ] 2.3.1: Review session protection flow for gaps
- [ ] 2.3.2: Ensure atomic temporary ID replacement
- [ ] 2.3.3: Add await for onReplaceTemporarySession callback
- [ ] 2.3.4: Add test for rapid session ID replacement

#### Implementation:

```javascript
// ChatInterface.jsx - Make replacement atomic
// BEFORE:
if (onReplaceTemporarySession) {
  onReplaceTemporarySession(latestMessage.sessionId);
}

// AFTER:
if (onReplaceTemporarySession) {
  await onReplaceTemporarySession(latestMessage.sessionId);
}

// App.jsx - Make callback async and atomic
const handleReplaceTemporarySession = useCallback(async (realSessionId) => {
  return new Promise(resolve => {
    setActiveSessions(prev => {
      const newSet = new Set(prev);
      // Remove all temporary IDs
      for (const id of newSet) {
        if (id.startsWith('new-session-')) {
          newSet.delete(id);
        }
      }
      // Add real ID
      newSet.add(realSessionId);
      resolve();
      return newSet;
    });
  });
}, []);
```

---

### Task 2.4: Fix Session Replacement Race Condition
**Status:** [ ] Not Started
**Priority:** P1 - High
**Files:** `src/components/ChatInterface.jsx:3657-3667`

#### Subtasks:
- [ ] 2.4.1: Analyze complete session creation flow
- [ ] 2.4.2: Ensure all state updates are coordinated
- [ ] 2.4.3: Add state machine for session lifecycle
- [ ] 2.4.4: Add test for concurrent message/session creation

---

## Phase 3: Medium Priority Improvements

### Task 3.1: Improve Project Expansion UX
**Status:** [ ] Not Started
**Priority:** P2 - Medium
**Files:** `src/components/Sidebar.jsx:196-204`

#### Subtasks:
- [ ] 3.1.1: Add setting for "Allow multiple expanded projects"
- [ ] 3.1.2: Update toggleProject to respect setting
- [ ] 3.1.3: Add visual indicator that clicking will collapse other
- [ ] 3.1.4: Add tooltip explaining behavior

#### Options:
1. **Allow multiple expanded** (recommended for power users)
2. **Keep single expanded** but add visual indication

---

### Task 3.2: Fix Mobile/Desktop Click Handler Inconsistency
**Status:** [ ] Not Started
**Priority:** P2 - Medium
**Files:** `src/components/Sidebar.jsx:841-1149`

#### Subtasks:
- [ ] 3.2.1: Document intended behavior difference
- [ ] 3.2.2: Align mobile and desktop handlers OR
- [ ] 3.2.3: Create separate explicit "select" vs "toggle" actions

---

### Task 3.3: Optimize localStorage Polling
**Status:** [ ] Not Started
**Priority:** P2 - Medium
**Files:** `src/components/Sidebar.jsx:183-187`

#### Subtasks:
- [ ] 3.3.1: Replace polling with event-based approach
- [ ] 3.3.2: Use custom event for same-tab storage changes
- [ ] 3.3.3: Remove 1-second interval

#### Implementation:

```javascript
// Settings.jsx - Dispatch custom event when settings change
const saveSettings = (newSettings) => {
  localStorage.setItem('claude-settings', JSON.stringify(newSettings));
  window.dispatchEvent(new CustomEvent('settings-changed', { detail: newSettings }));
};

// Sidebar.jsx - Listen for custom event
useEffect(() => {
  const loadSortOrder = () => { /* ... */ };

  const handleSettingsChange = (e) => {
    if (e.detail?.projectSortOrder) {
      setProjectSortOrder(e.detail.projectSortOrder);
    }
  };

  loadSortOrder();
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('settings-changed', handleSettingsChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('settings-changed', handleSettingsChange);
  };
}, []);
```

---

### Task 3.4: Fix deletingProjects Lingering State
**Status:** [ ] Not Started
**Priority:** P2 - Medium
**Files:** `src/components/Sidebar.jsx:385-415`

#### Subtasks:
- [ ] 3.4.1: Ensure finally block always clears state
- [ ] 3.4.2: Add timeout to clear state after max wait
- [ ] 3.4.3: Add cleanup on unmount

---

### Task 3.5: Add Session Deduplication
**Status:** [ ] Not Started
**Priority:** P2 - Medium
**Files:** `src/components/Sidebar.jsx:234-245`

#### Subtasks:
- [ ] 3.5.1: Add deduplication by session ID in getAllSessions
- [ ] 3.5.2: Prefer most recent data when duplicates found

#### Implementation:

```javascript
const getAllSessions = (project) => {
  const claudeSessions = [...(project.sessions || []), ...(additionalSessions[project.name] || [])]
    .map(s => ({ ...s, __provider: 'claude' }));
  const cursorSessions = (project.cursorSessions || []).map(s => ({ ...s, __provider: 'cursor' }));
  const codexSessions = (project.codexSessions || []).map(s => ({ ...s, __provider: 'codex' }));

  // Combine and deduplicate by ID (keep most recent)
  const allSessions = [...claudeSessions, ...cursorSessions, ...codexSessions];
  const sessionMap = new Map();

  for (const session of allSessions) {
    const existing = sessionMap.get(session.id);
    if (!existing || normalizeDate(session) > normalizeDate(existing)) {
      sessionMap.set(session.id, session);
    }
  }

  return Array.from(sessionMap.values())
    .sort((a, b) => normalizeDate(b) - normalizeDate(a));
};
```

---

## Phase 4: Low Priority Cleanup

### Task 4.1: Fix checkInterval Listener Duplication
**Status:** [ ] Not Started
**Priority:** P3 - Low
**Files:** `src/components/Sidebar.jsx:156-193`

#### Subtasks:
- [ ] 4.1.1: Add error handling to loadSortOrder
- [ ] 4.1.2: Ensure cleanup runs even on error

---

### Task 4.2: Add JSON.stringify Error Handling
**Status:** [ ] Not Started
**Priority:** P3 - Low
**Files:** `src/App.jsx:260`

#### Subtasks:
- [ ] 4.2.1: Wrap JSON.stringify in try-catch
- [ ] 4.2.2: Fall back to reference comparison if stringify fails

#### Implementation:

```javascript
// BEFORE:
if (JSON.stringify(updatedSelectedProject) !== JSON.stringify(selectedProject)) {

// AFTER:
const projectsEqual = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Fall back to reference equality if stringify fails
    return a === b;
  }
};

if (!projectsEqual(updatedSelectedProject, selectedProject)) {
```

---

### Task 4.3: Improve Auto-Expansion Behavior
**Status:** [ ] Not Started
**Priority:** P3 - Low
**Files:** `src/components/Sidebar.jsx:137-141`

#### Subtasks:
- [ ] 4.3.1: Add animation when auto-expanding
- [ ] 4.3.2: Consider keeping both projects expanded on session select
- [ ] 4.3.3: Add user preference for auto-expand behavior

---

## Phase 5: Testing

### Task 5.1: Add Unit Tests
**Status:** [ ] Not Started
**Priority:** P1 - High

#### Subtasks:
- [ ] 5.1.1: Test getAllSessions deduplication
- [ ] 5.1.2: Test loadMoreSessions concurrent request handling
- [ ] 5.1.3: Test session ID sync logic
- [ ] 5.1.4: Test additionalSessions cleanup logic

---

### Task 5.2: Add Integration Tests
**Status:** [ ] Not Started
**Priority:** P1 - High

#### Subtasks:
- [ ] 5.2.1: Test "Show more sessions" survives WebSocket update
- [ ] 5.2.2: Test project expansion/collapse behavior
- [ ] 5.2.3: Test session selection with concurrent updates
- [ ] 5.2.4: Test mobile vs desktop behavior consistency

---

### Task 5.3: Add E2E Tests
**Status:** [ ] Not Started
**Priority:** P1 - High
**Files:** `tests/`

#### Subtasks:
- [ ] 5.3.1: Test complete "Show more sessions" flow
- [ ] 5.3.2: Test rapid clicking on "Show more"
- [ ] 5.3.3: Test session persistence across page reload
- [ ] 5.3.4: Test behavior under slow network conditions

---

## Implementation Order

```
Week 1:
├── Task 1.1: Fix additionalSessions reset (CRITICAL)
├── Task 1.2: Fix direct prop mutation (CRITICAL)
└── Task 1.3: Fix currentSessionId sync (CRITICAL)

Week 2:
├── Task 2.1: Fix sessions.length logic bug
├── Task 2.2: Add concurrent request protection
├── Task 2.3: Fix session protection timing gap
└── Task 2.4: Fix session replacement race condition

Week 3:
├── Task 3.1: Improve project expansion UX
├── Task 3.2: Fix mobile/desktop inconsistency
├── Task 3.3: Optimize localStorage polling
├── Task 3.4: Fix deletingProjects state
└── Task 3.5: Add session deduplication

Week 4:
├── Task 4.1-4.3: Low priority cleanup
├── Task 5.1: Unit tests
├── Task 5.2: Integration tests
└── Task 5.3: E2E tests
```

---

## Dependencies

```
Task 1.1 → Task 1.2 (prop mutation fix depends on state lifting)
Task 1.3 → Task 2.3 → Task 2.4 (session ID fixes are related)
Task 3.3 → Task 3.4 (both involve event handling patterns)
Task 5.* → All implementation tasks (tests validate fixes)
```

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| State lifting causes regressions | Medium | High | Feature flag for rollback |
| Session protection changes break chat | Medium | Critical | Extensive testing |
| Mobile behavior changes confuse users | Low | Medium | A/B testing |
| Performance impact from deduplication | Low | Low | Profile before/after |

---

## Success Criteria

1. **Primary Issue Resolved:** "Show more sessions" content persists across WebSocket updates
2. **No Regressions:** All existing E2E tests pass
3. **Performance:** No noticeable UI lag introduced
4. **Code Quality:** All prop mutations removed, state management follows React best practices
5. **Test Coverage:** New tests for all fixed issues

---

## Files to Modify

| File | Tasks |
|------|-------|
| `src/App.jsx` | 1.1, 1.2, 2.3, 4.2 |
| `src/components/Sidebar.jsx` | 1.1, 1.2, 2.1, 2.2, 3.1-3.5, 4.1 |
| `src/components/ChatInterface.jsx` | 1.3, 2.3, 2.4 |
| `src/components/Settings.jsx` | 3.3 |
| `tests/sessions-menu.spec.js` | 5.1-5.3 (new file) |

---

## Appendix: Code Locations

### Root Cause (Sidebar.jsx:131-134)
```javascript
useEffect(() => {
  setAdditionalSessions({});
  setInitialSessionsLoaded(new Set());
}, [projects]);
```

### WebSocket Handler (App.jsx:253)
```javascript
setProjects(updatedProjects);
```

### File Watcher (server/index.js:131-168)
```javascript
const debouncedUpdate = async (eventType, filePath) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    // ... sends projects_updated
  }, 300);
};
```

---

*Document Version: 1.0*
*Created: 2026-01-29*
*Author: Claude Code Analysis*
