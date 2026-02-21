/**
 * History Storage Module
 * JSON file storage for agent conversation history
 */

const { readFileSync, writeFileSync, existsSync, unlinkSync } = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', '.bark-tmp');

/**
 * Get history file path for an agent
 */
function getHistoryPath(agentId) {
    return path.join(TMP_DIR, `${agentId}.history.json`);
}

/**
 * Create empty history object for new agent
 */
function createEmptyHistory(agentId, backend) {
    return {
        version: 1,
        agentId,
        backend,
        created: new Date().toISOString(),
        summary: null,
        turns: [],
        totalTurns: 0,
        lastError: null,
        cwd: null,
    };
}

/**
 * Load history for an agent
 * Returns empty history if file doesn't exist
 */
function load(agentId, backend = 'claude-code') {
    const historyPath = getHistoryPath(agentId);

    if (!existsSync(historyPath)) {
        return createEmptyHistory(agentId, backend);
    }

    try {
        const data = readFileSync(historyPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.log(`  ⚠️ Could not load history for ${agentId}: ${err.message}`);
        return createEmptyHistory(agentId, backend);
    }
}

/**
 * Save history for an agent (atomic write)
 */
function save(agentId, history) {
    const historyPath = getHistoryPath(agentId);
    const tmpPath = `${historyPath}.tmp`;

    try {
        // Write to temp file first
        writeFileSync(tmpPath, JSON.stringify(history, null, 2));
        // Rename atomically
        require('fs').renameSync(tmpPath, historyPath);
        return true;
    } catch (err) {
        console.log(`  ⚠️ Could not save history for ${agentId}: ${err.message}`);
        // Clean up temp file if it exists
        try { unlinkSync(tmpPath); } catch {}
        return false;
    }
}

/**
 * Delete history for an agent
 */
function remove(agentId) {
    const historyPath = getHistoryPath(agentId);
    try {
        if (existsSync(historyPath)) {
            unlinkSync(historyPath);
        }
        return true;
    } catch (err) {
        console.log(`  ⚠️ Could not delete history for ${agentId}: ${err.message}`);
        return false;
    }
}

/**
 * Check if history exists for an agent
 */
function exists(agentId) {
    return existsSync(getHistoryPath(agentId));
}

module.exports = {
    load,
    save,
    remove,
    exists,
    createEmptyHistory,
    getHistoryPath,
};
