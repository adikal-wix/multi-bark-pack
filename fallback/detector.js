/**
 * Failure Detector
 * Classifies agent failures for fallback decisions
 */

/**
 * Failure patterns to detect in output
 */
const FAILURE_PATTERNS = {
    contextWindow: [
        'context_length_exceeded',
        'maximum context length',
        'context window',
        'token limit exceeded',
        'prompt is too long',
        'input too long',
        'exceeds the model',
    ],
    rateLimit: [
        'rate_limit',
        'rate limit exceeded',
        'too many requests',
        'rate-limit',
        '429',
        'throttl',
        'quota exceeded',
    ],
    auth: [
        'authentication',
        'unauthorized',
        'invalid api key',
        'api key',
        '401',
        'forbidden',
        '403',
    ],
    timeout: [
        'timeout',
        'timed out',
        'deadline exceeded',
        'request timeout',
    ],
    serverError: [
        '500',
        '502',
        '503',
        '504',
        'internal server error',
        'service unavailable',
        'bad gateway',
    ],
    overloaded: [
        'overloaded',
        'capacity',
        'try again later',
        'server busy',
    ],
};

/**
 * Failure type metadata
 */
const FAILURE_INFO = {
    contextWindow: {
        recoverable: true,
        strategy: 'reset',  // Need new session with compressed context
        retryable: false,
        message: 'Context window full',
    },
    rateLimit: {
        recoverable: true,
        strategy: 'retry',  // Wait and retry
        retryable: true,
        backoffMultiplier: 2,
        message: 'Rate limited',
    },
    auth: {
        recoverable: false,
        strategy: 'notify',  // Can't recover without user intervention
        retryable: false,
        message: 'Authentication error',
    },
    timeout: {
        recoverable: true,
        strategy: 'retry',
        retryable: true,
        message: 'Request timed out',
    },
    serverError: {
        recoverable: true,
        strategy: 'switch',  // Try different backend
        retryable: true,
        message: 'Server error',
    },
    overloaded: {
        recoverable: true,
        strategy: 'switch',  // Try different backend
        retryable: true,
        backoffMultiplier: 3,
        message: 'Server overloaded',
    },
    crash: {
        recoverable: true,
        strategy: 'reset',  // Restart with context
        retryable: false,
        message: 'Agent crashed',
    },
    unknown: {
        recoverable: true,
        strategy: 'retry',  // Try once more
        retryable: true,
        message: 'Unknown error',
    },
};

/**
 * Classify failure from output and status
 * @param {string} output - Command output text
 * @param {string} exitCode - Exit code from .done file
 * @param {boolean} tmuxAlive - Whether tmux session still exists
 * @returns {object|null} Failure info or null if no failure
 */
function classifyFailure(output, exitCode, tmuxAlive = true) {
    // No failure if exit code is 0
    if (exitCode === '0' || exitCode === 0) {
        return null;
    }

    // Crash detection - tmux died without completing
    if (!tmuxAlive && exitCode === null) {
        return {
            type: 'crash',
            ...FAILURE_INFO.crash,
        };
    }

    // Parse output for known patterns
    if (output) {
        const outputLower = output.toLowerCase();

        for (const [type, patterns] of Object.entries(FAILURE_PATTERNS)) {
            for (const pattern of patterns) {
                if (outputLower.includes(pattern.toLowerCase())) {
                    return {
                        type,
                        ...FAILURE_INFO[type],
                        matchedPattern: pattern,
                    };
                }
            }
        }
    }

    // Unknown failure
    return {
        type: 'unknown',
        ...FAILURE_INFO.unknown,
    };
}

/**
 * Check if tmux session is alive
 * @param {string} tmuxSession - tmux session name
 * @returns {boolean}
 */
function isTmuxAlive(tmuxSession) {
    try {
        const { execSync } = require('child_process');
        execSync(`tmux has-session -t "${tmuxSession}" 2>/dev/null`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Detect timeout condition
 * @param {number} startTime - Command start timestamp (ms)
 * @param {number} timeoutMs - Timeout threshold (ms)
 * @returns {boolean}
 */
function isTimedOut(startTime, timeoutMs) {
    return Date.now() - startTime > timeoutMs;
}

/**
 * Get recommended strategy for failure type
 * @param {string} failureType
 * @returns {string} Strategy name: 'retry', 'reset', 'switch', 'notify'
 */
function getRecommendedStrategy(failureType) {
    return FAILURE_INFO[failureType]?.strategy || 'retry';
}

/**
 * Check if failure is recoverable
 * @param {string} failureType
 * @returns {boolean}
 */
function isRecoverable(failureType) {
    return FAILURE_INFO[failureType]?.recoverable ?? true;
}

/**
 * Get failure info
 * @param {string} failureType
 * @returns {object}
 */
function getFailureInfo(failureType) {
    return FAILURE_INFO[failureType] || FAILURE_INFO.unknown;
}

module.exports = {
    classifyFailure,
    isTmuxAlive,
    isTimedOut,
    getRecommendedStrategy,
    isRecoverable,
    getFailureInfo,
    FAILURE_PATTERNS,
    FAILURE_INFO,
};
