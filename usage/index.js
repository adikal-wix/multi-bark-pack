const storage = require('./storage');

let data = null;

function initialize() {
    data = storage.load();
    const agentCount = Object.keys(data.agents).length;
    if (agentCount > 0) {
        console.log(`  \ud83d\udcb0 Usage tracker: loaded ${agentCount} agent(s), $${data.totals.costUsd.toFixed(4)} total`);
    } else {
        console.log('  \ud83d\udcb0 Usage tracker: initialized (no data yet)');
    }
}

function record(agentId, agentName, backend, usageData) {
    if (!data) data = storage.load();
    if (!usageData) return;

    const costUsd = usageData.costUsd || 0;
    const inputTokens = usageData.usage?.input_tokens || 0;
    const outputTokens = usageData.usage?.output_tokens || 0;
    const now = new Date().toISOString();

    if (!data.agents[agentId]) {
        data.agents[agentId] = {
            name: agentName,
            backend,
            totalCostUsd: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            turns: 0,
            firstSeen: now,
            lastSeen: now,
        };
    }

    const agent = data.agents[agentId];
    agent.totalCostUsd += costUsd;
    agent.totalInputTokens += inputTokens;
    agent.totalOutputTokens += outputTokens;
    agent.turns++;
    agent.lastSeen = now;
    // Keep name/backend in sync
    agent.name = agentName;
    agent.backend = backend;

    data.totals.costUsd += costUsd;
    data.totals.inputTokens += inputTokens;
    data.totals.outputTokens += outputTokens;
    data.totals.turns++;

    storage.save(data);
}

function getAll() {
    if (!data) data = storage.load();
    return data;
}

function getAgentUsage(agentId) {
    if (!data) data = storage.load();
    return data.agents[agentId] || null;
}

function removeAgent(agentId) {
    if (!data) data = storage.load();
    const agent = data.agents[agentId];
    if (!agent) return;

    // Subtract from totals
    data.totals.costUsd -= agent.totalCostUsd;
    data.totals.inputTokens -= agent.totalInputTokens;
    data.totals.outputTokens -= agent.totalOutputTokens;
    data.totals.turns -= agent.turns;

    delete data.agents[agentId];
    storage.save(data);
}

module.exports = { initialize, record, getAll, getAgentUsage, removeAgent };
