const { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', '.bark-tmp');
const USAGE_FILE = path.join(TMP_DIR, 'usage.json');

function createEmpty() {
    return { version: 1, agents: {}, totals: { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0 } };
}

function load() {
    if (!existsSync(USAGE_FILE)) return createEmpty();
    try {
        return JSON.parse(readFileSync(USAGE_FILE, 'utf8'));
    } catch (err) {
        console.log(`  \u26a0\ufe0f Could not load usage data: ${err.message}`);
        return createEmpty();
    }
}

function save(data) {
    const tmpPath = `${USAGE_FILE}.tmp`;
    try {
        writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        renameSync(tmpPath, USAGE_FILE);
        return true;
    } catch (err) {
        console.log(`  \u26a0\ufe0f Could not save usage data: ${err.message}`);
        try { unlinkSync(tmpPath); } catch {}
        return false;
    }
}

module.exports = { load, save, createEmpty, USAGE_FILE };
