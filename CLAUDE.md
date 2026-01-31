# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code UI is a web-based desktop/mobile interface for Claude Code CLI, Cursor CLI, and OpenAI Codex. It provides real-time project management, chat interface, file explorer, git integration, and terminal access to these AI coding assistants.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (runs both frontend and backend with hot reload)
npm run dev

# Build for production
npm run build

# Start production server (builds then serves)
npm start

# Run server only (for debugging backend)
npm run server

# Run frontend only (Vite dev server)
npm run client

# Linting (runs oxlint, eslint, and knip)
npm run lint

# Individual linters
npm run lint:oxlint    # Fast Rust-based linter
npm run lint:eslint    # ESLint with React/security plugins
npm run lint:knip      # Detect unused files, deps, and exports

# Type checking
npm run type-check     # Run TypeScript compiler (tsc --noEmit)
```

## Architecture

### Backend (Node.js + Express)
- **Entry point**: `server/index.js` - Express server with WebSocket support
- **CLI integrations**:
  - `server/claude-sdk.js` - Claude integration via `@anthropic-ai/claude-agent-sdk`
  - `server/cursor-cli.js` - Cursor CLI integration
  - `server/openai-codex.js` - OpenAI Codex integration
- **API routes**: `server/routes/` - Express routes for git, MCP, settings, taskmaster, etc.
- **Database**: `server/database/db.js` - SQLite (better-sqlite3) for auth/settings
- **Middleware**: `server/middleware/auth.js` - JWT authentication

### Frontend (React + Vite)
- **Entry point**: `src/main.jsx` → `src/App.jsx`
- **Contexts** (in `src/contexts/`):
  - `AuthContext.jsx` - User authentication state
  - `WebSocketContext.jsx` - Real-time communication with backend
  - `ThemeContext.jsx` - Dark/light mode
  - `TaskMasterContext.jsx` - TaskMaster AI integration
  - `TasksSettingsContext.jsx` - Task-related settings
- **Key components** (in `src/components/`):
  - `ChatInterface.jsx` - Main chat UI
  - `Sidebar.jsx` - Project/session navigation
  - `FileTree.jsx` - Project file explorer
  - `Shell.jsx` - Terminal component (xterm.js)
  - `GitPanel.jsx` - Git operations UI
  - `Settings.jsx` - Application settings modal

### Shared Code
- `shared/modelConstants.js` - Model definitions for Claude, Cursor, and Codex

### Communication Flow
1. Frontend connects via WebSocket (`/ws` for chat, `/shell` for terminal)
2. User messages sent as `claude-command`, `cursor-command`, or `codex-command`
3. Backend streams responses via `claude-response` messages
4. Session management with `session-created`, `claude-complete` events
5. File system changes in `~/.claude/projects/` trigger `projects_updated` WebSocket events

## Configuration

Environment variables (`.env`):
- `PORT` - Backend server port (default: 3001)
- `VITE_PORT` - Frontend dev server port (default: 5173)
- `CONTEXT_WINDOW` - Claude context window size (default: 200000)
- `DATABASE_PATH` - Custom auth database location

## Key Patterns

### Session Protection System
The app tracks "active sessions" to prevent automatic project updates from clearing chat messages during conversations. See `App.jsx` for implementation using `activeSessions` state and the `markSessionAsActive`/`markSessionAsInactive` callbacks.

### Session State Management Architecture

The session navigation system in `ChatInterface.jsx` uses multiple refs and effects to manage session state. Understanding this architecture is critical for maintaining the component.

#### Key Refs for Session Tracking

| Ref | Purpose |
|-----|---------|
| `activeSessionIdRef` | Current session ID for WebSocket message filtering |
| `messagesLoadedForSessionRef` | Tracks which session's messages are currently loaded |
| `loadingTargetSessionRef` | Target session during async API calls (prevents stale data) |
| `sessionMessagesSessionIdRef` | Associates raw session messages with their session |
| `sessionSwitchInProgressRef` | Flag to block message processing during session switch |
| `apiCallInProgressRef` | Guards against duplicate API calls for same session |
| `hasActiveSessionMessagesRef` | Indicates messages received from WebSocket (not API) |
| `isPendingSessionRef` | Tracks if selected session is pending (temp ID) |
| `pendingViewSessionRef` | Stores pending session view state during creation |
| `prevForceSessionSwitchRef` | Detects changes in force switch counter |
| `prevSessionIdRef` | Detects actual session ID changes |

#### Session Lifecycle

1. **New Session Creation**:
   - User submits message → `handleSubmit` generates temp ID (`new-session-*`)
   - Temp session added to `pendingSessions` array
   - WebSocket `session-created` arrives → `confirmPendingSession` links temp→real ID
   - Session transitions from pending to confirmed

2. **Session Navigation**:
   - User clicks session in Sidebar → `handleSessionSelect` in App.jsx
   - `forceSessionSwitchCounter` increments → triggers `useLayoutEffect` in ChatInterface
   - Messages cleared synchronously, refs reset
   - `loadMessages` effect runs async → fetches messages from API
   - `loadingTargetSessionRef` prevents stale data if user switches again

3. **Message Flow**:
   - Incoming WebSocket messages filtered by `activeSessionIdRef`
   - `sessionSwitchInProgressRef` blocks messages during switch
   - After API load completes, refs updated atomically before setting state

#### Known Race Conditions and Mitigations

1. **Stale Closure in Async Effects**: The `loadMessages` effect captures session ID in `targetSessionId`, then checks `loadingTargetSessionRef` after API call to discard stale results.

2. **Layout Effect vs WebSocket Timing**: `useLayoutEffect` updates `activeSessionIdRef` synchronously before render to ensure WebSocket handler sees correct session.

3. **Pending Session Resolution**: `handleSessionClick` in Sidebar looks up `confirmedSessionId` from `pendingSessions` to resolve temp IDs that may not be updated in rendered button.

4. **Duplicate API Calls**: `apiCallInProgressRef` guards against effect running multiple times due to dependency batching.

#### Debugging Session Issues

When debugging session navigation issues:
1. Check `messagesLoadedForSessionRef` matches expected session
2. Verify `activeSessionIdRef` is correct in WebSocket handler
3. Ensure `sessionSwitchInProgressRef` is reset after loading completes
4. For pending sessions, verify `confirmPendingSession` was called with correct IDs

### WebSocket Message Types
- `claude-command` / `cursor-command` / `codex-command` - User prompts
- `claude-response` - Streaming AI responses
- `claude-permission-request` - Tool approval requests
- `projects_updated` - Project file changes
- `session-created` / `claude-complete` - Session lifecycle

### i18n
Internationalization support in `src/i18n/` with English and Chinese locales.

## Development Workflow

**Before committing any changes**, always run:

1. **Lint check**: `npm run lint` - Ensures code quality and catches issues early
2. **Playwright tests**: `npm run test:e2e` - Runs end-to-end tests to verify functionality

This applies to all code changes, including bug fixes, new features, and refactoring.

### Test Guidelines
- All test files are located in the `tests/` directory.
- Test user credentials are obtained from environment variables: `TEST_USERNAME` and `TEST_PASSWORD`, or from `.env` file.
- The testing framework used is Playwright, so write all test cases using Playwright's syntax and best practices.
- Execute all tests against the application at `http://localhost:3008`.
- When developing a new feature or addressing a bug fix, incorporate the relevant test logic directly into the corresponding existing test files rather than creating separate new tests.
- For any code change whether adding new functionality, refactoring, or fixing bugs, run E2E tests to confirm that previous behavior is preserved and that no regressions have been introduced. To do this, execute the following command: `npm run test:e2e`.
- Carefully review test outputs after running, ensuring that all tests pass without failures or errors. If any regressions or unexpected errors occur, address them before considering the task complete.
- All tests MUST use Playwright's auto-wait and expect assertions exclusively.
- Playwight MUST use 4 workers for parallel execution. ALWAYS use 4 workers for parallel execution.
- DO NOT use mocks in tests. always test the actual application behavior.
- DO NOT skip tests.
- DO NOT implement retry mechanism. no retry in tests and not in the application code.
- DO NOT use try catch in tests. tests should fail if there is an error.
- DO NOT use arbitrary timeouts in tests such as `setTimeout` or `waitForTimeout`. Instead, rely on Playwright's built-in waiting mechanisms.
- DO NOT use conditional logic in tests. tests MUST be run as is, without any conditions.
- DO NOT implement any workarounds in tests. If a test fails, it should be fixed properly rather than bypassed.

