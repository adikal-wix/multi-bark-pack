/**
 * Fallback Configuration
 */

module.exports = {
    // Master switch
    enabled: process.env.FALLBACK_ENABLED !== 'false',

    // Strategy execution order
    strategyOrder: ['retry', 'reset', 'switch'],

    // Retry settings
    retry: {
        maxAttempts: parseInt(process.env.FALLBACK_MAX_RETRIES || '3', 10),
        backoffMs: (process.env.FALLBACK_BACKOFF_MS || '5000,15000,30000')
            .split(',')
            .map(s => parseInt(s.trim(), 10)),
    },

    // Timeout settings
    timeout: {
        commandMs: parseInt(process.env.AGENT_TIMEOUT || '600000', 10),  // 10 min
        pollIntervalMs: 2000,
    },

    // Backend fallback priority
    backendPriority: (process.env.FALLBACK_BACKEND_PRIORITY || 'claude-code,cursor,codex,gemini')
        .split(',')
        .map(s => s.trim()),

    // History settings
    history: {
        maxTurns: parseInt(process.env.HISTORY_MAX_TURNS || '10', 10),
        summaryIntervalTurns: parseInt(process.env.SUMMARY_INTERVAL_TURNS || '5', 10),
        maxContextTokens: 4000,
    },

    // Notification settings
    notifications: {
        silent: ['retry'],           // No notification
        subtle: ['reset', 'switch'], // Edit current message
        explicit: ['failed'],        // New message
    },
};
