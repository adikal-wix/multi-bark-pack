/**
 * Smoke test for the finalMessageBehavior feature.
 * Runs without a live server or Telegram connection.
 * Usage: node test-final-msg.js
 */

const { createTelegramAdapter } = require('./adapters/telegram');
const { createWhatsAppAdapter } = require('./adapters/whatsapp');
const { createSlackAdapter } = require('./adapters/slack');

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

// --- Capability flags ---
console.log('\n🔍 Checking adapter capability flags...');

// Telegram adapter (needs a token, but we just want the capabilities object)
// Instantiate with a dummy token to read the capability — no network calls made
const tg = createTelegramAdapter({ token: 'dummy', chatId: '123' });
assert('Telegram has capabilities object', !!tg.capabilities);
assert('Telegram finalMessageBehavior is "send"', tg.capabilities?.finalMessageBehavior === 'send');

const wa = createWhatsAppAdapter({ groupName: 'test' });
assert('WhatsApp has capabilities object', !!wa.capabilities);
assert('WhatsApp finalMessageBehavior is "edit"', wa.capabilities?.finalMessageBehavior === 'edit');

const slack = createSlackAdapter({ botToken: 'xoxb-dummy', appToken: 'xapp-dummy', owners: new Set(['U123']) });
assert('Slack has capabilities object', !!slack.capabilities);
assert('Slack finalMessageBehavior is "edit"', slack.capabilities?.finalMessageBehavior === 'edit');

// --- Simulate the server-side branching logic ---
console.log('\n🔍 Simulating server final-result dispatch...');

async function simulateFinalDispatch(adapter, liveMsgId, replyToId) {
    const calls = { edits: [], sends: [] };

    // Mock adapter methods
    const mockAdapter = {
        capabilities: adapter.capabilities,
        edit: async (msgId, text) => { calls.edits.push({ msgId, text }); return true; },
        send: async (text, replyTo) => { calls.sends.push({ text, replyTo }); return 'new:999'; },
    };

    const text = '🐕 [Chase]:\n\nHello world';
    const icon = '🐕';
    const agentName = 'Chase';

    if (liveMsgId && mockAdapter.capabilities?.finalMessageBehavior === 'send') {
        await mockAdapter.edit(liveMsgId, `${icon} [${agentName}]: ✅`);
        await mockAdapter.send(text, replyToId || liveMsgId);
    } else if (liveMsgId) {
        await mockAdapter.edit(liveMsgId, text);
    } else {
        await mockAdapter.send(text);
    }

    return calls;
}

async function runSimulations() {
    // Telegram with liveMsgId + replyToId
    const tgCalls = await simulateFinalDispatch(tg, 'tg:100', 'tg:99');
    assert('Telegram: edits thinking bubble to ✅', tgCalls.edits.length === 1 && tgCalls.edits[0].text.includes('✅'));
    assert('Telegram: sends 1 new message', tgCalls.sends.length === 1);
    assert('Telegram: new message replies to original user msg (replyToId)', tgCalls.sends[0].replyTo === 'tg:99');

    // Telegram with liveMsgId but NO replyToId (falls back to liveMsgId)
    const tgCalls2 = await simulateFinalDispatch(tg, 'tg:100', null);
    assert('Telegram (no replyToId): new message replies to liveMsgId', tgCalls2.sends[0].replyTo === 'tg:100');

    // WhatsApp — should edit in-place, no send
    const waCalls = await simulateFinalDispatch(wa, 'wa:ABC', 'wa:XYZ');
    assert('WhatsApp: edits in-place (no new send)', waCalls.sends.length === 0 && waCalls.edits.length === 1);
    assert('WhatsApp: edit contains full result text', waCalls.edits[0].text.includes('Hello world'));

    // Slack — should edit in-place, no send
    const slackCalls = await simulateFinalDispatch(slack, 'slack:C1:1234', 'slack:C1:5678');
    assert('Slack: edits in-place (no new send)', slackCalls.sends.length === 0 && slackCalls.edits.length === 1);

    // No liveMsgId (any adapter) — should send fresh message
    const noLiveCalls = await simulateFinalDispatch(tg, null, 'tg:99');
    assert('No liveMsgId: sends a fresh message', noLiveCalls.sends.length === 1 && noLiveCalls.edits.length === 0);

    // --- Summary ---
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runSimulations().catch(e => { console.error(e); process.exit(1); });
