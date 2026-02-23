const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./prompt');
const logger = require('./logger');

const ENABLED = process.env.SECURITY_GUARD_ENABLED === 'true';
const MODEL = process.env.SECURITY_GUARD_MODEL || 'claude-haiku-4-5-20251001';
const FAIL_OPEN = process.env.SECURITY_GUARD_FAIL_OPEN !== 'false';
const MAX_TEXT_LENGTH = 4000;

let client = null;
let active = false;

function initialize() {
    if (!ENABLED) {
        console.log('  \ud83d\udee1\ufe0f Security Guard: disabled');
        return { enabled: false };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        console.log('  \u26a0\ufe0f Security Guard: ANTHROPIC_API_KEY not set \u2014 disabling');
        return { enabled: false, error: 'No API key' };
    }

    client = new Anthropic();
    active = true;
    console.log(`  \ud83d\udee1\ufe0f Security Guard: enabled (model: ${MODEL}, fail-open: ${FAIL_OPEN})`);
    return { enabled: true };
}

async function screen(text) {
    if (!active || !client) {
        return { allowed: true, category: null, reason: null, latencyMs: 0 };
    }

    const truncated = text.length > MAX_TEXT_LENGTH
        ? text.substring(0, MAX_TEXT_LENGTH) + '... [truncated]'
        : text;

    const start = Date.now();

    try {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: 256,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: truncated }],
        });

        const latencyMs = Date.now() - start;
        const output = response.content[0]?.text || '';
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
        console.log('  \u26a0\ufe0f Security Guard: unparseable response, allowing message');
        return { allowed: true, category: null, reason: null };
    }
}

function isEnabled() {
    return active;
}

module.exports = { initialize, screen, isEnabled };
