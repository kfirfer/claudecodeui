/**
 * Notification Content Utilities
 *
 * Utility functions for formatting notification content based on
 * agent type and completion status.
 *
 * @module utils/notificationContent
 */

/**
 * Agent display names mapping
 */
const agentNames = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'OpenAI Codex'
};

/**
 * Get formatted notification content based on agent and completion data
 *
 * @param {string} agent - Agent type ('claude', 'cursor', 'codex')
 * @param {Object} data - Completion data from the agent
 * @param {string} [data.sessionId] - Session identifier
 * @param {number} [data.exitCode] - Exit code (0 = success)
 * @param {boolean} [data.aborted] - Whether the session was aborted
 * @param {Object} [project] - Project information
 * @param {string} [project.name] - Project name
 * @returns {Object} Notification content with title, body, and tag
 */
export const getNotificationContent = (agent, data, project) => {
  const agentName = agentNames[agent] || 'AI Assistant';
  const projectName = project?.name || project?.displayName || 'your project';

  // Handle aborted sessions
  if (data.aborted) {
    return {
      title: `${agentName} Stopped`,
      body: `Session was aborted in ${projectName}`,
      tag: `${agent}-aborted-${data.sessionId || 'unknown'}`
    };
  }

  // Handle error cases (non-zero exit code)
  if (data.exitCode !== undefined && data.exitCode !== 0) {
    return {
      title: `${agentName} Finished with Errors`,
      body: `Task completed with exit code ${data.exitCode} in ${projectName}`,
      tag: `${agent}-error-${data.sessionId || 'unknown'}`
    };
  }

  // Success case
  return {
    title: `${agentName} Finished`,
    body: `Task completed successfully in ${projectName}`,
    tag: `${agent}-complete-${data.sessionId || 'unknown'}`
  };
};
