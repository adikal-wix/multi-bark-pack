/**
 * Prerequisite Checks
 * Detects and installs system dependencies
 */

const { execSync, spawn } = require('child_process');

const EXEC_OPTS = { encoding: 'utf8', timeout: 10000 };

const PREREQUISITES = [
    {
        name: 'node',
        displayName: 'Node.js',
        required: true,
        check: () => {
            try {
                const v = execSync('node --version', EXEC_OPTS).trim();
                return { installed: true, version: v };
            } catch {
                return { installed: false };
            }
        },
        installCmd: 'brew install node',
    },
    {
        name: 'tmux',
        displayName: 'tmux',
        required: true,
        check: () => {
            try {
                const v = execSync('tmux -V', EXEC_OPTS).trim();
                return { installed: true, version: v };
            } catch {
                return { installed: false };
            }
        },
        installCmd: 'brew install tmux',
    },
    {
        name: 'ffmpeg',
        displayName: 'ffmpeg',
        required: false,
        description: 'Required for voice message transcription',
        check: () => {
            try {
                const out = execSync('ffmpeg -version', EXEC_OPTS);
                const v = out.split('\n')[0].replace('ffmpeg version ', '').split(' ')[0];
                return { installed: true, version: v };
            } catch {
                return { installed: false };
            }
        },
        installCmd: 'brew install ffmpeg',
    },
    {
        name: 'whisper',
        displayName: 'whisper.cpp',
        required: false,
        description: 'Required for voice message transcription',
        check: () => {
            try {
                execSync('which whisper-cli', EXEC_OPTS);
                return { installed: true, version: 'found' };
            } catch {
                try {
                    execSync('which whisper', EXEC_OPTS);
                    return { installed: true, version: 'found' };
                } catch {
                    return { installed: false };
                }
            }
        },
        installCmd: 'brew install whisper-cpp',
    },
];

function checkAll() {
    return PREREQUISITES.map(prereq => {
        const status = prereq.check();
        return {
            name: prereq.name,
            displayName: prereq.displayName,
            required: prereq.required,
            description: prereq.description || '',
            installed: status.installed,
            version: status.version || null,
            installCmd: prereq.installCmd,
        };
    });
}

function installPrereq(name, onData) {
    const prereq = PREREQUISITES.find(p => p.name === name);
    if (!prereq) throw new Error(`Unknown prerequisite: ${name}`);

    return new Promise((resolve, reject) => {
        const proc = spawn('bash', ['-c', prereq.installCmd], {
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
                const status = prereq.check();
                resolve({ success: true, version: status.version, output });
            } else {
                reject(new Error(`Install failed (exit ${code}): ${output.slice(-500)}`));
            }
        });
    });
}

module.exports = { checkAll, installPrereq, PREREQUISITES };
