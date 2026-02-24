const crypto = require('crypto');
const storage = require('./storage');

const MAX_EVENTS = 500;
const TRIM_INTERVAL = 100;

let events = [];
let broadcastFn = null;
let appendCount = 0;

const MESSAGES = {
    spawn: (e) => `Spawned ${e.agentName}`,
    reborn: (e) => `Reborn ${e.agentName}`,
    message_sent: (e) => `Sent to ${e.agentName}: ${(e.meta?.preview || '').substring(0, 60)}`,
    response: (e) => `${e.agentName} responded (${e.meta?.chars || '?'} chars)`,
    timeout: (e) => `${e.agentName} timed out`,
    model_switch: (e) => `${e.agentName} switched to ${e.meta?.model || '?'}`,
    skill_inject: (e) => `Skills injected for ${e.agentName}`,
    cwd_change: (e) => `${e.agentName} moved to ${e.meta?.cwd || '?'}`,
    file_sent: (e) => `${e.agentName} sent file: ${e.meta?.file || '?'}`,
    stop: (e) => `Stopped: ${e.agentName}`,
    clear: (e) => `Cleared ${e.agentName}`,
    hard_delete: (e) => `Deleted ${e.agentName}`,
    reset: (e) => `Reset ${e.agentName}`,
    security_block: (e) => `Blocked [${e.meta?.category || 'unknown'}]`,
    server: (e) => e.meta?.action || 'Server event',
};

function initialize({ broadcast }) {
    broadcastFn = broadcast;
    events = storage.load();
    if (events.length > MAX_EVENTS) {
        events = events.slice(-MAX_EVENTS);
    }
    const count = events.length;
    if (count > 0) {
        console.log(`  📋 Timeline: loaded ${count} event(s)`);
    } else {
        console.log('  📋 Timeline: initialized (no events yet)');
    }
}

function emit(type, { agentId = null, agentName = null, backend = null, message = null, meta = null } = {}) {
    const event = {
        id: 'evt_' + crypto.randomBytes(6).toString('hex'),
        type,
        agentId,
        agentName,
        backend,
        timestamp: new Date().toISOString(),
        message: message || (MESSAGES[type] ? MESSAGES[type]({ agentName, meta }) : type),
        meta,
    };

    events.push(event);
    if (events.length > MAX_EVENTS) {
        events = events.slice(-MAX_EVENTS);
    }

    storage.append(event);
    appendCount++;
    if (appendCount >= TRIM_INTERVAL) {
        storage.trim(MAX_EVENTS);
        storage.rotate();
        appendCount = 0;
    }

    if (broadcastFn) {
        broadcastFn({ type: 'timeline_event', event });
    }
}

function getAll({ limit = 100, offset = 0, agentId = null, agentName = null, backend = null, eventType = null } = {}) {
    let filtered = events;
    if (agentId) filtered = filtered.filter(e => e.agentId === agentId);
    if (agentName) filtered = filtered.filter(e => e.agentName === agentName);
    if (backend) filtered = filtered.filter(e => e.backend === backend);
    if (eventType) filtered = filtered.filter(e => e.type === eventType);
    return filtered.slice(offset, offset + limit);
}

function getRecent(n = 50) {
    return events.slice(-n);
}

module.exports = { initialize, emit, getAll, getRecent };
