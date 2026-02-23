const { appendFileSync } = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', '.bark-tmp');
const LOG_FILE = path.join(TMP_DIR, 'security.log');

function logBlocked(entry) {
    const line = JSON.stringify({
        type: 'blocked',
        ...entry,
        text: entry.text?.substring(0, 500),
    });
    try {
        appendFileSync(LOG_FILE, line + '\n');
    } catch (err) {
        console.log(`  \u26a0\ufe0f Security log write failed: ${err.message}`);
    }
}

function logError(message) {
    const line = JSON.stringify({
        type: 'error',
        message,
        timestamp: new Date().toISOString(),
    });
    try {
        appendFileSync(LOG_FILE, line + '\n');
    } catch (err) {
        console.log(`  \u26a0\ufe0f Security log write failed: ${err.message}`);
    }
}

module.exports = { logBlocked, logError, LOG_FILE };
