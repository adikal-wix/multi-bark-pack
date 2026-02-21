/**
 * Stream Parser Registry
 * Each parser handles output from a specific backend's CLI
 */

const claudeParser = require('./claude');

const parsers = {
    claude: claudeParser,
};

module.exports = {
    /**
     * Get a parser by name
     * @param {string} name - Parser name (e.g., 'claude', 'cursor')
     * @returns {object|null} Parser module or null if not found
     */
    get(name) {
        return parsers[name] || null;
    },

    /**
     * List all available parsers
     * @returns {string[]} Parser names
     */
    list() {
        return Object.keys(parsers);
    },

    /**
     * Register a new parser
     * @param {string} name - Parser name
     * @param {object} parser - Parser module
     */
    register(name, parser) {
        parsers[name] = parser;
    },
};
