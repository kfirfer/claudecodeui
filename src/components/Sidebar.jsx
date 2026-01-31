import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useTranslation } from 'react-i18next';

import { FolderOpen, Folder, Plus, MessageSquare, Clock, ChevronDown, ChevronRight, Edit3, Check, X, Trash2, Settings, FolderPlus, RefreshCw, Edit2, Star, Search, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import ClaudeLogo from './ClaudeLogo';
import CursorLogo from './CursorLogo.jsx';
import CodexLogo from './CodexLogo.jsx';
import TaskIndicator from './TaskIndicator';
import ProjectCreationWizard from './ProjectCreationWizard';
import { api } from '../utils/api';
import { useTaskMaster } from '../contexts/TaskMasterContext';
import { useTasksSettings } from '../contexts/TasksSettingsContext';
import { useToast } from './ui/toast';

// Move formatTimeAgo outside component to avoid recreation on every render
const formatTimeAgo = (dateString, currentTime, t) => {
  const date = new Date(dateString);
  const now = currentTime;

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return t ? t('status.unknown') : 'Unknown';
  }

  const diffInMs = now - date;
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInSeconds < 60) return t ? t('time.justNow') : 'Just now';
  if (diffInMinutes === 1) return t ? t('time.oneMinuteAgo') : '1 min ago';
  if (diffInMinutes < 60) return t ? t('time.minutesAgo', { count: diffInMinutes }) : `${diffInMinutes} mins ago`;
  if (diffInHours === 1) return t ? t('time.oneHourAgo') : '1 hour ago';
  if (diffInHours < 24) return t ? t('time.hoursAgo', { count: diffInHours }) : `${diffInHours} hours ago`;
  if (diffInDays === 1) return t ? t('time.oneDayAgo') : '1 day ago';
  if (diffInDays < 7) return t ? t('time.daysAgo', { count: diffInDays }) : `${diffInDays} days ago`;
  return date.toLocaleDateString();
};

function Sidebar({
  projects,
  selectedProject,
  selectedSession,
  onSessionSelect,
  onNewSession,
  onSessionDelete,
  onProjectDelete,
  onUpdateProjectMeta,
  isLoading,
  loadingProgress,
  onRefresh,
  onShowSettings,
  pendingSessions = [],
  updateAvailable,
  latestVersion,
  _currentVersion,
  releaseInfo,
  onShowVersionModal,
  isPWA,
  isMobile,
  onToggleSidebar
}) {
  const { t } = useTranslation('sidebar');
  const { toast } = useToast();
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [editingProject, setEditingProject] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [loadingSessions, setLoadingSessions] = useState({});
  const [additionalSessions, setAdditionalSessions] = useState({});
  const [initialSessionsLoaded, setInitialSessionsLoaded] = useState(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [projectSortOrder, setProjectSortOrder] = useState('name');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [_generatingSummary, _setGeneratingSummary] = useState({});
  const [searchFilter, setSearchFilter] = useState('');
  const [deletingProjects, setDeletingProjects] = useState(new Set());
  // { project, sessionCount }
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  // { projectName, sessionId, sessionTitle, provider }
  const [sessionDeleteConfirmation, setSessionDeleteConfirmation] = useState(null);

  // Multi-select mode state
  const [selectMode, setSelectMode] = useState(false);
  // Selected projects: Set of project names
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  // Selected sessions: Map of "projectName:sessionId" -> { projectName, sessionId, provider }
  const [selectedSessions, setSelectedSessions] = useState(new Map());
  // Bulk delete confirmation modal
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState(null);
  // Bulk delete in progress
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // TaskMaster context
  const { setCurrentProject, mcpServerStatus } = useTaskMaster();
  const { tasksEnabled } = useTasksSettings();

  // Ref for tracking loading request IDs to handle concurrent requests
  const loadingRequestIds = useRef({});

  
  // Starred projects state - persisted in localStorage
  const [starredProjects, setStarredProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('starredProjects');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (error) {
      console.error('Error loading starred projects:', error);
      return new Set();
    }
  });

  // Touch handler to prevent double-tap issues on iPad (only for buttons, not scroll areas)
  const handleTouchClick = (callback) => {
    return (e) => {
      // Only prevent default for buttons/clickable elements, not scrollable areas
      if (e.target.closest('.overflow-y-auto') || e.target.closest('[data-scroll-container]')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      callback();
    };
  };

  // Auto-update timestamps every minute
  useEffect(() => {
    // Update every 60 seconds
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Smart cleanup: Only clear additionalSessions for projects that no longer exist
  // This preserves "Show more sessions" data when WebSocket sends projects_updated
  useEffect(() => {
    setAdditionalSessions(prev => {
      const validProjectNames = new Set(projects.map(p => p.name));
      const cleaned = {};
      for (const [key, value] of Object.entries(prev)) {
        if (validProjectNames.has(key)) {
          cleaned[key] = value;
        }
      }
      // Only update if something actually changed (prevents unnecessary re-renders)
      const hasChanges = Object.keys(prev).length !== Object.keys(cleaned).length;
      return hasChanges ? cleaned : prev;
    });

    // Same logic for initialSessionsLoaded
    setInitialSessionsLoaded(prev => {
      const validProjectNames = new Set(projects.map(p => p.name));
      const cleaned = new Set([...prev].filter(name => validProjectNames.has(name)));
      return cleaned.size !== prev.size ? cleaned : prev;
    });
  }, [projects]);

  // Auto-expand project folder when a session is selected
  useEffect(() => {
    if (selectedSession && selectedProject) {
      setExpandedProjects(prev => new Set([...prev, selectedProject.name]));
    }
  }, [selectedSession, selectedProject]);

  // RACE CONDITION FIX: When a pending session gets its confirmedSessionId,
  // re-trigger navigation if that pending session is currently selected.
  // This handles the case where the user clicked on a pending session before
  // session-created WebSocket event arrived with the real session ID.
  useEffect(() => {
    if (!selectedSession?.id?.startsWith('new-session-')) {
      return; // Not viewing a pending session
    }

    // Check if this pending session now has a confirmed ID
    const pendingSession = pendingSessions.find(p => p.id === selectedSession.id);
    if (pendingSession?.confirmedSessionId) {
      console.log('[Sidebar] Pending session now has confirmed ID, re-navigating:', {
        tempId: selectedSession.id,
        confirmedId: pendingSession.confirmedSessionId
      });

      // Create effective session with the confirmed ID and re-trigger navigation
      const effectiveSession = {
        ...selectedSession,
        id: pendingSession.confirmedSessionId,
        __isPending: false
      };
      onSessionSelect({ ...effectiveSession, __projectName: selectedProject?.name });
    }
  }, [pendingSessions, selectedSession, selectedProject, onSessionSelect]);

  // Mark sessions as loaded when projects come in
  useEffect(() => {
    if (projects.length > 0 && !isLoading) {
      const newLoaded = new Set();
      projects.forEach(project => {
        // Fixed: Changed from >= 0 (always true) to > 0 to only mark projects with sessions
        if (project.sessions && project.sessions.length > 0) {
          newLoaded.add(project.name);
        }
      });
      setInitialSessionsLoaded(newLoaded);
    }
  }, [projects, isLoading]);

  // Load project sort order from settings
  useEffect(() => {
    const loadSortOrder = () => {
      try {
        const savedSettings = localStorage.getItem('claude-settings');
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          setProjectSortOrder(settings.projectSortOrder || 'name');
        }
      } catch (error) {
        console.error('Error loading sort order:', error);
      }
    };

    // Load initially
    loadSortOrder();

    // Listen for cross-tab storage changes
    const handleStorageChange = (e) => {
      if (e.key === 'claude-settings') {
        loadSortOrder();
      }
    };

    // Listen for same-tab settings changes via custom event (more efficient than polling)
    const handleSettingsChange = (e) => {
      if (e.detail?.projectSortOrder) {
        setProjectSortOrder(e.detail.projectSortOrder);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settings-changed', handleSettingsChange);
    };
  }, []);


  const toggleProject = (projectName) => {
    setExpandedProjects(prev => {
      const newExpanded = new Set(prev);
      // Toggle: if expanded, collapse; if collapsed, expand
      // But don't collapse if this project contains the currently selected session
      if (newExpanded.has(projectName)) {
        // Check if this is the active project with selected session
        const isActiveProject = selectedProject?.name === projectName && selectedSession?.id;
        if (!isActiveProject) {
          newExpanded.delete(projectName);
        }
        // If it's the active project, keep it expanded (do nothing)
      } else {
        newExpanded.add(projectName);
      }
      return newExpanded;
    });
  };

  // Wrapper to attach project context when session is clicked
  const handleSessionClick = (session, project) => {
    // Fix for stale closure issue: If session.id is a temp "new-session-*" ID,
    // check pendingSessions for the confirmedSessionId to use instead.
    // This handles the race condition where the button was rendered before
    // confirmPendingSession updated the state.
    let effectiveSession = session;
    if (session?.id?.startsWith('new-session-')) {
      // Look up the pending session to see if it has a confirmedSessionId
      const pendingSession = pendingSessions.find(p => p.id === session.id);
      if (pendingSession?.confirmedSessionId) {
        // Use the confirmed session ID instead of the temp ID
        effectiveSession = {
          ...session,
          id: pendingSession.confirmedSessionId,
          __isPending: false
        };
      }
    }
    onSessionSelect({ ...effectiveSession, __projectName: project.name });
    // Update TaskMaster context with the selected project
    setCurrentProject(project);
  };

  // Starred projects utility functions
  const toggleStarProject = (projectName) => {
    const newStarred = new Set(starredProjects);
    if (newStarred.has(projectName)) {
      newStarred.delete(projectName);
    } else {
      newStarred.add(projectName);
    }
    setStarredProjects(newStarred);
    
    // Persist to localStorage
    try {
      localStorage.setItem('starredProjects', JSON.stringify([...newStarred]));
    } catch (error) {
      console.error('Error saving starred projects:', error);
    }
  };

  const isProjectStarred = (projectName) => {
    return starredProjects.has(projectName);
  };

  // Helper function to get all sessions for a project (initial + additional)
  const getAllSessions = (project) => {
    // Combine Claude, Cursor, and Codex sessions; Sidebar will display icon per row
    const claudeSessions = [...(project.sessions || []), ...(additionalSessions[project.name] || [])].map(s => ({ ...s, __provider: 'claude' }));
    const cursorSessions = (project.cursorSessions || []).map(s => ({ ...s, __provider: 'cursor' }));
    const codexSessions = (project.codexSessions || []).map(s => ({ ...s, __provider: 'codex' }));

    // Sort by most recent activity/date
    // Pending sessions always at top
    const normalizeDate = (s) => {
      if (s.__isPending) return new Date();
      if (s.__provider === 'cursor') return new Date(s.createdAt);
      if (s.__provider === 'codex') return new Date(s.createdAt || s.lastActivity);
      return new Date(s.lastActivity);
    };

    // Combine all sessions and deduplicate by ID (keep most recent)
    const allSessions = [...claudeSessions, ...cursorSessions, ...codexSessions];
    const sessionMap = new Map();

    for (const session of allSessions) {
      const existing = sessionMap.get(session.id);
      if (!existing || normalizeDate(session) > normalizeDate(existing)) {
        sessionMap.set(session.id, session);
      }
    }

    // Add pending sessions that match this project
    // Handle both dash-separated paths (e.g., -Users-dev345-project) and folder names (e.g., project)
    for (const pendingSession of pendingSessions) {
      const pendingSessionMatchesProject = (
        pendingSession.projectName === project.name ||
        pendingSession.projectName.endsWith(`-${project.name}`)
      );
      if (pendingSessionMatchesProject) {
        // If pendingSession has a confirmedSessionId, check if that real session exists in data
        // Only hide pending session when the real session has appeared (prevents race condition)
        const confirmedSessionExists = pendingSession.confirmedSessionId &&
          sessionMap.has(pendingSession.confirmedSessionId);

        // Also check if a session with the same name already exists (handles race condition where
        // projects_updated arrives before session-created, so confirmedSessionId isn't set yet)
        const sessionName = pendingSession.firstMessage || 'New conversation...';
        const matchingSessionByName = Array.from(sessionMap.values()).some(
          s => s.name === sessionName || s.summary === sessionName
        );

        if (!confirmedSessionExists && !matchingSessionByName) {
          // Use confirmedSessionId if available, otherwise fall back to original temp ID
          // This ensures the session button navigates to the real session even before
          // projects_updated arrives with the full session data
          const effectiveSessionId = pendingSession.confirmedSessionId || pendingSession.id;
          const pendingSessionObj = {
            id: effectiveSessionId,
            name: sessionName,
            // Also set summary to match name for consistency with MainContent header display
            summary: sessionName,
            lastActivity: pendingSession.timestamp,
            __provider: pendingSession.provider || 'claude',
            // Only mark as pending if not yet confirmed (still using temp ID)
            __isPending: !pendingSession.confirmedSessionId
          };
          // Don't add if a session with this ID already exists
          if (!sessionMap.has(effectiveSessionId)) {
            sessionMap.set(effectiveSessionId, pendingSessionObj);
          }
        }
      }
    }

    return Array.from(sessionMap.values())
      .sort((a, b) => normalizeDate(b) - normalizeDate(a));
  };

  // Helper function to get the last activity date for a project
  const getProjectLastActivity = (project) => {
    const allSessions = getAllSessions(project);
    if (allSessions.length === 0) {
      // Return epoch date for projects with no sessions
      return new Date(0);
    }
    
    // Find the most recent session activity
    const mostRecentDate = allSessions.reduce((latest, session) => {
      const sessionDate = new Date(session.lastActivity);
      return sessionDate > latest ? sessionDate : latest;
    }, new Date(0));
    
    return mostRecentDate;
  };

  // Combined sorting: starred projects first, then by selected order
  const sortedProjects = [...projects].sort((a, b) => {
    const aStarred = isProjectStarred(a.name);
    const bStarred = isProjectStarred(b.name);
    
    // First, sort by starred status
    if (aStarred && !bStarred) return -1;
    if (!aStarred && bStarred) return 1;
    
    // For projects with same starred status, sort by selected order
    if (projectSortOrder === 'date') {
      // Sort by most recent activity (descending)
      return getProjectLastActivity(b) - getProjectLastActivity(a);
    } else {
      // Sort by display name (user-defined) or fallback to name (ascending)
      const nameA = a.displayName || a.name;
      const nameB = b.displayName || b.name;
      return nameA.localeCompare(nameB);
    }
  });

  const startEditing = (project) => {
    setEditingProject(project.name);
    setEditingName(project.displayName);
  };

  const cancelEditing = () => {
    setEditingProject(null);
    setEditingName('');
  };

  const saveProjectName = async (projectName) => {
    try {
      const response = await api.renameProject(projectName, editingName);

      if (response.ok) {
        // Refresh projects to get updated data - await to ensure state updates before continuing
        if (window.refreshProjects) {
          await window.refreshProjects();
        } else {
          window.location.reload();
        }
      } else {
        console.error('Failed to rename project');
      }
    } catch (error) {
      console.error('Error renaming project:', error);
    }

    setEditingProject(null);
    setEditingName('');
  };

  // Placeholder for session summary update functionality
  // NOTE: Backend API endpoint for updating session summaries not yet implemented
  const updateSessionSummary = async (_projectName, _sessionId, newSummary) => {
    console.warn('updateSessionSummary: API endpoint not implemented yet', { newSummary });
    setEditingSession(null);
    setEditingSessionName('');
  };

  const showDeleteSessionConfirmation = (projectName, sessionId, sessionTitle, provider = 'claude') => {
    setSessionDeleteConfirmation({ projectName, sessionId, sessionTitle, provider });
  };

  const confirmDeleteSession = async () => {
    if (!sessionDeleteConfirmation) return;

    const { projectName, sessionId, provider } = sessionDeleteConfirmation;
    setSessionDeleteConfirmation(null);

    try {
      console.log('[Sidebar] Deleting session:', { projectName, sessionId, provider });

      // Call the appropriate API based on provider
      let response;
      if (provider === 'codex') {
        response = await api.deleteCodexSession(sessionId);
      } else {
        response = await api.deleteSession(projectName, sessionId);
      }

      console.log('[Sidebar] Delete response:', { ok: response.ok, status: response.status });

      if (response.ok) {
        console.log('[Sidebar] Session deleted successfully, calling callback');

        // Immediately clear the session from local additionalSessions state
        // This prevents the session from briefly appearing in the list
        // during the render cycle before the parent's state update takes effect
        setAdditionalSessions(prev => {
          const updated = { ...prev };
          if (updated[projectName]) {
            updated[projectName] = updated[projectName].filter(s => s.id !== sessionId);
          }
          return updated;
        });

        // Call parent callback if provided
        if (onSessionDelete) {
          onSessionDelete(sessionId);
        } else {
          console.warn('[Sidebar] No onSessionDelete callback provided');
        }
      } else {
        const errorText = await response.text();
        console.error('[Sidebar] Failed to delete session:', { status: response.status, error: errorText });
        toast.error(t('messages.deleteSessionFailed'));
      }
    } catch (error) {
      console.error('[Sidebar] Error deleting session:', error);
      toast.error(t('messages.deleteSessionError'));
    }
  };

  const deleteProject = (project) => {
    const sessionCount = getAllSessions(project).length;
    setDeleteConfirmation({ project, sessionCount });
  };

  const confirmDeleteProject = async () => {
    if (!deleteConfirmation) return;

    const { project, sessionCount } = deleteConfirmation;
    const isEmpty = sessionCount === 0;

    setDeleteConfirmation(null);
    setDeletingProjects(prev => new Set([...prev, project.name]));

    // Optimistically remove the project from UI BEFORE the API call
    // This prevents race conditions where projects_updated WebSocket arrives
    // during the API call and re-adds the project with stale data
    if (onProjectDelete) {
      onProjectDelete(project.name);
    }

    try {
      const response = await api.deleteProject(project.name, !isEmpty);

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to delete project');
        toast.error(error.error || t('messages.deleteProjectFailed'));
        // Refresh to restore the project since deletion failed
        if (onRefresh) {
          await onRefresh();
        }
      }
      // On success, do NOT refresh - trust the optimistic update
      // Refreshing can cause race conditions with WebSocket updates
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error(t('messages.deleteProjectError'));
      // Refresh to restore the project since deletion failed
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setDeletingProjects(prev => {
        const next = new Set(prev);
        next.delete(project.name);
        return next;
      });
    }
  };

  // Multi-select mode functions
  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    // Clear selections when exiting select mode
    if (selectMode) {
      setSelectedProjects(new Set());
      setSelectedSessions(new Map());
    }
  };

  const toggleProjectSelection = (projectName) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  };

  const toggleSessionSelection = (projectName, sessionId, provider) => {
    const key = `${projectName}:${sessionId}`;
    setSelectedSessions(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { projectName, sessionId, provider });
      }
      return next;
    });
  };

  const isProjectSelected = (projectName) => selectedProjects.has(projectName);
  const isSessionSelected = (projectName, sessionId) => selectedSessions.has(`${projectName}:${sessionId}`);

  const getSelectedCount = () => selectedProjects.size + selectedSessions.size;

  const selectAllVisible = () => {
    const newSelectedProjects = new Set(selectedProjects);
    const newSelectedSessions = new Map(selectedSessions);

    filteredProjects.forEach(project => {
      newSelectedProjects.add(project.name);
      // Also select all visible sessions in expanded projects
      if (expandedProjects.has(project.name)) {
        getAllSessions(project).forEach(session => {
          // Skip cursor sessions and pending sessions
          const provider = session.__provider || 'claude';
          if (provider !== 'cursor' && !session.__isPending) {
            const key = `${project.name}:${session.id}`;
            newSelectedSessions.set(key, { projectName: project.name, sessionId: session.id, provider });
          }
        });
      }
    });

    setSelectedProjects(newSelectedProjects);
    setSelectedSessions(newSelectedSessions);
  };

  const deselectAll = () => {
    setSelectedProjects(new Set());
    setSelectedSessions(new Map());
  };

  const showBulkDeleteConfirmation = () => {
    setBulkDeleteConfirmation({
      projectCount: selectedProjects.size,
      sessionCount: selectedSessions.size
    });
  };

  const confirmBulkDelete = async () => {
    if (!bulkDeleteConfirmation) return;

    setIsBulkDeleting(true);
    setBulkDeleteConfirmation(null);

    const projectNames = Array.from(selectedProjects);
    const sessions = Array.from(selectedSessions.values());

    let hasErrors = false;

    try {
      // Delete sessions first (if any)
      if (sessions.length > 0) {
        const sessionResponse = await api.bulkDeleteSessions(sessions);
        if (sessionResponse.ok) {
          const result = await sessionResponse.json();
          if (result.failed && result.failed.length > 0) {
            hasErrors = true;
            console.error('Some sessions failed to delete:', result.failed);
          }
          // Clear deleted sessions from additionalSessions state
          result.success.forEach(({ projectName, sessionId }) => {
            setAdditionalSessions(prev => {
              const updated = { ...prev };
              if (updated[projectName]) {
                updated[projectName] = updated[projectName].filter(s => s.id !== sessionId);
              }
              return updated;
            });
            // Notify parent of session deletion
            if (onSessionDelete) {
              onSessionDelete(sessionId);
            }
          });
        } else {
          hasErrors = true;
          console.error('Failed to bulk delete sessions');
        }
      }

      // Delete projects (if any)
      if (projectNames.length > 0) {
        const projectResponse = await api.bulkDeleteProjects(projectNames, true);
        if (projectResponse.ok) {
          const result = await projectResponse.json();
          if (result.failed && result.failed.length > 0) {
            hasErrors = true;
            console.error('Some projects failed to delete:', result.failed);
          }
          // Notify parent of project deletions
          result.success.forEach(projectName => {
            if (onProjectDelete) {
              onProjectDelete(projectName);
            }
          });
        } else {
          hasErrors = true;
          console.error('Failed to bulk delete projects');
        }
      }

      // Show result toast
      if (hasErrors) {
        toast.error(t('multiSelect.bulkDeleteFailed'));
      } else {
        toast.success(t('multiSelect.bulkDeleteSuccess'));
      }

      // Clear selections and exit select mode
      setSelectedProjects(new Set());
      setSelectedSessions(new Map());
      setSelectMode(false);

    } catch (error) {
      console.error('Error during bulk delete:', error);
      toast.error(t('multiSelect.bulkDeleteFailed'));
    } finally {
      setIsBulkDeleting(false);
    }
  };


  const loadMoreSessions = async (project) => {
    // Check if we can load more sessions
    const canLoadMore = project.sessionMeta?.hasMore !== false;

    if (!canLoadMore || loadingSessions[project.name]) {
      return;
    }

    // Generate request ID for staleness check
    const requestId = Date.now();
    loadingRequestIds.current[project.name] = requestId;

    setLoadingSessions(prev => ({ ...prev, [project.name]: true }));

    try {
      // Create AbortController for timeout handling (10s timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const currentSessionCount = (project.sessions?.length || 0) + (additionalSessions[project.name]?.length || 0);
      const response = await api.sessions(project.name, 5, currentSessionCount, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check if this request is still relevant (not stale)
      if (loadingRequestIds.current[project.name] !== requestId) {
        // Stale request, ignore
        return;
      }

      if (response.ok) {
        const result = await response.json();

        // Deduplicate sessions by ID when storing
        setAdditionalSessions(prev => {
          const existing = prev[project.name] || [];
          const existingIds = new Set(existing.map(s => s.id));
          const newSessions = result.sessions.filter(s => !existingIds.has(s.id));

          return {
            ...prev,
            [project.name]: [...existing, ...newSessions]
          };
        });

        // Update project metadata through callback if no more sessions to load
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
      // Only clear loading state if this is still the current request
      if (loadingRequestIds.current[project.name] === requestId) {
        setLoadingSessions(prev => ({ ...prev, [project.name]: false }));
        // Clear the request ID by setting to undefined (avoiding dynamic delete)
        loadingRequestIds.current[project.name] = undefined;
      }
    }
  };

  // Filter projects based on search input
  const filteredProjects = sortedProjects.filter(project => {
    if (!searchFilter.trim()) return true;
    
    const searchLower = searchFilter.toLowerCase();
    const displayName = (project.displayName || project.name).toLowerCase();
    const projectName = project.name.toLowerCase();
    
    // Search in both display name and actual project name/path
    return displayName.includes(searchLower) || projectName.includes(searchLower);
  });

  return (
    <>
      {/* Project Creation Wizard Modal - Rendered via Portal at document root for full-screen on mobile */}
      {showNewProject && ReactDOM.createPortal(
        <ProjectCreationWizard
          onClose={() => setShowNewProject(false)}
          onProjectCreated={(_project) => {
            // Refresh projects list after creation in the background
            // Don't await - let the wizard close immediately for better UX
            if (window.refreshProjects) {
              window.refreshProjects();
            } else {
              window.location.reload();
            }
          }}
        />,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t('deleteConfirmation.deleteProject')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t('deleteConfirmation.confirmDelete')}{' '}
                    <span className="font-medium text-foreground">
                      {deleteConfirmation.project.displayName || deleteConfirmation.project.name}
                    </span>?
                  </p>
                  {deleteConfirmation.sessionCount > 0 && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                        {t('deleteConfirmation.sessionCount', { count: deleteConfirmation.sessionCount })}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {t('deleteConfirmation.allConversationsDeleted')}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('deleteConfirmation.cannotUndo')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-muted/30 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteConfirmation(null)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDeleteProject}
                data-testid="confirm-delete-project"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('actions.delete')}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Session Delete Confirmation Modal */}
      {sessionDeleteConfirmation && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t('deleteConfirmation.deleteSession')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t('deleteConfirmation.confirmDelete')}{' '}
                    <span className="font-medium text-foreground">
                      {sessionDeleteConfirmation.sessionTitle || t('sessions.unnamed')}
                    </span>?
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('deleteConfirmation.cannotUndo')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-muted/30 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSessionDeleteConfirmation(null)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDeleteSession}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('actions.delete')}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirmation && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t('multiSelect.deleteMultipleTitle')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t('multiSelect.deleteMultipleConfirm')}
                  </p>
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                      {bulkDeleteConfirmation.projectCount > 0 && bulkDeleteConfirmation.sessionCount > 0 ? (
                        t('multiSelect.deleteMultipleWarning', {
                          projects: t('multiSelect.projectsCount', { count: bulkDeleteConfirmation.projectCount }),
                          sessions: t('multiSelect.sessionsCount', { count: bulkDeleteConfirmation.sessionCount })
                        })
                      ) : bulkDeleteConfirmation.projectCount > 0 ? (
                        t('multiSelect.deleteMultipleWarningProjectsOnly', {
                          projects: t('multiSelect.projectsCount', { count: bulkDeleteConfirmation.projectCount })
                        })
                      ) : (
                        t('multiSelect.deleteMultipleWarningSessionsOnly', {
                          sessions: t('multiSelect.sessionsCount', { count: bulkDeleteConfirmation.sessionCount })
                        })
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('deleteConfirmation.cannotUndo')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-muted/30 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setBulkDeleteConfirmation(null)}
                disabled={isBulkDeleting}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmBulkDelete}
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('multiSelect.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('actions.delete')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div
        className="h-full flex flex-col bg-card md:select-none"
        style={isPWA && isMobile ? { paddingTop: '44px' } : {}}
      >
      {/* Header */}
      <div className="md:p-4 md:border-b md:border-border">
        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between">
          {import.meta.env.VITE_IS_PLATFORM === 'true' ? (
            <a
              href="https://cloudcli.ai/dashboard"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity group"
              title={t('tooltips.viewEnvironments')}
            >
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                <MessageSquare className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">{t('app.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('app.subtitle')}</p>
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
                <MessageSquare className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">{t('app.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('app.subtitle')}</p>
              </div>
            </div>
          )}
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 hover:bg-accent transition-colors duration-200"
              onClick={onToggleSidebar}
              title={t('tooltips.hideSidebar')}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          )}
        </div>
        
        {/* Mobile Header */}
        <div
          className="md:hidden p-3 border-b border-border"
          style={isPWA && isMobile ? { paddingTop: '16px' } : {}}
        >
          <div className="flex items-center justify-between">
            {import.meta.env.VITE_IS_PLATFORM === 'true' ? (
              <a
                href="https://cloudcli.ai/dashboard"
                className="flex items-center gap-3 active:opacity-70 transition-opacity"
                title={t('tooltips.viewEnvironments')}
              >
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{t('app.title')}</h1>
                  <p className="text-sm text-muted-foreground">{t('projects.title')}</p>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{t('app.title')}</h1>
                  <p className="text-sm text-muted-foreground">{t('projects.title')}</p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center active:scale-95 transition-all duration-150"
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await onRefresh();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 text-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center active:scale-95 transition-all duration-150",
                  selectMode
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border"
                )}
                onClick={toggleSelectMode}
              >
                <CheckSquare className={cn("w-4 h-4", !selectMode && "text-foreground")} />
              </button>
              {!selectMode && (
                <button
                  type="button"
                  className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-all duration-150"
                  onClick={() => setShowNewProject(true)}
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Desktop only - Always show when not loading */}
      {!isLoading && !isMobile && (
        <div className="px-3 md:px-4 py-2 border-b border-border">
          <div className="flex gap-2">
            {selectMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={toggleSelectMode}
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  {t('multiSelect.cancel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={selectAllVisible}
                  title={t('multiSelect.selectAll')}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={deselectAll}
                  title={t('multiSelect.deselectAll')}
                  disabled={getSelectedCount() === 0}
                >
                  <Square className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-8 text-xs bg-primary hover:bg-primary/90 transition-all duration-200"
                  onClick={() => setShowNewProject(true)}
                  title={t('tooltips.createProject')}
                >
                  <FolderPlus className="w-3.5 h-3.5 mr-1.5" />
                  {t('projects.newProject')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 px-0 hover:bg-accent transition-colors duration-200"
                  onClick={toggleSelectMode}
                  title={t('multiSelect.select')}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 px-0 hover:bg-accent transition-colors duration-200 group"
                  onClick={async () => {
                    setIsRefreshing(true);
                    try {
                      await onRefresh();
                    } finally {
                      setIsRefreshing(false);
                    }
                  }}
                  disabled={isRefreshing}
                  title={t('tooltips.refresh')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''} group-hover:rotate-180 transition-transform duration-300`} />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search Filter - Only show when there are projects */}
      {projects.length > 0 && !isLoading && (
        <div className="px-3 md:px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('projects.searchPlaceholder')}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9 text-sm bg-muted/50 border-0 focus:bg-background focus:ring-1 focus:ring-primary/20"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-accent rounded"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Projects List */}
      <ScrollArea className="flex-1 md:px-2 md:py-3 overflow-y-auto overscroll-contain">
        <div className="md:space-y-1 pb-safe-area-inset-bottom">
          {isLoading ? (
            <div className="text-center py-12 md:py-8 px-4">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4 md:mb-3">
                <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-2 md:mb-1">{t('projects.loadingProjects')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('projects.fetchingProjects')}
              </p>
              <h3 className="text-base font-medium text-foreground mb-2 md:mb-1">{t('projects.loadingProjects')}</h3>
              {loadingProgress && loadingProgress.total > 0 ? (
                <div className="space-y-2">
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300 ease-out"
                      style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {loadingProgress.current}/{loadingProgress.total} {t('projects.projects')}
                  </p>
                  {loadingProgress.currentProject && (
                    <p className="text-xs text-muted-foreground/70 truncate max-w-[200px] mx-auto" title={loadingProgress.currentProject}>
                      {loadingProgress.currentProject.split('-').slice(-2).join('/')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('projects.fetchingProjects')}
                </p>
              )}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 md:py-8 px-4">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4 md:mb-3">
                <Folder className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-2 md:mb-1">{t('projects.noProjects')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('projects.runClaudeCli')}
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12 md:py-8 px-4">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4 md:mb-3">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-2 md:mb-1">{t('projects.noMatchingProjects')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('projects.tryDifferentSearch')}
              </p>
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isExpanded = expandedProjects.has(project.name);
              const isSelected = selectedProject?.name === project.name;
              const isStarred = isProjectStarred(project.name);
              const isDeleting = deletingProjects.has(project.name);

              return (
                <div key={project.name} className={cn("md:space-y-1", isDeleting && "opacity-50 pointer-events-none")}>
                  {/* Project Header */}
                  <div className="group md:group">
                    {/* Mobile Project Item */}
                    <div className="md:hidden">
                      <div
                        className={cn(
                          "p-3 mx-3 my-1 rounded-lg bg-card border border-border/50 active:scale-[0.98] transition-all duration-150",
                          isSelected && "bg-primary/5 border-primary/20",
                          isStarred && !isSelected && "bg-yellow-50/50 dark:bg-yellow-900/5 border-yellow-200/30 dark:border-yellow-800/30",
                          selectMode && isProjectSelected(project.name) && "bg-primary/10 border-primary/30"
                        )}
                        onClick={() => {
                          if (selectMode) {
                            toggleProjectSelection(project.name);
                          } else {
                            // On mobile, just toggle the folder - don't select the project
                            toggleProject(project.name);
                          }
                        }}
                        onTouchEnd={handleTouchClick(() => {
                          if (selectMode) {
                            toggleProjectSelection(project.name);
                          } else {
                            toggleProject(project.name);
                          }
                        })}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {selectMode ? (
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors border",
                                isProjectSelected(project.name)
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "bg-muted border-muted-foreground/30"
                              )}>
                                {isProjectSelected(project.name) ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            ) : (
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                isExpanded ? "bg-primary/10" : "bg-muted"
                              )}>
                                {isExpanded ? (
                                  <FolderOpen className="w-4 h-4 text-primary" />
                                ) : (
                                  <Folder className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              {editingProject === project.name ? (
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="w-full px-3 py-2 text-sm border-2 border-primary/40 focus:border-primary rounded-lg bg-background text-foreground shadow-sm focus:shadow-md transition-all duration-200 focus:outline-none"
                                  placeholder={t('projects.projectNamePlaceholder')}
                                  autoFocus
                                  autoComplete="off"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveProjectName(project.name);
                                    if (e.key === 'Escape') cancelEditing();
                                  }}
                                  // Prevents zoom on iOS
                                  style={{
                                    fontSize: '16px',
                                    WebkitAppearance: 'none',
                                    borderRadius: '8px'
                                  }}
                                />
                              ) : (
                                <>
                                  <div className="flex items-center justify-between min-w-0 flex-1">
                                    <h3 className="text-sm font-medium text-foreground truncate">
                                      {project.displayName}
                                    </h3>
                                    {tasksEnabled && (
                                      <TaskIndicator
                                        status={(() => {
                                          const projectConfigured = project.taskmaster?.hasTaskmaster;
                                          const mcpConfigured = mcpServerStatus?.hasMCPServer && mcpServerStatus?.isConfigured;
                                          if (projectConfigured && mcpConfigured) return 'fully-configured';
                                          if (projectConfigured) return 'taskmaster-only';
                                          if (mcpConfigured) return 'mcp-only';
                                          return 'not-configured';
                                        })()}
                                        size="xs"
                                        className="hidden md:inline-flex flex-shrink-0 ml-2"
                                      />
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {(() => {
                                      const sessions = getAllSessions(project);
                                      const sessionCount = sessions.length;
                                      const hasMore = project.sessionMeta?.hasMore !== false;
                                      const count = hasMore && sessionCount >= 5 ? `${sessionCount}+` : sessionCount;
                                      return `${count} session${count === 1 ? '' : 's'}`;
                                    })()}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {editingProject === project.name ? (
                              <>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-lg bg-green-500 dark:bg-green-600 flex items-center justify-center active:scale-90 transition-all duration-150 shadow-sm active:shadow-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveProjectName(project.name);
                                  }}
                                >
                                  <Check className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-lg bg-gray-500 dark:bg-gray-600 flex items-center justify-center active:scale-90 transition-all duration-150 shadow-sm active:shadow-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditing();
                                  }}
                                >
                                  <X className="w-4 h-4 text-white" />
                                </button>
                              </>
                            ) : (
                              <>
                                {/* Star button */}
                                <button
                                  type="button"
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all duration-150 border",
                                    isStarred
                                      ? "bg-yellow-500/10 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800"
                                      : "bg-gray-500/10 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStarProject(project.name);
                                  }}
                                  onTouchEnd={handleTouchClick(() => toggleStarProject(project.name))}
                                  title={isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites')}
                                >
                                  <Star className={cn(
                                    "w-4 h-4 transition-colors",
                                    isStarred
                                      ? "text-yellow-600 dark:text-yellow-400 fill-current"
                                      : "text-gray-600 dark:text-gray-400"
                                  )} />
                                </button>
                                <button
                                    type="button"
                                    className="w-8 h-8 rounded-lg bg-red-500/10 dark:bg-red-900/30 flex items-center justify-center active:scale-90 border border-red-200 dark:border-red-800"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteProject(project);
                                    }}
                                    onTouchEnd={handleTouchClick(() => deleteProject(project))}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  </button>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center active:scale-90 border border-primary/20 dark:border-primary/30"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditing(project);
                                  }}
                                  onTouchEnd={handleTouchClick(() => startEditing(project))}
                                >
                                  <Edit3 className="w-4 h-4 text-primary" />
                                </button>
                                <div className="w-6 h-6 rounded-md bg-muted/30 flex items-center justify-center">
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Desktop Project Item - Using flex layout with no overlap */}
                    <div className={cn(
                      "hidden md:flex w-full items-center group rounded-md transition-colors",
                      isSelected && "bg-accent text-accent-foreground",
                      isStarred && !isSelected && "bg-yellow-50/50 dark:bg-yellow-900/10",
                      selectMode && isProjectSelected(project.name) && "bg-primary/10 border border-primary/30",
                      !isSelected && !isStarred && "hover:bg-accent/50"
                    )}>
                      {/* Clickable project info area - takes remaining space */}
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-3 min-w-0 p-2 text-left"
                        onClick={() => {
                          if (selectMode) {
                            toggleProjectSelection(project.name);
                          } else {
                            toggleProject(project.name);
                          }
                        }}
                      >
                        {selectMode && (
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                            isProjectSelected(project.name)
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/50"
                          )}>
                            {isProjectSelected(project.name) && <Check className="w-3 h-3" />}
                          </div>
                        )}
                        {isExpanded ? (
                          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          {editingProject === project.name ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary/20"
                                placeholder={t('projects.projectNamePlaceholder')}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveProjectName(project.name);
                                  if (e.key === 'Escape') cancelEditing();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                data-testid="desktop-rename-input"
                              />
                              <div className="text-xs text-muted-foreground truncate" title={project.fullPath}>
                                {project.fullPath}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm font-semibold truncate text-foreground" title={project.displayName}>
                                {project.displayName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                <span data-testid={`session-count-${project.displayName}`}>
                                {(() => {
                                  const sessionCount = getAllSessions(project).length;
                                  const hasMore = project.sessionMeta?.hasMore !== false;
                                  return hasMore && sessionCount >= 5 ? `${sessionCount}+` : sessionCount;
                                })()}
                                </span>
                                {project.fullPath !== project.displayName && (
                                  <span className="ml-1 opacity-60" title={project.fullPath}>
                                    • {project.fullPath.length > 25 ? `...${project.fullPath.slice(-22)}` : project.fullPath}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Action buttons - separate flex item, no overlap */}
                      <div className="flex items-center gap-1 flex-shrink-0 pr-2">
                        {editingProject === project.name ? (
                          <>
                            <button
                              type="button"
                              className="w-6 h-6 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center justify-center rounded cursor-pointer transition-colors"
                              onClick={() => saveProjectName(project.name)}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              className="w-6 h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center rounded cursor-pointer transition-colors"
                              onClick={() => cancelEditing()}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Star button */}
                            <button
                              type="button"
                              className={cn(
                                "w-6 h-6 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center rounded cursor-pointer",
                                isStarred
                                  ? "hover:bg-yellow-50 dark:hover:bg-yellow-900/20 opacity-100"
                                  : "hover:bg-accent"
                              )}
                              onClick={() => toggleStarProject(project.name)}
                              title={isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites')}
                            >
                              <Star className={cn(
                                "w-3 h-3 transition-colors",
                                isStarred
                                  ? "text-yellow-600 dark:text-yellow-400 fill-current"
                                  : "text-muted-foreground"
                              )} />
                            </button>
                            <button
                              type="button"
                              className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-accent flex items-center justify-center rounded cursor-pointer"
                              onClick={() => startEditing(project)}
                              title={t('tooltips.renameProject')}
                              data-testid={`rename-project-${project.displayName}`}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center rounded cursor-pointer"
                              onClick={() => deleteProject(project)}
                              title={t('tooltips.deleteProject')}
                              data-testid={`delete-project-${project.displayName}`}
                            >
                              <Trash2 className="w-3 h-3 text-red-600 dark:text-red-400" />
                            </button>
                            <button
                              type="button"
                              className="w-4 h-4 flex items-center justify-center cursor-pointer"
                              onClick={() => toggleProject(project.name)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sessions List */}
                  {isExpanded && (
                    <div className="ml-3 space-y-1 border-l border-border pl-3">
                      {(() => {
                        // Check if we have any pending sessions for this project
                        // Handle both dash-separated paths (e.g., -Users-dev345-project) and folder names (e.g., project)
                        const hasPendingSessionForProject = pendingSessions.some(ps => (
                          ps.projectName === project.name ||
                          ps.projectName.endsWith(`-${project.name}`)
                        ));

                        // Show loading skeleton only if sessions haven't loaded AND there's no pending session
                        if (!initialSessionsLoaded.has(project.name) && !hasPendingSessionForProject) {
                          return Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="p-2 rounded-md">
                              <div className="flex items-start gap-2">
                                <div className="w-3 h-3 bg-muted rounded-full animate-pulse mt-0.5" />
                                <div className="flex-1 space-y-1">
                                  <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 15}%` }} />
                                  <div className="h-2 bg-muted rounded animate-pulse w-1/2" />
                                </div>
                              </div>
                            </div>
                          ));
                        }

                        // Show "no sessions" message if empty and not loading
                        if (getAllSessions(project).length === 0 && !loadingSessions[project.name]) {
                          return (
                            <div className="py-2 px-3 text-left">
                              <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
                            </div>
                          );
                        }

                        // Render sessions list
                        return getAllSessions(project).map((session) => {
                          // Handle Claude, Cursor, and Codex session formats
                          const isCursorSession = session.__provider === 'cursor';
                          const isCodexSession = session.__provider === 'codex';
                          const isPendingSession = session.__isPending;

                          // Calculate if session is active (within last 10 minutes)
                          const getSessionDate = () => {
                            if (isCursorSession) return new Date(session.createdAt);
                            if (isCodexSession) return new Date(session.createdAt || session.lastActivity);
                            return new Date(session.lastActivity);
                          };
                          const sessionDate = getSessionDate();
                          const diffInMinutes = Math.floor((currentTime - sessionDate) / (1000 * 60));
                          const isActive = diffInMinutes < 10;

                          // Get session display values
                          const getSessionName = () => {
                            if (isCursorSession) return session.name || t('projects.untitledSession');
                            if (isCodexSession) return session.summary || session.name || t('projects.codexSession');
                            // For Claude sessions: prefer summary, then name (for pending sessions), then default
                            return session.summary || session.name || t('projects.newSession');
                          };
                          const sessionName = getSessionName();
                          const getSessionTime = () => {
                            if (isCursorSession) return session.createdAt;
                            if (isCodexSession) return session.createdAt || session.lastActivity;
                            return session.lastActivity;
                          };
                          const sessionTime = getSessionTime();
                          const messageCount = session.messageCount || 0;
                          
                          return (
                          <div key={session.id} className="group relative">
                            {/* Active/Pending session indicator dot */}
                            {(isActive || isPendingSession) && (
                              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1">
                                {isPendingSession ? (
                                  <div className="w-2 h-2 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                )}
                              </div>
                            )}
                            {/* Mobile Session Item */}
                            <div className="md:hidden">
                              <div
                                className={cn(
                                  "p-2 mx-3 my-0.5 rounded-md bg-card border active:scale-[0.98] transition-all duration-150 relative",
                                  selectedSession?.id === session.id ? "bg-primary/5 border-primary/20" :
                                  isPendingSession ? "border-blue-500/30 bg-blue-50/5 dark:bg-blue-900/5" :
                                  isActive ? "border-green-500/30 bg-green-50/5 dark:bg-green-900/5" : "border-border/30",
                                  selectMode && isSessionSelected(project.name, session.id) && "bg-primary/10 border-primary/30"
                                )}
                                onClick={() => {
                                  if (selectMode && !isCursorSession && !isPendingSession) {
                                    toggleSessionSelection(project.name, session.id, session.__provider || 'claude');
                                  } else if (!selectMode) {
                                    // Just handle session click - don't call handleProjectSelect
                                    // as that would clear the session before setting it
                                    handleSessionClick(session, project);
                                  }
                                }}
                                onTouchEnd={handleTouchClick(() => {
                                  if (selectMode && !isCursorSession && !isPendingSession) {
                                    toggleSessionSelection(project.name, session.id, session.__provider || 'claude');
                                  } else if (!selectMode) {
                                    handleSessionClick(session, project);
                                  }
                                })}
                              >
                                <div className="flex items-center gap-2">
                                  {selectMode && !isCursorSession && !isPendingSession ? (
                                    <div className={cn(
                                      "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border",
                                      isSessionSelected(project.name, session.id)
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "bg-muted/50 border-muted-foreground/30"
                                    )}>
                                      {isSessionSelected(project.name, session.id) ? (
                                        <Check className="w-3 h-3" />
                                      ) : (
                                        <Square className="w-3 h-3 text-muted-foreground" />
                                      )}
                                    </div>
                                  ) : (
                                    <div className={cn(
                                      "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0",
                                      selectedSession?.id === session.id ? "bg-primary/10" : "bg-muted/50"
                                    )}>
                                      {isCursorSession ? (
                                        <CursorLogo className="w-3 h-3" />
                                      ) : isCodexSession ? (
                                        <CodexLogo className="w-3 h-3" />
                                      ) : (
                                        <ClaudeLogo className="w-3 h-3" />
                                      )}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate text-foreground">
                                      {sessionName}
                                    </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                      <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        {formatTimeAgo(sessionTime, currentTime, t)}
                                      </span>
                                      {messageCount > 0 && (
                                        <Badge variant="secondary" className="text-xs px-1 py-0 ml-auto">
                                          {messageCount}
                                        </Badge>
                                      )}
                                  {/* Provider tiny icon */}
                                  <span className="ml-1 opacity-70">
                                    {isCursorSession ? (
                                      <CursorLogo className="w-3 h-3" />
                                    ) : isCodexSession ? (
                                      <CodexLogo className="w-3 h-3" />
                                    ) : (
                                      <ClaudeLogo className="w-3 h-3" />
                                    )}
                                  </span>
                                    </div>
                                  </div>
                                  {!isCursorSession && !isPendingSession && (
                                    <button
                                      type="button"
                                      className="w-5 h-5 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center active:scale-95 transition-transform opacity-70 ml-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        showDeleteSessionConfirmation(project.name, session.id, sessionName, session.__provider);
                                      }}
                                      onTouchEnd={handleTouchClick(() => showDeleteSessionConfirmation(project.name, session.id, sessionName, session.__provider))}
                                    >
                                      <Trash2 className="w-2.5 h-2.5 text-red-600 dark:text-red-400" />
                                    </button>
                                  )}
                                  {isPendingSession && (
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-1" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Desktop Session Item */}
                            <div className="hidden md:block">
                              <Button
                                variant="ghost"
                                data-testid={`session-button-${session.id}`}
                                className={cn(
                                  "w-full justify-start p-2 h-auto font-normal text-left hover:bg-accent/50 transition-colors duration-200",
                                  selectedSession?.id === session.id && "bg-accent text-accent-foreground",
                                  isPendingSession && "bg-blue-50/50 dark:bg-blue-900/10 border border-blue-500/30",
                                  selectMode && isSessionSelected(project.name, session.id) && "bg-primary/10 border border-primary/30"
                                )}
                                onClick={(e) => {
                                  console.log('[Sidebar] Desktop session button onClick:', { sessionId: session.id, selectMode, isCursorSession, isPendingSession, eventType: e.type, isTrusted: e.isTrusted });
                                  if (selectMode && !isCursorSession && !isPendingSession) {
                                    toggleSessionSelection(project.name, session.id, session.__provider || 'claude');
                                  } else if (!selectMode) {
                                    handleSessionClick(session, project);
                                  }
                                }}
                                onTouchEnd={handleTouchClick(() => {
                                  if (selectMode && !isCursorSession && !isPendingSession) {
                                    toggleSessionSelection(project.name, session.id, session.__provider || 'claude');
                                  } else if (!selectMode) {
                                    handleSessionClick(session, project);
                                  }
                                })}
                              >
                                <div className="flex items-start gap-2 min-w-0 w-full">
                                  {selectMode && !isCursorSession && !isPendingSession ? (
                                    <div className={cn(
                                      "w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                                      isSessionSelected(project.name, session.id)
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "border-muted-foreground/50"
                                    )}>
                                      {isSessionSelected(project.name, session.id) && <Check className="w-2 h-2" />}
                                    </div>
                                  ) : isCursorSession ? (
                                    <CursorLogo className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  ) : isCodexSession ? (
                                    <CodexLogo className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  ) : (
                                    <ClaudeLogo className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate text-foreground">
                                      {sessionName}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        {formatTimeAgo(sessionTime, currentTime, t)}
                                      </span>
                                      {messageCount > 0 && (
                                        <Badge variant="secondary" className="text-xs px-1 py-0 ml-auto group-hover:opacity-0 transition-opacity">
                                          {messageCount}
                                        </Badge>
                                      )}
                                      <span className="ml-1 opacity-70 group-hover:opacity-0 transition-opacity">
                                        {isCursorSession ? (
                                          <CursorLogo className="w-3 h-3" />
                                        ) : isCodexSession ? (
                                          <CodexLogo className="w-3 h-3" />
                                        ) : (
                                          <ClaudeLogo className="w-3 h-3" />
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </Button>
                              {!isCursorSession && !isPendingSession && (
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                {editingSession === session.id && !isCodexSession ? (
                                  <>
                                    <input
                                      type="text"
                                      value={editingSessionName}
                                      onChange={(e) => setEditingSessionName(e.target.value)}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                          updateSessionSummary(project.name, session.id, editingSessionName);
                                        } else if (e.key === 'Escape') {
                                          setEditingSession(null);
                                          setEditingSessionName('');
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-32 px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      className="w-6 h-6 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 rounded flex items-center justify-center"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateSessionSummary(project.name, session.id, editingSessionName);
                                      }}
                                      title={t('tooltips.save')}
                                    >
                                      <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                                    </button>
                                    <button
                                      type="button"
                                      className="w-6 h-6 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40 rounded flex items-center justify-center"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingSession(null);
                                        setEditingSessionName('');
                                      }}
                                      title={t('tooltips.cancel')}
                                    >
                                      <X className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {!isCodexSession && (
                                      <button
                                        type="button"
                                        className="w-6 h-6 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40 rounded flex items-center justify-center"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingSession(session.id);
                                          setEditingSessionName(session.summary || t('projects.newSession'));
                                        }}
                                        title={t('tooltips.editSessionName')}
                                      >
                                        <Edit2 className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="w-6 h-6 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded flex items-center justify-center"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        showDeleteSessionConfirmation(project.name, session.id, sessionName, session.__provider);
                                      }}
                                      title={t('tooltips.deleteSession')}
                                    >
                                      <Trash2 className="w-3 h-3 text-red-600 dark:text-red-400" />
                                    </button>
                                  </>
                                )}
                              </div>
                              )}
                            </div>
                          </div>
                          );
                        });
                      })()}

                      {/* Show More Sessions Button */}
                      {getAllSessions(project).length > 0 && project.sessionMeta?.hasMore !== false && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-center gap-2 mt-2 text-muted-foreground"
                          onClick={() => loadMoreSessions(project)}
                          disabled={loadingSessions[project.name]}
                        >
                          {loadingSessions[project.name] ? (
                            <>
                              <div className="w-3 h-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                              {t('sessions.loading')}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              {t('sessions.showMore')}
                            </>
                          )}
                        </Button>
                      )}
                      
                      {/* Sessions - New Session Button */}
                      <div className="md:hidden px-3 pb-2">
                        <button
                          type="button"
                          className="w-full h-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-2 font-medium text-xs active:scale-[0.98] transition-all duration-150"
                          onClick={() => {
                            // onNewSession already handles setting the project and clearing session
                            onNewSession(project);
                          }}
                        >
                          <Plus className="w-3 h-3" />
                          {t('sessions.newSession')}
                        </button>
                      </div>
                      
                      <Button
                        variant="default"
                        size="sm"
                        className="hidden md:flex w-full justify-start gap-2 mt-1 h-8 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                        onClick={(e) => {
                          console.log('[Sidebar] New Session button onClick! project:', project.name, 'event:', e.type, 'isTrusted:', e.isTrusted);
                          // Mark that the button was clicked - for debugging
                          document.body.setAttribute('data-last-new-session-click', Date.now().toString());
                          onNewSession(project);
                        }}
                        data-testid="new-session-button"
                      >
                        <Plus className="w-3 h-3" />
                        {t('sessions.newSession')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      
      {/* Version Update Notification */}
      {updateAvailable && (
        <div className="md:p-2 border-t border-border/50 flex-shrink-0">
          {/* Desktop Version Notification */}
          <div className="hidden md:block">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 p-3 h-auto font-normal text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-200 border border-blue-200 dark:border-blue-700 rounded-lg mb-2"
              onClick={onShowVersionModal}
              data-testid="version-notification-button"
            >
              <div className="relative">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {releaseInfo?.title || `Version ${latestVersion}`}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400">{t('version.updateAvailable')}</div>
              </div>
            </Button>
          </div>
          
          {/* Mobile Version Notification */}
          <div className="md:hidden p-3 pb-2">
            <button
              type="button"
              className="w-full h-12 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl flex items-center justify-start gap-3 px-4 active:scale-[0.98] transition-all duration-150"
              onClick={onShowVersionModal}
            >
              <div className="relative">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {releaseInfo?.title || `Version ${latestVersion}`}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400">{t('version.updateAvailable')}</div>
              </div>
            </button>
          </div>
        </div>
      )}
      
      {/* Multi-select Action Bar - Only show when items are selected */}
      {selectMode && getSelectedCount() > 0 && (
        <div className="px-3 md:px-4 py-3 border-t border-border bg-card flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {t('multiSelect.selectedCount', { count: getSelectedCount() })}
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs bg-red-600 hover:bg-red-700"
              onClick={showBulkDeleteConfirmation}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t('multiSelect.deleteSelected')}
            </Button>
          </div>
        </div>
      )}

      {/* Settings Section */}
      <div className="md:p-2 md:border-t md:border-border flex-shrink-0">
        {/* Mobile Settings */}
        <div className="md:hidden p-4 pb-20 border-t border-border/50">
          <button
            type="button"
            className="w-full h-14 bg-muted/50 hover:bg-muted/70 rounded-2xl flex items-center justify-start gap-4 px-4 active:scale-[0.98] transition-all duration-150"
            onClick={onShowSettings}
          >
            <div className="w-10 h-10 rounded-2xl bg-background/80 flex items-center justify-center">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-lg font-medium text-foreground">{t('actions.settings')}</span>
          </button>
        </div>

        {/* Desktop Settings */}
        <Button
          variant="ghost"
          className="hidden md:flex w-full justify-start gap-2 p-2 h-auto font-normal text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200"
          onClick={onShowSettings}
        >
          <Settings className="w-3 h-3" />
          <span className="text-xs">{t('actions.settings')}</span>
        </Button>
      </div>
    </div>
    </>
  );
}

export default Sidebar;
