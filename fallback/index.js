/**
 * Fallback Orchestrator
 * Manages automatic agent recovery with context preservation
 */

const config = require('./config');
const detector = require('./detector');
const injector = require('./injector');
const historyManager = require('../history');

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute fallback for a failed agent
 * @param {object} agent - The failed agent
 * @param {object} failure - Failure info from detector
 * @param {object} adapter - Platform adapter for notifications
 * @param {object} backends - Backends manager
 * @param {function} resetAgentFn - Function to reset agent session
 * @returns {object} Result with success flag and details
 */
async function executeFallback(agent, failure, adapter, backends, resetAgentFn) {
    if (!config.enabled) {
        return { success: false, reason: 'Fallback disabled' };
    }

    if (!detector.isRecoverable(failure.type)) {
        return { success: false, reason: `${failure.type} is not recoverable` };
    }

    console.log(`  🔄 Starting fallback for ${agent.name} (${failure.type})`);

    // Record error in history
    historyManager.recordError(agent.id, failure.type, failure.message);

    // Try strategies in order
    for (const strategy of config.strategyOrder) {
        const result = await tryStrategy(strategy, agent, failure, adapter, backends, resetAgentFn);

        if (result.success) {
            console.log(`  ✅ Fallback ${strategy} succeeded for ${agent.name}`);
            return result;
        }

        console.log(`  ⚠️ Fallback ${strategy} failed for ${agent.name}: ${result.reason}`);
    }

    // All strategies failed
    return {
        success: false,
        reason: 'All fallback strategies exhausted',
        notifyUser: true,
    };
}

/**
 * Try a specific fallback strategy
 */
async function tryStrategy(strategy, agent, failure, adapter, backends, resetAgentFn) {
    switch (strategy) {
        case 'retry':
            return await retryStrategy(agent, failure);

        case 'reset':
            return await resetStrategy(agent, failure, backends, resetAgentFn);

        case 'switch':
            return await switchStrategy(agent, failure, backends, resetAgentFn);

        default:
            return { success: false, reason: `Unknown strategy: ${strategy}` };
    }
}

/**
 * Retry Strategy
 * Wait with exponential backoff and retry same session
 */
async function retryStrategy(agent, failure) {
    // Only retry for retryable failures
    if (!detector.getFailureInfo(failure.type).retryable) {
        return { success: false, reason: 'Not retryable' };
    }

    const backoffMs = config.retry.backoffMs;
    const maxAttempts = config.retry.maxAttempts;

    // Check retry count
    agent.retryCount = (agent.retryCount || 0) + 1;

    if (agent.retryCount > maxAttempts) {
        agent.retryCount = 0;  // Reset for next time
        return { success: false, reason: 'Max retries exceeded' };
    }

    // Calculate backoff delay
    const delayIndex = Math.min(agent.retryCount - 1, backoffMs.length - 1);
    let delay = backoffMs[delayIndex];

    // Apply multiplier for certain failure types
    const multiplier = detector.getFailureInfo(failure.type).backoffMultiplier || 1;
    delay *= multiplier;

    console.log(`  ⏳ Retry ${agent.retryCount}/${maxAttempts} for ${agent.name}, waiting ${delay}ms`);
    await sleep(delay);

    return {
        success: true,
        strategy: 'retry',
        action: 'retry_same_session',
        delay,
    };
}

/**
 * Reset Strategy
 * Create new session on same backend with context injected
 */
async function resetStrategy(agent, failure, backends, resetAgentFn) {
    const backend = backends.get(agent.backend);
    if (!backend) {
        return { success: false, reason: 'Backend not available' };
    }

    // Inject context for new session
    injector.injectContext(agent, 'full');

    // Generate new session ID
    const newSessionId = backend.generateSessionId();
    const oldSessionId = agent.sessionId;

    agent.sessionId = newSessionId;
    agent.hasRun = false;  // Forces new session flow
    agent.retryCount = 0;  // Reset retry counter

    console.log(`  🔄 Reset ${agent.name}: ${oldSessionId?.slice(0, 8)}... → ${newSessionId?.slice(0, 8)}...`);

    return {
        success: true,
        strategy: 'reset',
        action: 'new_session_same_backend',
        oldSessionId,
        newSessionId,
        contextInjected: true,
    };
}

/**
 * Switch Strategy
 * Switch to different backend with context injected
 */
async function switchStrategy(agent, failure, backends, resetAgentFn) {
    // Get next available backend
    const newBackend = getNextBackend(agent.backend, backends);

    if (!newBackend) {
        return { success: false, reason: 'No alternative backends available' };
    }

    // Inject context for new backend
    injector.injectContext(agent, 'full');

    // Switch backend
    const oldBackend = agent.backend;
    agent.backend = newBackend.name;
    agent.sessionId = newBackend.generateSessionId();
    agent.hasRun = false;
    agent.retryCount = 0;

    console.log(`  🔀 Switch ${agent.name}: ${oldBackend} → ${newBackend.name}`);

    return {
        success: true,
        strategy: 'switch',
        action: 'new_backend',
        oldBackend,
        newBackend: newBackend.name,
        contextInjected: true,
    };
}

/**
 * Get next backend in priority order
 * Skips current backend and unavailable backends
 */
function getNextBackend(currentBackend, backends) {
    const priority = config.backendPriority;

    // Find backends after current in priority
    const currentIndex = priority.indexOf(currentBackend);
    const candidates = [
        ...priority.slice(currentIndex + 1),
        ...priority.slice(0, currentIndex),
    ];

    for (const name of candidates) {
        if (name === currentBackend) continue;

        const backend = backends.get(name);
        if (backend && backends.isAvailable(name)) {
            return backend;
        }
    }

    return null;
}

/**
 * Build notification message for fallback
 */
function buildNotification(agent, result, failure) {
    const icon = injector.hasContext(agent) ? '🔄' : '⚡';

    switch (result.strategy) {
        case 'retry':
            return null;  // Silent

        case 'reset':
            return `${icon} _${agent.name} context refreshed..._`;

        case 'switch':
            return `🔀 _${agent.name} switched to ${result.newBackend}..._`;

        default:
            if (!result.success) {
                return `❌ [${agent.name}] ${failure.message}. Reply to retry or use /reset.`;
            }
            return null;
    }
}

/**
 * Should notify user for this strategy?
 */
function shouldNotify(strategy, result) {
    if (!result.success) {
        return config.notifications.explicit.includes('failed');
    }

    if (config.notifications.silent.includes(strategy)) {
        return false;
    }

    return config.notifications.subtle.includes(strategy) ||
           config.notifications.explicit.includes(strategy);
}

/**
 * Get fallback status for agent
 */
function getStatus(agent) {
    return {
        retryCount: agent.retryCount || 0,
        hasContext: injector.hasContext(agent),
        contextSummary: injector.getContextSummary(agent.id),
    };
}

module.exports = {
    executeFallback,
    tryStrategy,
    retryStrategy,
    resetStrategy,
    switchStrategy,
    getNextBackend,
    buildNotification,
    shouldNotify,
    getStatus,
    config,
    detector,
    injector,
};
