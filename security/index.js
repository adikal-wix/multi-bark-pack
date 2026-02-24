const { execFile } = require('child_process');
const { SYSTEM_PROMPT } = require('./prompt');
const logger = require('./logger');

const ENABLED = process.env.SECURITY_GUARD_ENABLED === 'true';
const FAIL_OPEN = process.env.SECURITY_GUARD_FAIL_OPEN !== 'false';
const MAX_TEXT_LENGTH = 4000;
const TIMEOUT_MS = 30_000;

let active = false;

function initialize() {
    if (!ENABLED) {
        console.log('  \ud83d\udee1\ufe0f Security Guard: disabled');
        return { enabled: false };
    }

    active = true;
    console.log(`  \ud83d\udee1\ufe0f Security Guard: enabled (via claude CLI, fail-open: ${FAIL_OPEN})`);
    return { enabled: true };
}

async function screen(text) {
    if (!active) {
        return { allowed: true, category: null, reason: null, latencyMs: 0 };
    }

    const truncated = text.length > MAX_TEXT_LENGTH
        ? text.substring(0, MAX_TEXT_LENGTH) + '... [truncated]'
        : text;

    const prompt = `${SYSTEM_PROMPT}\n\n---\n\nMessage to screen:\n${truncated}`;
    const start = Date.now();

    try {
        const output = await runClaude(prompt);
        const latencyMs = Date.now() - start;
        const verdict = parseVerdict(output);

        if (!verdict.allowed) {
            logger.logBlocked({
                text: truncated,
                category: verdict.category,
                reason: verdict.reason,
                latencyMs,
                timestamp: new Date().toISOString(),
            });
        }

        return { ...verdict, latencyMs };
    } catch (err) {
        const latencyMs = Date.now() - start;
        console.log(`  \u26a0\ufe0f Security Guard error (${latencyMs}ms): ${err.message}`);
        logger.logError(err.message);

        return {
            allowed: FAIL_OPEN,
            category: FAIL_OPEN ? null : 'error',
            reason: FAIL_OPEN ? null : 'Security check unavailable',
            latencyMs,
        };
    }
}

function runClaude(prompt) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.CLAUDECODE;

        const child = execFile('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'text'], {
            timeout: TIMEOUT_MS,
            maxBuffer: 1024 * 64,
            env,
        }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(err.killed ? 'Security check timed out' : (stderr || err.message)));
                return;
            }
            resolve(stdout.trim());
        });
    });
}

function parseVerdict(output) {
    try {
        const json = JSON.parse(output.trim());
        return {
            allowed: json.allowed === true,
            category: json.category || null,
            reason: json.reason || null,
        };
    } catch {
        const lower = output.toLowerCase();
        if (lower.includes('"allowed": true') || lower.includes('"allowed":true')) {
            return { allowed: true, category: null, reason: null };
        }
        if (lower.includes('"allowed": false') || lower.includes('"allowed":false')) {
            const catMatch = output.match(/"category"\s*:\s*"([^"]+)"/);
            const reasonMatch = output.match(/"reason"\s*:\s*"([^"]+)"/);
            return {
                allowed: false,
                category: catMatch ? catMatch[1] : 'unknown',
                reason: reasonMatch ? reasonMatch[1] : 'Message flagged by security',
            };
        }
        console.log('  \u26a0\ufe0f Security Guard: unparseable response, blocking message');
        logger.logBlocked({
            text: '(unparseable verdict)',
            category: 'parse_failure',
            reason: 'Security guard returned unparseable response — defaulting to deny',
            latencyMs: 0,
            timestamp: new Date().toISOString(),
        });
        return { allowed: false, category: 'parse_failure', reason: 'Security check returned unparseable response' };
    }
}

function isEnabled() {
    return active;
}

module.exports = { initialize, screen, isEnabled };
