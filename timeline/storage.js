const { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, renameSync } = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', '.bark-tmp');
const TIMELINE_FILE = path.join(TMP_DIR, 'timeline.jsonl');

function load() {
    if (!existsSync(TIMELINE_FILE)) return [];
    try {
        const lines = readFileSync(TIMELINE_FILE, 'utf8').split('\n').filter(l => l.trim());
        const events = [];
        for (const line of lines) {
            try { events.push(JSON.parse(line)); } catch {}
        }
        return events;
    } catch (err) {
        console.log(`  ⚠️ Could not load timeline: ${err.message}`);
        return [];
    }
}

function append(event) {
    try {
        appendFileSync(TIMELINE_FILE, JSON.stringify(event) + '\n');
    } catch (err) {
        console.log(`  ⚠️ Could not append timeline event: ${err.message}`);
    }
}

function trim(maxLines) {
    if (!existsSync(TIMELINE_FILE)) return;
    try {
        const lines = readFileSync(TIMELINE_FILE, 'utf8').split('\n').filter(l => l.trim());
        if (lines.length <= maxLines) return;
        const trimmed = lines.slice(-maxLines);
        const tmpPath = `${TIMELINE_FILE}.tmp`;
        writeFileSync(tmpPath, trimmed.join('\n') + '\n');
        renameSync(tmpPath, TIMELINE_FILE);
    } catch (err) {
        console.log(`  ⚠️ Could not trim timeline: ${err.message}`);
    }
}

function clear() {
    try { unlinkSync(TIMELINE_FILE); } catch {}
}

module.exports = { load, append, trim, clear, TIMELINE_FILE };
