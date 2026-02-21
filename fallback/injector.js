/**
 * Context Injector
 * Builds context prompts for fallback sessions
 */

const historyManager = require('../history');
const summarizer = require('../history/summarizer');

/**
 * Build context prompt for injecting into new session
 * @param {object} history - Agent history object
 * @param {object} options - Options for context building
 * @returns {string} Context prompt to prepend
 */
function buildContextPrompt(history, options = {}) {
    return summarizer.buildContextPrompt(history, options);
}

/**
 * Build minimal context when full context is too large
 * @param {object} history - Agent history object
 * @returns {string} Minimal context prompt
 */
function buildMinimalContext(history) {
    return summarizer.buildMinimalContext(history);
}

/**
 * Inject context into agent for fallback
 * Sets agent.fallbackContext which will be prepended to next prompt
 * @param {object} agent - Agent object
 * @param {string} contextType - 'full' or 'minimal'
 */
function injectContext(agent, contextType = 'full') {
    const history = historyManager.load(agent.id, agent.backend);

    if (history.totalTurns === 0 && !history.summary) {
        // No history to inject
        agent.fallbackContext = null;
        return;
    }

    if (contextType === 'minimal') {
        agent.fallbackContext = buildMinimalContext(history);
    } else {
        agent.fallbackContext = buildContextPrompt(history);
    }

    // Check if context is within reasonable limits
    const tokens = summarizer.estimateTokens(agent.fallbackContext);
    if (tokens > 4000) {
        // Fall back to minimal context
        console.log(`  📦 Context too large (${tokens} tokens), using minimal`);
        agent.fallbackContext = buildMinimalContext(history);
    }
}

/**
 * Get context for displaying to user (for debugging)
 * @param {string} agentId
 * @returns {object}
 */
function getContextSummary(agentId) {
    const history = historyManager.load(agentId);
    return {
        hasSummary: !!history.summary,
        summaryLength: history.summary?.text?.length || 0,
        turnCount: history.turns.length,
        totalTurns: history.totalTurns,
        cwd: history.cwd,
        lastError: history.lastError,
    };
}

/**
 * Clear fallback context from agent
 * Call this after context has been used
 * @param {object} agent
 */
function clearContext(agent) {
    delete agent.fallbackContext;
}

/**
 * Check if agent has pending fallback context
 * @param {object} agent
 * @returns {boolean}
 */
function hasContext(agent) {
    return !!agent.fallbackContext;
}

module.exports = {
    buildContextPrompt,
    buildMinimalContext,
    injectContext,
    getContextSummary,
    clearContext,
    hasContext,
};
