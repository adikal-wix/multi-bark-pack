#!/usr/bin/env node
/**
 * bark-pack Setup Wizard Server
 * Guided installation and configuration
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { spawn } = require('child_process');

const checks = require('./setup/checks');
const backends = require('./setup/backends');
const adapters = require('./setup/adapters');
const envWriter = require('./setup/env-writer');

const PORT = 3333;
const app = express();
const server = http.createServer(app);

app.use(express.json());

// --- WebSocket ---
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
        wss.handleUpgrade(req, socket, head, ws => {
            wsClients.add(ws);
            ws.on('close', () => wsClients.delete(ws));
        });
    } else {
        socket.destroy();
    }
});

function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const ws of wsClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

// --- Static ---
app.use(express.static(path.join(__dirname, 'ui')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui', 'setup.html'));
});

// --- Prerequisites ---
app.get('/api/setup/prerequisites', (req, res) => {
    res.json(checks.checkAll());
});

app.post('/api/setup/prerequisites/install', async (req, res) => {
    const { name } = req.body;
    try {
        broadcast({ type: 'install_start', target: name });
        const result = await checks.installPrereq(name, data => {
            broadcast({ type: 'install_stream', target: name, data });
        });
        broadcast({ type: 'install_done', target: name, success: true });
        res.json(result);
    } catch (e) {
        broadcast({ type: 'install_done', target: name, success: false, error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// --- Backends ---
app.get('/api/setup/backends', (req, res) => {
    res.json(backends.checkAll());
});

app.post('/api/setup/backends/:name/install', async (req, res) => {
    const { name } = req.params;
    try {
        broadcast({ type: 'install_start', target: `backend-${name}` });
        const result = await backends.installBackend(name, data => {
            broadcast({ type: 'install_stream', target: `backend-${name}`, data });
        });
        broadcast({ type: 'install_done', target: `backend-${name}`, success: true });
        res.json(result);
    } catch (e) {
        broadcast({ type: 'install_done', target: `backend-${name}`, success: false, error: e.message });
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/setup/backends/:name/test', (req, res) => {
    const { name } = req.params;
    res.json(backends.testBackend(name));
});

app.post('/api/setup/backends/:name/auth', async (req, res) => {
    const { name } = req.params;
    const { apiKey } = req.body || {};

    // Gemini: save API key
    if (name === 'gemini' && apiKey) {
        const result = backends.testGeminiKey(apiKey);
        if (result.success) {
            // Store in process env for immediate use
            process.env.GEMINI_API_KEY = apiKey;
        }
        return res.json(result);
    }

    // Codex: device auth flow
    if (name === 'codex') {
        try {
            broadcast({ type: 'auth_start', target: name });
            const result = await backends.startDeviceAuth(name, data => {
                broadcast({ type: 'auth_stream', target: name, data });
            });
            broadcast({ type: 'auth_done', target: name, success: true });
            res.json(result);
        } catch (e) {
            broadcast({ type: 'auth_done', target: name, success: false, error: e.message });
            res.status(500).json({ error: e.message });
        }
        return;
    }

    res.json({ message: `${name} auth is handled externally. Check instructions.` });
});

// --- Adapters ---
app.get('/api/setup/adapters', (req, res) => {
    res.json(adapters.getAdapterInfo());
});

app.post('/api/setup/adapters/:name/test', async (req, res) => {
    const { name } = req.params;
    const config = req.body || {};
    const result = await adapters.testAdapter(name, config);
    res.json(result);
});

// --- Environment ---
app.get('/api/setup/env', (req, res) => {
    res.json(envWriter.readEnvRedacted());
});

app.post('/api/setup/env', (req, res) => {
    try {
        const result = envWriter.writeEnv(req.body);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Launch ---
app.post('/api/setup/launch', (req, res) => {
    res.json({ message: 'Run `yarn start` or `node server.js` to start the server.' });
    // Close setup server after a short delay
    setTimeout(() => {
        console.log('\n  Setup complete. Starting main server...\n');
        const main = spawn('node', ['server.js'], {
            cwd: __dirname,
            stdio: 'inherit',
            detached: true,
            env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
        });
        main.unref();
        process.exit(0);
    }, 1000);
});

// --- Start ---
server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║     bark-pack // setup wizard        ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  http://localhost:${PORT}               ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});
