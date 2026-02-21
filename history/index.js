/**
 * History Manager
 * API for managing agent conversation history
 */

const storage = require('./storage');

// Configuration
const MAX_TURNS = parseInt(process.env.HISTORY_MAX_TURNS || '10', 10);
const SUMMARY_INTERVAL = parseInt(process.env.SUMMARY_INTERVAL_TURNS || '5', 10);

/**
 * Load history for an agent
 */
function load(agentId, backend) {
    return storage.load(agentId, backend);
}

/**
 * Add a user turn to history
 */
function addUserTurn(agentId, content, files = []) {
    const history = storage.load(agentId);

    const turn = {
        id: history.totalTurns + 1,
        timestamp: new Date().toISOString(),
        role: 'user',
        content: truncateContent(content),
        files,
    };

    history.turns.push(turn);
    history.totalTurns++;

    // Cap turns at MAX_TURNS
    if (history.turns.length > MAX_TURNS) {
        history.turns = history.turns.slice(-MAX_TURNS);
    }

    storage.save(agentId, history);
    return history;
}

/**
 * Add an assistant turn to history
 */
function addAssistantTurn(agentId, content, options = {}) {
    const history = storage.load(agentId);

    const turn = {
        id: history.totalTurns + 1,
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content: truncateContent(content),
        tools: options.tools || [],
        filesModified: options.filesModified || [],
        exitCode: options.exitCode,
    };

    history.turns.push(turn);
    history.totalTurns++;

    // Update cwd if provided
    if (options.cwd) {
        history.cwd = options.cwd;
    }

    // Cap turns at MAX_TURNS
    if (history.turns.length > MAX_TURNS) {
        history.turns = history.turns.slice(-MAX_TURNS);
    }

    // Clear last error on success
    if (options.exitCode === 0) {
        history.lastError = null;
    }

    storage.save(agentId, history);

    // Check if summary is needed
    const needsSummary = shouldGenerateSummary(history);

    return { history, needsSummary };
}

/**
 * Record an error in history
 */
function recordError(agentId, errorType, errorMessage) {
    const history = storage.load(agentId);

    history.lastError = {
        type: errorType,
        message: errorMessage,
        timestamp: new Date().toISOString(),
    };

    storage.save(agentId, history);
    return history;
}

/**
 * Update summary in history
 */
function updateSummary(agentId, summaryText) {
    const history = storage.load(agentId);

    history.summary = {
        text: summaryText,
        updatedAt: new Date().toISOString(),
        turnsCovered: history.totalTurns,
    };

    storage.save(agentId, history);
    return history;
}

/**
 * Check if summary generation is needed
 */
function shouldGenerateSummary(history) {
    if (!history.summary) {
        // No summary yet, generate after first few turns
        return history.totalTurns >= SUMMARY_INTERVAL;
    }

    // Check if enough new turns since last summary
    const turnsSinceSummary = history.totalTurns - history.summary.turnsCovered;
    return turnsSinceSummary >= SUMMARY_INTERVAL;
}

/**
 * Get recent turns for context injection
 */
function getRecentTurns(agentId, count = 5) {
    const history = storage.load(agentId);
    return history.turns.slice(-count);
}

/**
 * Get context for fallback (summary + recent turns)
 */
function getContext(agentId) {
    const history = storage.load(agentId);

    return {
        summary: history.summary?.text || null,
        recentTurns: history.turns.slice(-5),
        cwd: history.cwd,
        totalTurns: history.totalTurns,
        filesModified: getUniqueFiles(history.turns),
    };
}

/**
 * Clear history for an agent (on /reset)
 */
function clear(agentId) {
    return storage.remove(agentId);
}

/**
 * Delete history for an agent
 */
function remove(agentId) {
    return storage.remove(agentId);
}

// Helper: Truncate content to avoid huge history files
function truncateContent(content, maxLen = 2000) {
    if (!content) return '';
    if (content.length <= maxLen) return content;
    return content.substring(0, maxLen) + '... [truncated]';
}

// Helper: Get unique files from turns
function getUniqueFiles(turns) {
    const files = new Set();
    for (const turn of turns) {
        if (turn.filesModified) {
            turn.filesModified.forEach(f => files.add(f));
        }
    }
    return Array.from(files);
}

/**
 * Extract tools used from output
 * Parses progress/output to find tool names
 */
function extractToolsFromOutput(output) {
    const toolPatterns = [
        /📖\s*Read/g,
        /✏️\s*Edit/g,
        /📝\s*Write/g,
        /💻\s*Bash/g,
        /🔍\s*Grep/g,
        /📂\s*Glob/g,
        /🌐\s*WebFetch/g,
        /🌐\s*WebSearch/g,
        /⚡\s*Skill/g,
        /🔀\s*Task/g,
    ];

    const tools = new Set();
    const toolNames = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Skill', 'Task'];

    for (let i = 0; i < toolPatterns.length; i++) {
        if (toolPatterns[i].test(output)) {
            tools.add(toolNames[i]);
        }
    }

    return Array.from(tools);
}

module.exports = {
    load,
    addUserTurn,
    addAssistantTurn,
    recordError,
    updateSummary,
    shouldGenerateSummary,
    getRecentTurns,
    getContext,
    clear,
    remove,
    extractToolsFromOutput,

    // Re-export storage functions
    exists: storage.exists,
};
