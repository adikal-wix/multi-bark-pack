require('dotenv').config();
const { createWhatsAppAdapter } = require('./adapters/whatsapp');
const { createTelegramAdapter } = require('./adapters/telegram');
const { createSlackAdapter } = require('./adapters/slack');
const backends = require('./backends');
const { exec, execSync } = require('child_process');
const { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } = require('fs');
const crypto = require('crypto');
const path = require('path');

// --- Config ---
const GROUP_NAME = process.env.WA_GROUP || 'bark-pack';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || null;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || null;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN || null;
const WA_ENABLED = process.env.WA_ENABLED !== 'false'; // enabled by default for backward compat
// Owner filter: only respond to messages from these users (per-platform)
// Supports comma-separated IDs for multiple owners, e.g. WA_OWNER=123,456
function parseOwners(envVal) {
    if (!envVal) return null;
    if (envVal === 'DANGER-ALL') return 'DANGER-ALL';
    return new Set(envVal.split(',').map(s => s.trim()).filter(Boolean));
}
const OWNER_IDS = {
    whatsapp: parseOwners(process.env.WA_OWNER),
    telegram: parseOwners(process.env.TG_OWNER),
    slack: parseOwners(process.env.SLACK_OWNER),
};
const WHISPER_MODEL = process.env.WHISPER_MODEL || '/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin';
const DEFAULT_BACKEND = process.env.DEFAULT_BACKEND || 'claude-code';
const ENABLED_BACKENDS = (process.env.ENABLED_BACKENDS || 'claude-code').split(',').map(s => s.trim());
const SHELL_PATH = process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
const cleanEnv = { ...process.env, PATH: `/opt/homebrew/bin:${SHELL_PATH}` };
delete cleanEnv.CLAUDECODE;
const EXEC_OPTS = { env: cleanEnv, maxBuffer: 50 * 1024 * 1024 };
const TMP_DIR = path.join(__dirname, '.bark-tmp');
const PROJECTS_DIR = path.join(__dirname, 'projects');
mkdirSync(TMP_DIR, { recursive: true });
mkdirSync(PROJECTS_DIR, { recursive: true });
const AGENTS_FILE = path.join(__dirname, 'agents.json');
const ROUTING_FILE = path.join(__dirname, 'routing.json');
const STATUS_FILE = path.join(__dirname, 'status.json');

// --- Voice transcription via whisper.cpp (local, free) ---
function transcribeAudio(audioFilePath) {
    try {
        // Voice messages come as opus-in-ogg; whisper needs 16kHz WAV
        const wavFile = audioFilePath.replace(/\.[^.]+$/, '.wav');
        execSync(`ffmpeg -i "${audioFilePath}" -ar 16000 -ac 1 -y "${wavFile}" 2>/dev/null`, {
            ...EXEC_OPTS,
            timeout: 15000,
        });
        const result = execSync(`whisper-cli -m "${WHISPER_MODEL}" --no-timestamps "${wavFile}" 2>/dev/null`, {
            ...EXEC_OPTS,
            timeout: 60000,
        });
        try { unlinkSync(wavFile); } catch {}
        return result.toString().trim() || null;
    } catch (e) {
        console.log(`  ❌ Transcription error: ${e.message.substring(0, 200)}`);
        return null;
    }
}

// --- Pup Names (Paw Patrol inspired) ---
const PUP_NAMES = [
    'Chase', 'Marshall', 'Skye', 'Rocky', 'Rubble', 'Zuma', 'Everest', 'Tracker',
    'Rex', 'Liberty', 'Tuck', 'Ella', 'Wild', 'Shade', 'Gasket', 'Arrby',
    'Robo-Dog', 'Sweetie', 'Coral', 'Cap', 'Al', 'Ryder', 'Sparks', 'Bolt',
    'Dash', 'Pepper', 'Blaze', 'Scout', 'Bandit', 'Wren', 'Ziggy', 'Nova',
];

const ADJECTIVES = [
    'happy', 'jumpy', 'brave', 'sneaky', 'zippy', 'dizzy', 'fuzzy', 'mighty',
    'swift', 'lucky', 'bouncy', 'sleepy', 'wild', 'silly', 'goofy', 'turbo',
    'cosmic', 'chill', 'spicy', 'blazing', 'gentle', 'fierce', 'golden', 'shadow',
    'tiny', 'mega', 'ultra', 'hyper', 'super', 'frosty', 'stormy', 'sunny',
];

let pupBaseIndex = 0;

function nextPupName() {
    // Collect all names currently in use (active + deleted)
    const usedNames = new Set([
        ...[...agents.values()].map(a => a.name),
        ...[...deletedAgents.values()].map(a => a.name),
    ]);

    // Try each base name starting from pupBaseIndex
    for (let i = 0; i < PUP_NAMES.length; i++) {
        const base = PUP_NAMES[(pupBaseIndex + i) % PUP_NAMES.length];
        if (!usedNames.has(base)) {
            pupBaseIndex = (pupBaseIndex + i + 1) % PUP_NAMES.length;
            return base;
        }
    }

    // All bare names taken — pick a random adjective + random base
    for (let attempt = 0; attempt < 200; attempt++) {
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const base = PUP_NAMES[Math.floor(Math.random() * PUP_NAMES.length)];
        const name = `${adj}-${base}`;
        if (!usedNames.has(name)) return name;
    }

    // Absolute fallback (32 adj x 32 names = 1024 combos)
    return `pup-${crypto.randomBytes(3).toString('hex')}`;
}

// --- Agent State ---
const agents = new Map(); // id -> agent object
const msgToAgent = new Map(); // prefixed msg id -> agent id
const deletedAgents = new Map(); // id -> deleted agent object
// --- Adapter State ---
const adapters = []; // active adapter instances
const statusMsgs = {}; // adapter.name -> pinned status msgId

function genId() {
    return crypto.randomBytes(3).toString('hex');
}

function saveState() {
    // Save agents (both active and deleted)
    const data = {};
    for (const map of [agents, deletedAgents]) {
        for (const [id, agent] of map) {
            data[id] = {
                id: agent.id,
                name: agent.name,
                backend: agent.backend || DEFAULT_BACKEND,
                sessionId: agent.sessionId,
                tmuxSession: agent.tmuxSession,
                status: agent.status,
                parentId: agent.parentId || null,
                createdAt: agent.createdAt,
                hasRun: agent.hasRun || false,
                model: agent.model || 'sonnet',
                cwd: agent.cwd || null,
                deletedAt: agent.deletedAt || null,
                source: agent.source || 'whatsapp',
            };
        }
    }
    writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));

    // Save routing map
    const routing = {};
    for (const [msgId, agentId] of msgToAgent) {
        routing[msgId] = agentId;
    }
    writeFileSync(ROUTING_FILE, JSON.stringify(routing, null, 2));

    // Save pinned status message IDs so we can unpin them after restart
    writeFileSync(STATUS_FILE, JSON.stringify(statusMsgs));
}

function loadState() {
    // Load agents
    if (existsSync(AGENTS_FILE)) {
        try {
            const data = JSON.parse(readFileSync(AGENTS_FILE, 'utf8'));
            for (const [id, agent] of Object.entries(data)) {
                // Backward compat: default source to whatsapp, backend to claude-code
                if (!agent.source) agent.source = 'whatsapp';
                if (!agent.backend) agent.backend = 'claude-code';
                if (!agent.model) agent.model = 'sonnet';
                if (!agent.cwd) agent.cwd = null;
                if (agent.status === 'active') {
                    // Respect saved hasRun — /reset sets it to false with a new session UUID.
                    // Default to true for backward compat (pre-reset agents without the field).
                    if (agent.hasRun === undefined) agent.hasRun = true;
                    agents.set(id, agent);
                } else if (agent.status === 'deleted') {
                    deletedAgents.set(id, agent);
                }
            }
            console.log(`  Restored ${agents.size} active, ${deletedAgents.size} deleted`);
        } catch (e) {
            console.log(`  ⚠️ Could not load agents: ${e.message}`);
        }
    }

    // Load routing map
    if (existsSync(ROUTING_FILE)) {
        try {
            const data = JSON.parse(readFileSync(ROUTING_FILE, 'utf8'));
            for (const [msgId, agentId] of Object.entries(data)) {
                // Backward compat: old entries without prefix are assumed WhatsApp
                const prefixed = (msgId.startsWith('wa:') || msgId.startsWith('tg:') || msgId.startsWith('slack:')) ? msgId : 'wa:' + msgId;
                msgToAgent.set(prefixed, agentId);
            }
            console.log(`  Restored ${msgToAgent.size} message routes`);
        } catch (e) {
            console.log(`  ⚠️ Could not load routing: ${e.message}`);
        }
    }

    // Load pinned status message IDs from previous session
    if (existsSync(STATUS_FILE)) {
        try {
            Object.assign(statusMsgs, JSON.parse(readFileSync(STATUS_FILE, 'utf8')));
            console.log(`  Restored pinned status IDs: ${Object.keys(statusMsgs).filter(k => statusMsgs[k]).join(', ') || 'none'}`);
        } catch {}
    }
}

// --- Core Agent Functions (adapter-agnostic) ---

async function spawnAgent(prompt, adapter, parentId = null, reuseMsgId = null, replyToId = null, model = null, forceName = null, backendName = null) {
    const id = genId();
    const name = forceName || nextPupName();

    // Get backend (default if not specified)
    const backend = backends.get(backendName) || backends.getDefault(DEFAULT_BACKEND);
    const sessionId = backend.generateSessionId();

    const tmuxSession = `bark-${name}`;

    // Create tmux session with a bash shell for the agent to work in
    try {
        execSync(`tmux new-session -d -s "${tmuxSession}"`, EXEC_OPTS);
        // Show a banner
        execSync(`tmux send-keys -t "${tmuxSession}" "echo '=== 🐕 ${name} (${id}) ==='" Enter`, EXEC_OPTS);
    } catch (e) {
        console.log(`  ⚠️ Could not create tmux session for ${name}: ${e.message}`);
    }

    const agent = {
        id, name, sessionId, tmuxSession,
        backend: backend.name,
        model: model || backend.defaultModel,
        status: 'active',
        parentId,
        createdAt: new Date().toISOString(),
        source: adapter.name,
    };
    agents.set(id, agent);
    saveState();

    console.log(`  🐕 Spawned ${name} (tmux: ${tmuxSession})`);
    await updatePinnedStatus();

    // Send one message that will be edited through the whole lifecycle:
    // "listening..." (voice) → "thinking..." → tool progress → final response
    let liveMsgId;
    if (reuseMsgId) {
        liveMsgId = reuseMsgId;
        await adapter.edit(reuseMsgId, `🐕 [${name}]:\n_thinking..._`);
    } else {
        liveMsgId = await adapter.send(`🐕 [${name}]:\n_thinking..._`, replyToId);
    }
    // Map both the user's original message AND the pup's response to this agent.
    // This way, Slack thread replies (which point to the thread parent = user's msg) route correctly.
    if (replyToId) msgToAgent.set(replyToId, id);
    if (liveMsgId) msgToAgent.set(liveMsgId, id);
    saveState();

    // Run first prompt, pass the live message ID for editing
    runAgentCommand(agent, prompt, adapter, liveMsgId);

    return agent;
}

async function sendToAgent(agent, text, adapter, reuseMsgId = null, replyToId = null, model = null) {
    if (model && model !== agent.model) {
        agent.model = model;
        saveState();
        console.log(`  🔄 ${agent.name} switched to ${model}`);
    }
    console.log(`  📤 Sent to ${agent.name}: ${text.substring(0, 80)}`);
    // For follow-ups, send a thinking message that will be edited
    let liveMsgId;
    if (reuseMsgId) {
        liveMsgId = reuseMsgId;
        await adapter.edit(reuseMsgId, `🐕 [${agent.name}]:\n_thinking..._`);
    } else {
        liveMsgId = await adapter.send(`🐕 [${agent.name}]:\n_thinking..._`, replyToId);
    }
    if (replyToId) msgToAgent.set(replyToId, agent.id);
    if (liveMsgId) msgToAgent.set(liveMsgId, agent.id);
    saveState();
    runAgentCommand(agent, text, adapter, liveMsgId);
    await updatePinnedStatus();
}

function runAgentCommand(agent, prompt, adapter, liveMsgId = null) {
    // Get the backend for this agent
    const backend = backends.get(agent.backend) || backends.getDefault(DEFAULT_BACKEND);

    const promptFile = path.join(TMP_DIR, `${agent.id}.prompt`);
    const outFile = path.join(TMP_DIR, `${agent.id}.out`);
    const doneMarker = path.join(TMP_DIR, `${agent.id}.done`);
    const progressFile = path.join(TMP_DIR, `${agent.id}.progress`);
    const displayScript = path.join(__dirname, 'stream-display.js');

    const runningMarker = path.join(TMP_DIR, `${agent.id}.running`);

    // Write prompt and clean up previous output
    writeFileSync(promptFile, prompt);
    writeFileSync(runningMarker, '1');
    for (const f of [outFile, doneMarker, progressFile]) {
        try { unlinkSync(f); } catch {}
    }

    const isResume = agent.hasRun;
    agent.hasRun = true;
    saveState();

    const cwdFile = path.join(TMP_DIR, `${agent.id}.cwd`);
    const sendDir = path.join(TMP_DIR, `${agent.id}-send`);
    mkdirSync(sendDir, { recursive: true });

    // Write system prompt to file (used on first run only)
    const sysPromptFile = path.join(TMP_DIR, `${agent.id}.sysprompt`);
    const systemPrompt = `You are ${agent.name}, a bark-pack pup. All repo work must happen inside ${PROJECTS_DIR}/ — always clone there, even if the repo exists elsewhere on this machine. Reuse existing clones inside ${PROJECTS_DIR}/ (git pull to update). Never reference or modify repos outside of ${PROJECTS_DIR}/. Work on projects using absolute paths from ${PROJECTS_DIR}/ — do NOT cd into them before running commands. When you start working in a project directory, write its absolute path to ${cwdFile} so the server can track it. To send files to the user, copy them to ${sendDir}/. Sign commits with: 🐾 Paw-Printed-By: ${agent.name} <${agent.name.toLowerCase()}@bark-pack>`;
    writeFileSync(sysPromptFile, systemPrompt);

    // cd into agent's working directory if set and still exists, otherwise stay in bark-pack
    if (agent.cwd && !existsSync(agent.cwd)) {
        console.log(`  ⚠️ ${agent.name}'s cwd no longer exists: ${agent.cwd} — resetting`);
        agent.cwd = null;
        saveState();
    }

    // Build command using backend
    const scriptFile = path.join(TMP_DIR, `${agent.id}.sh`);
    const { script } = backend.buildCommand({
        promptFile,
        sessionId: agent.sessionId,
        isResume,
        model: agent.model,
        systemPromptFile: sysPromptFile,
        streamParserScript: displayScript,
        agentId: agent.id,
        tmpDir: TMP_DIR,
    });
    writeFileSync(scriptFile, script, { mode: 0o755 });

    console.log(`  🔄 Running ${backend.displayName} for ${agent.name}...`);

    // Ensure tmux session exists (may have been lost on restart)
    try {
        execSync(`tmux has-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS);
    } catch {
        try {
            execSync(`tmux new-session -d -s "${agent.tmuxSession}"`, EXEC_OPTS);
            execSync(`tmux send-keys -t "${agent.tmuxSession}" "echo '=== 🐕 ${agent.name} (${agent.id}) === (restored)'" Enter`, EXEC_OPTS);
            console.log(`  🔄 Restored tmux session for ${agent.name}`);
        } catch (e) {
            console.log(`  ❌ Failed to create tmux session for ${agent.name}: ${e.message}`);
            adapter.send(`❌ [${agent.name}] tmux error: ${e.message.substring(0, 200)}`).catch(() => {});
            return;
        }
    }

    try {
        execSync(`tmux send-keys -t "${agent.tmuxSession}" "bash '${scriptFile}'" Enter`, EXEC_OPTS);
    } catch (e) {
        console.log(`  ❌ Failed to send command to ${agent.name} tmux: ${e.message}`);
        adapter.send(`❌ [${agent.name}] tmux error: ${e.message.substring(0, 200)}`).catch(() => {});
        return;
    }

    let lastProgress = '';

    // Poll for progress updates and edit the live message
    const poll = setInterval(async () => {
        if (shuttingDown) { clearInterval(poll); return; }
        // Update live message with progress
        if (liveMsgId && existsSync(progressFile)) {
            try {
                const progress = readFileSync(progressFile, 'utf8').trim();
                if (progress && progress !== lastProgress) {
                    lastProgress = progress;
                    const maxLen = 4096;
                    const preview = progress.length <= maxLen
                        ? progress
                        : progress.substring(0, maxLen) + '...';
                    await adapter.edit(liveMsgId, `🐕 [${agent.name}]:\n${preview}`);
                }
            } catch {}
        }

        // Check if done
        if (!existsSync(doneMarker)) return;
        clearInterval(poll);
        try { execSync(`rm -f "${runningMarker}"`, EXEC_OPTS); } catch {}

        // Detect if pup set a working directory via sentinel file
        try {
            if (existsSync(cwdFile)) {
                const newCwd = readFileSync(cwdFile, 'utf8').trim();
                if (newCwd && newCwd !== agent.cwd && existsSync(newCwd)) {
                    agent.cwd = newCwd;
                    saveState();
                    console.log(`  📂 ${agent.name} working in: ${newCwd}`);
                }
            }
        } catch {}

        await updatePinnedStatus();

        // Read the final output
        let output = '';
        try {
            output = readFileSync(outFile, 'utf8').trim();
        } catch {}

        if (!output) output = lastProgress || '(no output)';

        const maxLen = 4096;
        const text = output.length <= maxLen
            ? `🐕 [${agent.name}]:\n\n${output}`
            : `🐕 [${agent.name}] (truncated):\n\n${output.substring(0, maxLen)}...`;

        // Final edit or send new message
        if (liveMsgId) {
            const edited = await adapter.edit(liveMsgId, text);
            if (edited) {
                console.log(`  ✅ ${agent.name} responded (${output.length} chars)`);
            } else {
                // Edit failed, send new message
                const newMsgId = await adapter.send(text);
                msgToAgent.set(newMsgId, agent.id);
                saveState();
                console.log(`  ✅ ${agent.name} responded via new msg (${output.length} chars)`);
            }
        } else {
            const newMsgId = await adapter.send(text);
            msgToAgent.set(newMsgId, agent.id);
            saveState();
            console.log(`  ✅ ${agent.name} responded (${output.length} chars)`);
        }

        // Send any files the pup placed in its send directory
        try {
            if (existsSync(sendDir)) {
                const files = readdirSync(sendDir);
                for (const file of files) {
                    const filePath = path.join(sendDir, file);
                    try {
                        const caption = `📎 [${agent.name}]: ${file}`;
                        await adapter.sendFile(filePath, caption, liveMsgId);
                        console.log(`  📎 ${agent.name} sent file: ${file}`);
                    } catch (e) {
                        console.log(`  ⚠️ ${agent.name} failed to send file ${file}: ${e.message}`);
                    }
                    try { unlinkSync(filePath); } catch {}
                }
            }
        } catch {}
    }, 2000);
}

function findAgentByName(nameQuery) {
    const q = nameQuery.toLowerCase();
    for (const [, agent] of agents) {
        if (agent.name.toLowerCase() === q || agent.id === q) {
            return agent;
        }
    }
    return null;
}

function findDeletedByName(nameQuery) {
    const q = nameQuery.toLowerCase();
    let match = null;
    for (const [, agent] of deletedAgents) {
        if (agent.name.toLowerCase() === q || agent.id === q) {
            // Pick most recently deleted if multiple share a name
            if (!match || new Date(agent.deletedAt || 0) > new Date(match.deletedAt || 0)) {
                match = agent;
            }
        }
    }
    return match;
}

function softDeleteAgent(agent) {
    // Kill tmux session
    try { execSync(`tmux kill-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS); } catch {}
    // Clean up temp files
    try { execSync(`rm -f "${path.join(TMP_DIR, agent.id)}".*`, EXEC_OPTS); } catch {}
    // Soft-delete: move from active to deleted (keep routing entries for reborn hint)
    agent.status = 'deleted';
    agent.deletedAt = new Date().toISOString();
    agents.delete(agent.id);
    deletedAgents.set(agent.id, agent);
    saveState();
    console.log(`  🗑️ Cleared ${agent.name} (${agent.id}) — moved to losts`);
}

function hardDeleteAgent(agent, fromMap = agents) {
    // Kill tmux session
    try { execSync(`tmux kill-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS); } catch {}
    // Clean up temp files
    try { execSync(`rm -f "${path.join(TMP_DIR, agent.id)}".*`, EXEC_OPTS); } catch {}
    // Remove routing entries pointing to this agent
    for (const [msgId, agentId] of msgToAgent) {
        if (agentId === agent.id) msgToAgent.delete(msgId);
    }
    // Permanent delete: remove from whichever map it's in, free the name
    fromMap.delete(agent.id);
    saveState();
    console.log(`  ❌ Hard-deleted ${agent.name} (${agent.id}) — name freed`);
}

// --- Extracted command functions (shared by chat commands + REST API) ---

function stopAgents(names) {
    const stopped = [];
    const notFound = [];

    if (names.length === 1 && names[0].toLowerCase() === 'pack') {
        for (const [, agent] of agents) {
            const runningFile = path.join(TMP_DIR, `${agent.id}.running`);
            if (existsSync(runningFile)) {
                try { execSync(`tmux send-keys -t "${agent.tmuxSession}" C-c`, EXEC_OPTS); } catch {}
                try { unlinkSync(runningFile); } catch {}
                stopped.push(agent.name);
            }
        }
    } else {
        for (const name of names) {
            const agent = findAgentByName(name);
            if (agent) {
                try { execSync(`tmux send-keys -t "${agent.tmuxSession}" C-c`, EXEC_OPTS); } catch {}
                try { unlinkSync(path.join(TMP_DIR, `${agent.id}.running`)); } catch {}
                stopped.push(agent.name);
            } else {
                notFound.push(name);
            }
        }
    }

    if (stopped.length) console.log(`  🛑 Stopped: ${stopped.join(', ')}`);
    updatePinnedStatus();
    return { stopped, notFound };
}

function clearAgents(names) {
    const cleared = [];
    const notFound = [];

    if (names.length === 1 && names[0].toLowerCase() === 'pack') {
        const allAgents = [...agents.values()];
        for (const agent of allAgents) {
            cleared.push(agent.name);
            softDeleteAgent(agent);
        }
    } else {
        for (const name of names) {
            const agent = findAgentByName(name);
            if (agent) {
                cleared.push(agent.name);
                softDeleteAgent(agent);
            } else {
                notFound.push(name);
            }
        }
    }

    updatePinnedStatus();
    return { cleared, notFound };
}

function deleteAgents(names) {
    const deleted = [];
    const deletedFromLosts = [];
    const notFound = [];

    if (names.length === 1 && names[0].toLowerCase() === 'pack') {
        // Hard-delete all active + all losts
        for (const agent of [...agents.values()]) {
            deleted.push(agent.name);
            hardDeleteAgent(agent, agents);
        }
        for (const agent of [...deletedAgents.values()]) {
            deletedFromLosts.push(agent.name);
            hardDeleteAgent(agent, deletedAgents);
        }
    } else {
        for (const name of names) {
            // Check active first, then losts
            const agent = findAgentByName(name);
            if (agent) {
                deleted.push(agent.name);
                hardDeleteAgent(agent, agents);
            } else {
                const dead = findDeletedByName(name);
                if (dead) {
                    deleted.push(dead.name);
                    hardDeleteAgent(dead, deletedAgents);
                } else {
                    notFound.push(name);
                }
            }
        }
    }

    updatePinnedStatus();
    return { deleted, deletedFromLosts, notFound };
}

function rebornAgent(name) {
    const existing = findAgentByName(name);
    if (existing) return { success: false, error: `*${existing.name}* is already alive! Clear them first if you want to reborn the old one.` };

    const dead = findDeletedByName(name);
    if (!dead) return { success: false, error: `No deleted pup named "${name}". Use \`/losts\` to see available pups.` };

    dead.status = 'active';
    delete dead.deletedAt;
    dead.hasRun = true;
    deletedAgents.delete(dead.id);
    agents.set(dead.id, dead);

    dead.tmuxSession = `bark-${dead.name}`;
    try {
        execSync(`tmux new-session -d -s "${dead.tmuxSession}"`, EXEC_OPTS);
        execSync(`tmux send-keys -t "${dead.tmuxSession}" "echo '=== 🐕 ${dead.name} (${dead.id}) === (reborn)'" Enter`, EXEC_OPTS);
    } catch (e) {
        console.log(`  Could not create tmux session for ${dead.name}: ${e.message}`);
    }

    saveState();
    console.log(`  🐕 Reborn ${dead.name} (${dead.id}) with session ${dead.sessionId}`);
    updatePinnedStatus();
    return { success: true, agent: dead };
}

function resetAgents(names) {
    const reset = [];
    const notFound = [];

    if (names.length === 1 && names[0].toLowerCase() === 'pack') {
        for (const [, agent] of agents) {
            agent.sessionId = crypto.randomUUID();
            agent.hasRun = false;
            agent.cwd = null;
            try { execSync(`rm -f "${path.join(TMP_DIR, agent.id)}".*`, EXEC_OPTS); } catch {}
            console.log(`  🔄 Reset ${agent.name} — new session ${agent.sessionId}`);
            reset.push(agent.name);
        }
        saveState();
    } else {
        for (const name of names) {
            const agent = findAgentByName(name);
            if (agent) {
                agent.sessionId = crypto.randomUUID();
                agent.hasRun = false;
                agent.cwd = null;
                try { execSync(`rm -f "${path.join(TMP_DIR, agent.id)}".*`, EXEC_OPTS); } catch {}
                console.log(`  🔄 Reset ${agent.name} — new session ${agent.sessionId}`);
                reset.push(agent.name);
            } else {
                notFound.push(name);
            }
        }
        saveState();
    }

    updatePinnedStatus();
    return { reset, notFound };
}

async function runDaily(adapter) {
    const classified = classifyAgents();
    if (!classified.length) {
        await adapter.send('📋 *Daily Standup*\n\nNo active pups.');
        return;
    }

    const statusMsg = await adapter.send('📋 *Daily Standup*\n\n_Gathering reports..._');
    const lines = [];

    // Separate busy vs respondable (idle/yelp/nap — all can be asked via --resume)
    const busy = classified.filter(c => c.status === 'run');
    const idle = classified.filter(c => c.status !== 'run');

    console.log(`  📋 /daily: ${busy.length} busy, ${idle.length} to ask (idle+nap)`);

    // Busy pups: read state files, don't interrupt
    for (const { emoji, agent } of busy) {
        let context = '';
        const progressFile = path.join(TMP_DIR, `${agent.id}.progress`);
        const promptFile = path.join(TMP_DIR, `${agent.id}.prompt`);
        try {
            const progress = readFileSync(progressFile, 'utf8').trim();
            const toolLine = progress.split('\n').find(l => l.includes('→') || l.includes('💻') || l.includes('📖') || l.includes('✏️'));
            if (toolLine) context = ` — ${toolLine.trim()}`;
        } catch {}
        if (!context) {
            try {
                const prompt = readFileSync(promptFile, 'utf8').trim();
                const short = prompt.length > 60 ? prompt.substring(0, 60) + '...' : prompt;
                context = ` — working on: "${short}"`;
            } catch {}
        }
        const project = agent.cwd ? ` [${path.basename(agent.cwd)}]` : '';
        lines.push(`${emoji} *${agent.name}*${project} (busy)${context}`);
    }

    // Idle/yelp pups: ask for standup via --resume --model haiku (parallel)
    const PUP_TIMEOUT_MS = 40_000;
    const standupPromises = idle.map(({ emoji, status, agent }) => {
        const project = agent.cwd ? ` [${path.basename(agent.cwd)}]` : '';
        return new Promise((resolve) => {
            const promptFile = path.join(TMP_DIR, `${agent.id}.standup.prompt`);
            const outFile = path.join(TMP_DIR, `${agent.id}.standup.out`);
            const doneFile = path.join(TMP_DIR, `${agent.id}.standup.done`);
            const progressFile = path.join(TMP_DIR, `${agent.id}.standup.progress`);

            const scriptFile = path.join(TMP_DIR, `${agent.id}.standup.sh`);
            let resolved = false;
            function done(msg) {
                if (resolved) return;
                resolved = true;
                clearInterval(poll);
                clearTimeout(hardDeadline);
                for (const f of [promptFile, outFile, doneFile, progressFile, scriptFile]) {
                    try { unlinkSync(f); } catch {}
                }
                resolve(msg);
            }

            for (const f of [outFile, doneFile]) { try { unlinkSync(f); } catch {} }

            const standupPrompt = 'Quick standup — answer from memory, no research or tool use. 3 lines, plain text only, no markdown:\nLine 1: what you did last\nLine 2: what\'s next\nLine 3: blockers or "no blockers"';
            writeFileSync(promptFile, standupPrompt);

            const modelFlag = '--model haiku';
            const claudeArgs = agent.hasRun
                ? `--resume ${agent.sessionId} ${modelFlag}`
                : `--session-id ${agent.sessionId} ${modelFlag}`;

            // Write standup command to script file (same approach as runClaudeCommand)
            const displayScript = path.join(__dirname, 'stream-display.js');
            let script = '#!/bin/bash\n';
            script += `cat "${promptFile}" | claude -p --dangerously-skip-permissions ${claudeArgs} --output-format stream-json --verbose 2>/dev/null | node "${displayScript}" ${agent.id}.standup "${TMP_DIR}"\n`;
            writeFileSync(scriptFile, script, { mode: 0o755 });

            // Hard deadline: resolve no matter what after PUP_TIMEOUT_MS
            const hardDeadline = setTimeout(() => {
                console.log(`  ⏰ /daily: ${agent.name} timed out`);
                done(`${emoji} *${agent.name}*${project} (${status}): _timed out_`);
            }, PUP_TIMEOUT_MS);

            // Ensure tmux session exists
            try {
                execSync(`tmux has-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS);
            } catch {
                try {
                    execSync(`tmux new-session -d -s "${agent.tmuxSession}"`, EXEC_OPTS);
                } catch (e) {
                    console.log(`  ❌ /daily: couldn't reach ${agent.name}: ${e.message}`);
                    done(`${emoji} *${agent.name}*${project} (${status}): _couldn't reach_`);
                    return;
                }
            }

            try {
                execSync(`tmux send-keys -t "${agent.tmuxSession}" "bash '${scriptFile}'" Enter`, EXEC_OPTS);
                console.log(`  📤 /daily: sent standup prompt to ${agent.name}`);
            } catch (e) {
                console.log(`  ❌ /daily: tmux error for ${agent.name}: ${e.message}`);
                done(`${emoji} *${agent.name}*${project} (${status}): _couldn't reach_`);
                return;
            }

            // Poll every second for completion
            const poll = setInterval(() => {
                if (existsSync(doneFile)) {
                    let output = '';
                    try { output = readFileSync(outFile, 'utf8').trim(); } catch {}
                    console.log(`  ✅ /daily: ${agent.name} responded (${output.length} chars)`);
                    done(`${emoji} *${agent.name}*${project}:\n${output || '_no response_'}`);
                }
            }, 1000);
        });
    });

    const standupResults = await Promise.all(standupPromises);
    lines.push(...standupResults);

    const report = `📋 *Daily Standup*\n\n${lines.join('\n\n')}`;
    console.log(`  📋 /daily: report ready (${lines.length} entries)`);

    // Edit the initial message with the full report (10s timeout on API calls)
    const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
    try {
        if (statusMsg) {
            await withTimeout(adapter.edit(statusMsg, report), 10_000);
        } else {
            await withTimeout(adapter.send(report), 10_000);
        }
    } catch (e) {
        console.log(`  ⚠️ /daily: edit failed (${e.message}), sending new message`);
        try { await withTimeout(adapter.send(report), 10_000); } catch {}
    }

    // Refresh pinned status — pups that were napping are now awake
    updatePinnedStatus();
}

function timeSince(date) {
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function classifyAgents() {
    // Batch tmux session check with a single call
    const aliveSessions = new Set();
    try {
        const tmuxOut = execSync('tmux ls -F "#{session_name}" 2>/dev/null', EXEC_OPTS).toString();
        for (const line of tmuxOut.split('\n')) {
            const name = line.trim();
            if (name) aliveSessions.add(name);
        }
    } catch {} // tmux ls fails if no sessions exist

    const ranked = [];
    for (const [, agent] of agents) {
        const doneFile = path.join(TMP_DIR, `${agent.id}.done`);
        const progressFile = path.join(TMP_DIR, `${agent.id}.progress`);
        const runningFile = path.join(TMP_DIR, `${agent.id}.running`);

        const tmuxAlive = aliveSessions.has(agent.tmuxSession);

        let emoji, status, priority;
        if (!tmuxAlive) {
            emoji = '⚫'; status = 'nap'; priority = 3;
        } else if (existsSync(runningFile)) {
            emoji = '🔵'; status = 'run'; priority = 1;
        } else if (existsSync(doneFile)) {
            const exitCode = readFileSync(doneFile, 'utf8').trim();
            if (exitCode !== '0') {
                emoji = '🔴'; status = 'yelp'; priority = 0;
            } else {
                emoji = '🟢'; status = 'idle'; priority = 2;
            }
        } else if (existsSync(progressFile)) {
            emoji = '🔵'; status = 'run'; priority = 1;
        } else {
            emoji = '🟢'; status = 'idle'; priority = 2;
        }

        ranked.push({ priority, emoji, status, agent });
    }
    ranked.sort((a, b) => a.priority - b.priority);
    return ranked;
}

function getGitSummary() {
    try {
        const branch = execSync('git branch --show-current 2>/dev/null', EXEC_OPTS).toString().trim();
        const porcelain = execSync('git status --porcelain 2>/dev/null', EXEC_OPTS).toString().trim();
        const changed = porcelain ? porcelain.split('\n').length : 0;
        const parts = [`📂${branch}`];
        if (changed > 0) parts.push(`✏️${changed}`);
        return parts.join(' ');
    } catch {
        return null;
    }
}

function buildStatusText() {
    const ranked = classifyAgents();
    if (ranked.length === 0) return '🐾 No pups yet';

    // Count by status for the summary line
    const counts = {};
    for (const { status } of ranked) counts[status] = (counts[status] || 0) + 1;

    // Summary line: icons only, git info on same line
    const parts = [];
    if (counts.yelp) parts.push(`🔴${counts.yelp}`);
    if (counts.run) parts.push(`🔵${counts.run}`);
    if (counts.idle) parts.push(`🟢${counts.idle}`);
    if (counts.nap) parts.push(`⚫${counts.nap}`);
    const git = getGitSummary();
    const summary = `🐾 ${parts.join(' ')}${git ? ` · ${git}` : ''}`;

    const lines = [summary];
    for (const { emoji, status, agent } of ranked) {
        const backendTag = agent.backend && agent.backend !== DEFAULT_BACKEND ? ` [${agent.backend}]` : '';
        const modelTag = agent.model && agent.model !== 'sonnet' ? ` [${agent.model}]` : '';
        const projectTag = agent.cwd ? ` 📂${path.basename(agent.cwd)}` : '';
        lines.push(`${emoji} *${agent.name}*${backendTag}${modelTag}${projectTag} ${status}`);
    }

    return lines.join('\n');
}

let statusUpdatePending = false;
let statusUpdateRunning = false;

async function updatePinnedStatus() {
    if (adapters.length === 0) return;

    // If already running, mark pending and return — the running call will re-run with fresh state
    if (statusUpdateRunning) {
        statusUpdatePending = true;
        return;
    }

    statusUpdateRunning = true;
    try {
        const text = buildStatusText();

        for (const adapter of adapters) {
            if (!adapter.isReady()) continue;
            try {
                const existingId = statusMsgs[adapter.name];
                if (existingId) {
                    const edited = await adapter.edit(existingId, text);
                    if (edited) continue;
                    // Edit failed (message deleted?), unpin old and send a new one
                    try { await adapter.unpin(existingId); } catch {}
                    statusMsgs[adapter.name] = null;
                }
                // Send new status message, pin it
                const msgId = await adapter.send(text);
                if (!msgId) continue; // adapter had no channel to send to
                await adapter.pin(msgId);
                statusMsgs[adapter.name] = msgId;
                console.log(`  📌 Pinned new status message (${adapter.name})`);
            } catch (e) {
                console.log(`  ⚠️ Could not update pinned status (${adapter.name}): ${e.message}`);
            }
        }
    } finally {
        statusUpdateRunning = false;
        // If someone called while we were running, re-run with latest state
        if (statusUpdatePending) {
            statusUpdatePending = false;
            updatePinnedStatus();
        }
    }
}

// --- Message Handler (platform-agnostic) ---

async function onMessage(msg) {
    console.log(`\n[DEBUG] Message received: sender="${msg.sender}" senderId="${msg.senderId}" text="${msg.text?.substring(0, 50)}"`);
    const adapter = msg.adapter;

    // --- Owner filter: ignore messages from non-owners ---
    // Set per-platform owner ID in .env (comma-separated for multiple), or DANGER-ALL to allow everyone
    const owners = OWNER_IDS[adapter.name];
    if (!owners) {
        if (!adapter._ownerWarned) {
            console.log(`  ⚠️ ${adapter.name}: No owner configured — ignoring all messages. Set ${adapter.name === 'whatsapp' ? 'WA_OWNER' : adapter.name === 'telegram' ? 'TG_OWNER' : 'SLACK_OWNER'} in .env`);
            adapter._ownerWarned = true;
        }
        return;
    }
    if (owners !== 'DANGER-ALL' && !owners.has(msg.senderId)) {
        console.log(`  ⚠️ Owner mismatch: senderId="${msg.senderId}" not in owners=[${[...owners].join(', ')}]`);
        return;
    }

    let body = msg.text;

    // --- Handle media messages ---
    let mediaContext = '';
    let listeningMsgId = null; // reusable message ID for voice UX
    if (msg.hasMedia && msg.mediaType === 'image') {
        const downloaded = await adapter.downloadMedia(msg.raw);
        if (downloaded) {
            mediaContext = `[Image attached: ${downloaded.filePath}]\nUse the Read tool to view this image, then respond.\n\n`;
            console.log(`  📷 Saved image: ${downloaded.filePath}`);
        }
    } else if (msg.hasMedia && msg.mediaType === 'voice') {
        const downloaded = await adapter.downloadMedia(msg.raw);
        if (downloaded) {
            console.log(`  🎤 Saved voice: ${downloaded.filePath}`);

            // Send "listening..." as reply — will be edited to "thinking..." after transcription
            listeningMsgId = await adapter.send('🎤 _listening..._', msg.id);

            const transcript = await transcribeAudio(downloaded.filePath);
            if (transcript) {
                body = body ? `${body}\n\n[Voice message transcription]: ${transcript}` : transcript;
                mediaContext = `[Voice message transcribed from: ${downloaded.filePath}]\n\n`;
                console.log(`  🎤 Transcribed: ${transcript.substring(0, 100)}`);
            } else {
                mediaContext = `[Voice message received but could not be transcribed: ${downloaded.filePath}]\n\n`;
            }
        }
    }

    if (!body && !mediaContext) return;

    console.log(`\n[${new Date().toLocaleTimeString()}] ${msg.sender}: ${body || '(media)'}`);

    // --- Commands (intercepted before routing) ---
    if (body.startsWith('/')) {
        // Clean up orphan listening message if voice was a command
        if (listeningMsgId) {
            await adapter.deleteMsg(listeningMsgId);
        }
        const command = body.split(/\s+/)[0].toLowerCase();
        if (command === '/help') {
            await adapter.send(
                '*Commands:*\n' +
                '`/status` — show pack status\n' +
                '`/stop name` — stop a running pup\n' +
                '`/stop pack` — stop all running pups\n' +
                '`/clear name` — shelve pup (can /reborn)\n' +
                '`/clear pack` — shelve all pups\n' +
                '`/delete name` — permanently remove pup (frees name)\n' +
                '`/delete pack` — permanently remove all\n' +
                '`/reset name` — wipe pup memory (stays active)\n' +
                '`/reset pack` — wipe all pup memory\n' +
                '`/create` — reply to a message to spawn a new pup with that context\n' +
                '`/losts` — show shelved pups\n' +
                '`/purge` — permanently delete all shelved pups\n' +
                '`/reborn name` — resurrect a shelved pup\n' +
                '`/daily` — daily standup from all pups\n' +
                '`/backends` — show available LLM backends\n' +
                '`/restart` — restart the server\n' +
                '`/shutdown` — shut down the server (no auto-restart)\n\n' +
                '*Routing:*\n' +
                '`@name msg` — send to agent\n' +
                'Reply to agent msg — send to that agent\n' +
                'New message — spawns a new pup'
            );
            return;
        }
        if (command === '/status') {
            await updatePinnedStatus();
            return;
        }
        if (command === '/backends') {
            await adapter.send(backends.formatCapabilityMatrix());
            return;
        }
        if (command === '/losts') {
            if (deletedAgents.size === 0) {
                await adapter.send('No lost pups. All accounted for!');
                return;
            }
            const lines = [`💀 *Lost Pups* _${deletedAgents.size} shelved_\n`];
            const sorted = [...deletedAgents.values()].sort((a, b) =>
                new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0)
            );
            for (const agent of sorted) {
                const age = timeSince(new Date(agent.createdAt));
                const died = agent.deletedAt ? timeSince(new Date(agent.deletedAt)) : 'unknown';
                lines.push(`💀 *${agent.name}* — born ${age}, shelved ${died}`);
            }
            lines.push(`\n_Use \`/reborn name\` to resurrect_`);
            const msgText = lines.join('\n');
            await adapter.send(msgText.length > 4000 ? msgText.substring(0, 3950) + '...' : msgText);
            return;
        }
        if (command === '/purge') {
            if (deletedAgents.size === 0) {
                await adapter.send('No lost pups to purge.');
                return;
            }
            const count = deletedAgents.size;
            const names = [...deletedAgents.values()].map(a => a.name);
            for (const agent of [...deletedAgents.values()]) {
                hardDeleteAgent(agent, deletedAgents);
            }
            await adapter.send(`🗑️ Purged ${count} lost pups. All names freed.`);
            await updatePinnedStatus();
            return;
        }
        if (command === '/reborn') {
            const name = body.split(/\s+/).slice(1).join(' ').replace(/^@/, '').trim();
            if (!name) {
                await adapter.send('Usage: `/reborn name` — resurrect a deleted pup.\nUse `/losts` to see available pups.');
                return;
            }

            const result = rebornAgent(name);
            if (!result.success) {
                await adapter.send(result.error);
                return;
            }
            await adapter.send(`🐕 *${result.agent.name}* is back! Session restored — send a message to pick up where you left off.`);
            return;
        }
        if (command === '/create') {
            const parts = body.split(/\s+/).slice(1);
            const firstWord = parts[0] || '';
            const isNameArg = firstWord.startsWith('@');

            let forceName = null;
            let extraText = '';

            if (isNameArg) {
                const rawName = firstWord.replace(/^@/, '').trim();
                extraText = parts.slice(1).join(' ').trim();
                if (!rawName) {
                    await adapter.send('Usage: `/create @name` — name cannot be empty.');
                    return;
                }
                // Normalize casing: use canonical PUP_NAMES casing if it matches, else use input as-is
                forceName = PUP_NAMES.find(n => n.toLowerCase() === rawName.toLowerCase()) || rawName;
                // Check collision case-insensitively (active + deleted)
                const allAgents = [...agents.values(), ...deletedAgents.values()];
                const collision = allAgents.find(a => a.name.toLowerCase() === forceName.toLowerCase());
                if (collision) {
                    await adapter.send(`A pup named *${collision.name}* already exists. Use a different name.`);
                    return;
                }
            } else {
                extraText = parts.join(' ').trim();
            }

            if (!msg.isQuotedReply && !extraText && !forceName) {
                await adapter.send('Usage: reply to a message with `/create` to spawn a new pup with that context.\nOptionally add instructions: `/create review this code`\nOptionally name the pup: `/create @name`');
                return;
            }

            // Build prompt from quoted message + optional extra instructions
            let prompt = '';
            if (msg.isQuotedReply) {
                const quoted = await adapter.getQuotedMessage(msg.raw);
                const quotedBody = quoted ? quoted.body : '';
                if (extraText) {
                    prompt = `[context]:\n${quotedBody}\n\n[instructions]:\n${extraText}`;
                } else {
                    prompt = quotedBody;
                }
            } else {
                prompt = extraText;
            }

            // Parse #model tag from prompt
            let model = null;
            const modelMatch = prompt.match(/#(haiku|sonnet|opus)\b/i);
            if (modelMatch) {
                model = modelMatch[1].toLowerCase();
                prompt = prompt.replace(/#(haiku|sonnet|opus)\b/i, '').trim();
            }

            const agent = await spawnAgent(prompt, adapter, null, listeningMsgId, msg.id, model, forceName);
            return;
        }
        if (command === '/stop') {
            const names = body.split(/\s+/).slice(1).map(n => n.replace(/^@/, ''));

            if (names.length === 0 && msg.isQuotedReply) {
                const quoted = await adapter.getQuotedMessage(msg.raw);
                if (!quoted) { await adapter.send('Could not find quoted message.'); return; }
                const agentId = msgToAgent.get(quoted.id);
                const agent = agentId && agents.get(agentId);
                if (!agent) { await adapter.send('No agent found for that message.'); return; }
                const result = stopAgents([agent.name]);
                await adapter.send(`🛑 *${agent.name}* stopped.`);
                return;
            }

            if (names.length === 0) {
                await adapter.send('Usage: `/stop name` or `/stop pack` or reply to a message with `/stop`');
                return;
            }

            const { stopped, notFound } = stopAgents(names);
            let response = '';
            if (stopped.length) response += `🛑 Stopped: *${stopped.join('*, *')}*`;
            else if (names[0].toLowerCase() === 'pack') response = 'No pups are running.';
            if (notFound.length) response += `${stopped.length ? '\n' : ''}❓ Not found: ${notFound.join(', ')}`;
            await adapter.send(response);
            return;
        }
        if (command === '/clear') {
            const names = body.split(/\s+/).slice(1).map(n => n.replace(/^@/, ''));

            if (names.length === 0 && msg.isQuotedReply) {
                const quoted = await adapter.getQuotedMessage(msg.raw);
                if (!quoted) { await adapter.send('Could not find quoted message.'); return; }
                const agentId = msgToAgent.get(quoted.id);
                const agent = agentId && agents.get(agentId);
                if (!agent) { await adapter.send('No agent found for that message.'); return; }
                const agentName = agent.name;
                clearAgents([agent.name]);
                await adapter.send(`🧹 *${agentName}* shelved.\nUse \`/reborn ${agentName}\` to bring back.`);
                return;
            }

            if (names.length === 0) {
                await adapter.send('Usage: /clear name1 name2 ... or /clear pack or reply to a message with /clear');
                return;
            }

            const { cleared, notFound } = clearAgents(names);
            let response = '';
            if (cleared.length) {
                const isPack = names.length === 1 && names[0].toLowerCase() === 'pack';
                response = isPack
                    ? `🧹 Entire pack shelved: *${cleared.join('*, *')}*\nUse \`/losts\` to see them, \`/reborn name\` to bring back.`
                    : `🧹 Shelved: *${cleared.join('*, *')}*`;
            }
            if (notFound.length) response += `${cleared.length ? '\n' : ''}❓ Not found: ${notFound.join(', ')}`;
            await adapter.send(response);
            return;
        }
        if (command === '/delete') {
            const names = body.split(/\s+/).slice(1).map(n => n.replace(/^@/, ''));

            if (names.length === 0 && msg.isQuotedReply) {
                const quoted = await adapter.getQuotedMessage(msg.raw);
                if (!quoted) { await adapter.send('Could not find quoted message.'); return; }
                const agentId = msgToAgent.get(quoted.id);
                const agent = agentId && (agents.get(agentId) || deletedAgents.get(agentId));
                if (!agent) { await adapter.send('No agent found for that message.'); return; }
                const agentName = agent.name;
                deleteAgents([agent.name]);
                await adapter.send(`❌ *${agentName}* permanently deleted. Name freed.`);
                return;
            }

            if (names.length === 0) {
                await adapter.send('Usage: /delete name1 name2 ... or /delete pack or reply to a message with /delete');
                return;
            }

            const { deleted, deletedFromLosts, notFound } = deleteAgents(names);
            const allDeleted = [...deleted, ...deletedFromLosts];
            let response = '';
            if (allDeleted.length) {
                const isPack = names.length === 1 && names[0].toLowerCase() === 'pack';
                if (isPack) {
                    const parts = [];
                    if (deleted.length) parts.push(`${deleted.length} active`);
                    if (deletedFromLosts.length) parts.push(`${deletedFromLosts.length} shelved`);
                    response = `❌ Entire pack permanently deleted (${parts.join(' + ')}). All names freed.`;
                } else {
                    response = `❌ Permanently deleted: *${allDeleted.join('*, *')}*`;
                }
            }
            if (notFound.length) response += `${allDeleted.length ? '\n' : ''}❓ Not found: ${notFound.join(', ')}`;
            await adapter.send(response);
            return;
        }
        if (command === '/reset') {
            const names = body.split(/\s+/).slice(1).map(n => n.replace(/^@/, ''));

            if (names.length === 0 && msg.isQuotedReply) {
                const quoted = await adapter.getQuotedMessage(msg.raw);
                if (!quoted) { await adapter.send('Could not find quoted message.'); return; }
                const agentId = msgToAgent.get(quoted.id);
                const agent = agentId && agents.get(agentId);
                if (!agent) { await adapter.send('No agent found for that message.'); return; }
                resetAgents([agent.name]);
                await adapter.send(`🔄 *${agent.name}* memory wiped. Next message starts fresh.`);
                return;
            }

            if (names.length === 0) {
                await adapter.send('Usage: /reset name1 name2 ... or /reset pack or reply to a message with /reset');
                return;
            }

            const { reset, notFound } = resetAgents(names);
            let response = '';
            if (reset.length) {
                const isPack = names.length === 1 && names[0].toLowerCase() === 'pack';
                response = isPack
                    ? `🔄 Entire pack reset: *${reset.join('*, *')}*\nAll pups start fresh on next message.`
                    : `🔄 Reset: *${reset.join('*, *')}*`;
            }
            if (notFound.length) response += `${reset.length ? '\n' : ''}❓ Not found: ${notFound.join(', ')}`;
            await adapter.send(response);
            return;
        }
        if (command === '/daily') {
            await runDaily(adapter);
            return;
        }
        if (command === '/shutdown') {
            await adapter.send('🌙 Pack going offline. Goodnight.');
            console.log(`  🌙 Shutdown requested via ${adapter.name}`);
            for (const [, agent] of agents) {
                if (agent.tmuxSession) {
                    try { execSync(`tmux kill-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS); } catch {}
                }
            }
            await destroyAllAdapters();
            process.exit(2); // non-zero = start.sh does NOT restart
        }
        if (command === '/restart') {
            const restartMessages = [
                '🐾 Quick shake...',
                '💤 Pup nap, brb',
                '🔄 Rebooting pups...',
                '🦴 Chewed a cable',
            ];
            await adapter.send(restartMessages[Math.floor(Math.random() * restartMessages.length)]);
            console.log(`  🔄 Restart requested via ${adapter.name}`);
            // Kill tmux sessions, then exit cleanly (start.sh will restart)
            for (const [, agent] of agents) {
                if (agent.tmuxSession) {
                    try { execSync(`tmux kill-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS); } catch {}
                }
            }
            await destroyAllAdapters();
            process.exit(0);
        }
    }

    // Parse #model tag (e.g. #haiku, #sonnet, #opus) and strip from body
    let requestedModel = null;
    const modelMatch = body.match(/#(haiku|sonnet|opus)\b/i);
    if (modelMatch) {
        requestedModel = modelMatch[1].toLowerCase();
        body = body.replace(/#(haiku|sonnet|opus)\b/i, '').trim();
    }

    // Prepend media context to body for all routes
    const fullBody = mediaContext + (body || 'Respond to the attached media.');

    // --- Route 1: @mention at start of message (first match routes, typos error out) ---
    const atMatch = body.match(/^@(\S+)/);
    if (atMatch) {
        const agent = findAgentByName(atMatch[1].replace(/[,.:;!?]+$/, ''));
        if (!agent) {
            await adapter.send(`❓ Unknown pup: ${atMatch[1]}`);
            return;
        }
        const text = body.replace(/@\S+/g, '').trim();
        // If replying to a message, include the quoted message as context
        let prompt = mediaContext + (text || body || 'Respond to the attached media.');
        if (msg.isQuotedReply) {
            const quoted = await adapter.getQuotedMessage(msg.raw);
            const quotedBody = quoted ? quoted.body : '';
            prompt = `${mediaContext}[quoted message]:\n${quotedBody}\n\n[reply]:\n${text || body}`;
            console.log(`  ↳ Routed to ${agent.name} (via @mention + reply context)`);
        } else {
            console.log(`  ↳ Routed to ${agent.name} (via @mention)`);
        }
        sendToAgent(agent, prompt, adapter, listeningMsgId, msg.id, requestedModel);
        return;
    }

    // --- Route 2: Reply to an agent's message ---
    if (msg.isQuotedReply) {
        const quoted = await adapter.getQuotedMessage(msg.raw);
        if (quoted) {
            const agentId = msgToAgent.get(quoted.id);

            if (agentId) {
                // Check active agents first
                if (agents.has(agentId)) {
                    const agent = agents.get(agentId);
                    if (agent.status === 'active') {
                        console.log(`  ↳ Routed to ${agent.name} (via reply)`);
                        sendToAgent(agent, fullBody, adapter, listeningMsgId, msg.id, requestedModel);
                        return;
                    }
                }
                // Check deleted agents — hint about /reborn
                if (deletedAgents.has(agentId)) {
                    const dead = deletedAgents.get(agentId);
                    await adapter.send(`💀 *${dead.name}* was shelved. Use \`/reborn ${dead.name}\` to bring them back.`);
                    return;
                }
            }
        }
        console.log(`  ↳ Reply to unknown agent, spawning new`);
    }

    // --- Route 3: New message → spawn new agent ---
    spawnAgent(fullBody, adapter, null, listeningMsgId, msg.id, requestedModel);
}

// --- Adapter Lifecycle ---

async function destroyAllAdapters() {
    for (const adapter of adapters) {
        try { await adapter.destroy(); } catch {}
    }
}

// --- Graceful shutdown ---
let shuttingDown = false;

process.on('SIGINT', async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down...');

    // Kill agent tmux sessions
    for (const [, agent] of agents) {
        if (agent.tmuxSession) {
            try { execSync(`tmux kill-session -t "${agent.tmuxSession}" 2>/dev/null`, EXEC_OPTS); } catch {}
        }
    }

    // Send goodbye on all adapters then destroy
    for (const adapter of adapters) {
        try { await adapter.sendGoodbye(); } catch {}
    }
    await destroyAllAdapters();
    process.exit(0);
});

process.on('SIGTERM', () => process.kill(process.pid, 'SIGINT'));

// --- Startup ---

async function main() {
    console.log('Starting multi-bark-pack...');
    loadState();

    // Initialize backends
    console.log('Initializing backends...');
    await backends.initialize({
        enabledBackends: ENABLED_BACKENDS,
        defaultBackend: DEFAULT_BACKEND,
    });

    // Clean up stale .running markers from previous session
    try {
        const staleRunning = execSync(`ls "${TMP_DIR}"/*.running 2>/dev/null || true`, EXEC_OPTS).toString().trim();
        if (staleRunning) {
            for (const f of staleRunning.split('\n')) {
                if (f.trim()) try { unlinkSync(f.trim()); } catch {}
            }
            console.log('  🧹 Cleaned stale .running markers');
        }
    } catch {}

    // Initialize adapters based on config
    if (WA_ENABLED) {
        console.log('Initializing WhatsApp adapter...');
        const wa = createWhatsAppAdapter({ groupName: GROUP_NAME });
        adapters.push(wa);
        await wa.initialize(onMessage);
        if (!statusMsgs.whatsapp) statusMsgs.whatsapp = null;
    }

    if (TELEGRAM_TOKEN) {
        console.log('Initializing Telegram adapter...');
        const tg = createTelegramAdapter({ token: TELEGRAM_TOKEN, chatId: TELEGRAM_CHAT_ID });
        adapters.push(tg);
        await tg.initialize(onMessage);
        if (!statusMsgs.telegram) statusMsgs.telegram = null;
    }

    if (SLACK_BOT_TOKEN && SLACK_APP_TOKEN) {
        console.log('Initializing Slack adapter...');
        const slack = createSlackAdapter({
            botToken: SLACK_BOT_TOKEN,
            appToken: SLACK_APP_TOKEN,
            owners: OWNER_IDS.slack,
        });
        adapters.push(slack);
        await slack.initialize(onMessage);
        if (!statusMsgs.slack) statusMsgs.slack = null;
    }

    if (adapters.length === 0) {
        console.error('No adapters configured! Set WA_ENABLED=true (default), TELEGRAM_TOKEN, or SLACK_BOT_TOKEN + SLACK_APP_TOKEN.');
        process.exit(1);
    }

    // Send startup message + fresh pinned status on all adapters
    const startMessages = [
        '🐾 Pack\'s up!',
        '🐕 Pups online!',
        '🦴 Who\'s a good bot?',
        '🚨 Paws ready!',
    ];
    const greeting = startMessages[Math.floor(Math.random() * startMessages.length)];
    for (const adapter of adapters) {
        if (adapter.isReady()) {
            try { await adapter.send(greeting); } catch {}
        }
    }
    await updatePinnedStatus();

    console.log(`bark-pack running with ${adapters.length} adapter(s): ${adapters.map(a => a.name).join(', ')}`);
}

// Export for testing
module.exports = {
    // State
    agents,
    deletedAgents,
    msgToAgent,

    // Agent lifecycle
    spawnAgent,
    sendToAgent,
    findAgentByName,
    findDeletedByName,
    softDeleteAgent,
    hardDeleteAgent,

    // Commands
    stopAgents,
    clearAgents,
    deleteAgents,
    rebornAgent,
    resetAgents,

    // Utilities
    genId,
    nextPupName,
    saveState,
    loadState,
    buildStatusText,
    classifyAgents,

    // Config
    TMP_DIR,
    PROJECTS_DIR,
    DEFAULT_BACKEND,
};

// Only run main() when executed directly (not when required as module)
if (require.main === module) {
    main().catch(e => {
        console.error('Fatal startup error:', e);
        process.exit(1);
    });
}
