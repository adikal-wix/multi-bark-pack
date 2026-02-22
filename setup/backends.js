/**
 * Backend Setup
 * Install, check, authenticate, and test LLM backends
 */

const { execSync, spawn } = require('child_process');

const EXEC_OPTS = { encoding: 'utf8', timeout: 15000 };

const BACKENDS = {
    'claude-code': {
        name: 'claude-code',
        displayName: 'Claude Code',
        cli: 'claude',
        installCmd: 'npm install -g @anthropic-ai/claude-code',
        versionCmd: 'claude --version',
        testCmd: 'claude --version',
        authType: 'cli-login',
        authInstructions: 'Run `claude` in terminal to complete browser-based login.',
        models: ['opus', 'sonnet', 'haiku'],
        defaultModel: 'sonnet',
    },
    cursor: {
        name: 'cursor',
        displayName: 'Cursor',
        cli: 'agent',
        installCmd: 'brew install --cask cursor-cli',
        versionCmd: 'agent --version',
        testCmd: 'agent --version',
        authType: 'desktop-app',
        authInstructions: 'Login through the Cursor desktop app. The CLI shares auth with the desktop app.',
        models: ['auto'],
        defaultModel: 'auto',
    },
    codex: {
        name: 'codex',
        displayName: 'Codex',
        cli: 'codex',
        installCmd: 'npm install -g @openai/codex',
        versionCmd: 'codex --version',
        testCmd: 'codex --version',
        authType: 'device-auth',
        authCmd: 'codex login --device-auth',
        authInstructions: 'Free tier available via ChatGPT account. Click "Login" to start device auth flow.',
        models: ['default', 'o3', 'o4-mini'],
        defaultModel: 'default',
    },
    gemini: {
        name: 'gemini',
        displayName: 'Gemini',
        cli: 'gemini',
        installCmd: 'npm install -g @google/gemini-cli',
        versionCmd: 'gemini --version',
        testCmd: 'gemini --version',
        authType: 'api-key',
        authEnvVar: 'GEMINI_API_KEY',
        authInstructions: 'Get an API key from Google AI Studio (aistudio.google.com) and paste it below.',
        models: ['auto-gemini-2.5', 'gemini-2.5-pro', 'gemini-2.5-flash'],
        defaultModel: 'auto-gemini-2.5',
    },
};

function checkBackend(name) {
    const backend = BACKENDS[name];
    if (!backend) return { name, error: 'Unknown backend' };

    let installed = false;
    let version = null;

    try {
        execSync(`which ${backend.cli}`, EXEC_OPTS);
        installed = true;
    } catch {}

    if (installed) {
        try {
            version = execSync(backend.versionCmd, EXEC_OPTS).trim();
            // Some CLIs dump garbage — only take first line if too long
            if (version.length > 200) {
                version = version.split('\n')[0].slice(0, 100);
            }
        } catch {}
    }

    return {
        name: backend.name,
        displayName: backend.displayName,
        installed,
        version,
        authType: backend.authType,
        authInstructions: backend.authInstructions,
        authEnvVar: backend.authEnvVar || null,
        models: backend.models,
        defaultModel: backend.defaultModel,
    };
}

function checkAll() {
    return Object.keys(BACKENDS).map(checkBackend);
}

function installBackend(name, onData) {
    const backend = BACKENDS[name];
    if (!backend) throw new Error(`Unknown backend: ${name}`);

    return new Promise((resolve, reject) => {
        const proc = spawn('bash', ['-c', backend.installCmd], {
            env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
        });

        let output = '';
        proc.stdout.on('data', chunk => {
            output += chunk.toString();
            if (onData) onData(chunk.toString());
        });
        proc.stderr.on('data', chunk => {
            output += chunk.toString();
            if (onData) onData(chunk.toString());
        });

        proc.on('close', code => {
            if (code === 0) {
                const status = checkBackend(name);
                resolve({ success: true, ...status, output });
            } else {
                reject(new Error(`Install failed (exit ${code}): ${output.slice(-500)}`));
            }
        });
    });
}

function testBackend(name) {
    const backend = BACKENDS[name];
    if (!backend) return { success: false, error: 'Unknown backend' };

    try {
        const output = execSync(backend.testCmd, { ...EXEC_OPTS, timeout: 30000 }).trim();
        // Truncate huge output (Cursor sometimes dumps JS bundles)
        const clean = output.length > 200 ? output.split('\n')[0].slice(0, 100) : output;
        return { success: true, output: clean };
    } catch (e) {
        return { success: false, error: e.message.slice(0, 300) };
    }
}

function startDeviceAuth(name, onData) {
    const backend = BACKENDS[name];
    if (!backend || backend.authType !== 'device-auth') {
        throw new Error(`Backend ${name} does not support device auth`);
    }

    return new Promise((resolve, reject) => {
        const proc = spawn('bash', ['-c', backend.authCmd], {
            env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
        });

        let output = '';
        proc.stdout.on('data', chunk => {
            const text = chunk.toString();
            output += text;
            if (onData) onData(text);
        });
        proc.stderr.on('data', chunk => {
            const text = chunk.toString();
            output += text;
            if (onData) onData(text);
        });

        proc.on('close', code => {
            if (code === 0 || output.includes('Successfully logged in')) {
                resolve({ success: true, output });
            } else {
                reject(new Error(`Auth failed (exit ${code}): ${output.slice(-500)}`));
            }
        });
    });
}

function testGeminiKey(apiKey) {
    try {
        // Quick validation: key format check
        if (!apiKey || !apiKey.startsWith('AIza')) {
            return { success: false, error: 'Invalid API key format (should start with AIza)' };
        }
        return { success: true, message: 'API key format valid' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { checkAll, checkBackend, installBackend, testBackend, startDeviceAuth, testGeminiKey, BACKENDS };
