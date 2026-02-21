/**
 * Backend Registry
 * Manages available LLM agent backends
 */

const createClaudeCodeBackend = require('./claude-code');

// Backend factory functions
const backendFactories = {
    'claude-code': createClaudeCodeBackend,
};

// Instantiated backends (cached)
const backends = {};

/**
 * Initialize all enabled backends
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Map of backend name -> backend instance
 */
async function initialize(config = {}) {
    const enabledBackends = config.enabledBackends || ['claude-code'];
    const defaultBackend = config.defaultBackend || 'claude-code';

    for (const name of enabledBackends) {
        const factory = backendFactories[name];
        if (!factory) {
            console.log(`  ⚠️ Unknown backend: ${name}`);
            continue;
        }

        const backend = factory(config[name] || {});
        const installed = await backend.isInstalled();

        if (installed) {
            backends[name] = backend;
            const version = await backend.getVersion();
            console.log(`  ✓ Backend ${backend.displayName} v${version || 'unknown'}`);
        } else {
            console.log(`  ✗ Backend ${backend.displayName} not installed`);
        }
    }

    if (!backends[defaultBackend]) {
        const fallback = Object.keys(backends)[0];
        if (fallback) {
            console.log(`  ⚠️ Default backend '${defaultBackend}' not available, using '${fallback}'`);
        } else {
            throw new Error('No backends available');
        }
    }

    return backends;
}

/**
 * Get a backend by name
 * @param {string} name - Backend name
 * @returns {object|null} Backend instance or null
 */
function get(name) {
    return backends[name] || null;
}

/**
 * Get the default backend
 * @param {string} defaultName - Configured default backend name
 * @returns {object} Backend instance
 */
function getDefault(defaultName = 'claude-code') {
    return backends[defaultName] || backends[Object.keys(backends)[0]];
}

/**
 * List all available backends
 * @returns {object[]} Array of { name, displayName, installed, models, capabilities }
 */
function list() {
    return Object.values(backends).map(b => ({
        name: b.name,
        displayName: b.displayName,
        models: b.models,
        defaultModel: b.defaultModel,
        capabilities: b.capabilities,
    }));
}

/**
 * Check if a backend is available
 * @param {string} name - Backend name
 * @returns {boolean}
 */
function isAvailable(name) {
    return !!backends[name];
}

/**
 * Get capability matrix for all backends
 * @returns {object} { capabilities: string[], backends: { name: { cap: bool } } }
 */
function getCapabilityMatrix() {
    const allCapabilities = new Set();
    const matrix = {};

    for (const [name, backend] of Object.entries(backends)) {
        matrix[name] = backend.capabilities;
        for (const cap of Object.keys(backend.capabilities)) {
            allCapabilities.add(cap);
        }
    }

    return {
        capabilities: [...allCapabilities].sort(),
        backends: matrix,
    };
}

/**
 * Format capability matrix for display
 * @returns {string} Formatted text
 */
function formatCapabilityMatrix() {
    const { capabilities, backends: matrix } = getCapabilityMatrix();
    const backendNames = Object.keys(matrix);

    if (backendNames.length === 0) {
        return 'No backends available';
    }

    const lines = ['*Backends*\n'];

    // Simple format for chat
    for (const name of backendNames) {
        const backend = backends[name];
        const caps = Object.entries(backend.capabilities)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(', ');
        lines.push(`✓ *${backend.displayName}*: ${backend.models.join(', ')}`);
        lines.push(`  _${caps}_`);
    }

    return lines.join('\n');
}

module.exports = {
    initialize,
    get,
    getDefault,
    list,
    isAvailable,
    getCapabilityMatrix,
    formatCapabilityMatrix,
};
