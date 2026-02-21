#!/usr/bin/env node
// Reads stream-json from claude -p on stdin
// Writes clean status to .progress file (for WhatsApp live editing)
// Writes final result to .out file + creates .done marker

const agentId = process.argv[2];
const tmpDir = process.argv[3];
if (!agentId || !tmpDir) {
    console.error('Usage: stream-display.js <agent-id> <tmp-dir>');
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const progressFile = path.join(tmpDir, `${agentId}.progress`);
const outFile = path.join(tmpDir, `${agentId}.out`);
const doneMarker = path.join(tmpDir, `${agentId}.done`);

// --- State ---
let fullText = '';
let progressText = ''; // text_delta content used as "thinking" preview
const tools = [];
let lastWrite = 0;
const THROTTLE_MS = 800;
const THINKING_PREVIEW_LEN = 200;

const TOOL_ICONS = {
    Bash: '💻', Read: '📖', Edit: '✏️', Write: '📝', Grep: '🔍', Glob: '📂',
    WebFetch: '🌐', WebSearch: '🌐', Skill: '⚡', Task: '🔀',
};

function toolIcon(name) {
    for (const [key, icon] of Object.entries(TOOL_ICONS)) {
        if (name.startsWith(key) || name.includes(key)) return icon;
    }
    if (name.startsWith('mcp__')) return '🔌';
    return '🔧';
}

function buildStatus() {
    const lines = [];

    // Thinking preview (italic in WhatsApp: _text_)
    if (progressText) {
        // Take last N chars of thinking, trim to last complete word
        let preview = progressText.slice(-THINKING_PREVIEW_LEN).trim();
        const firstSpace = preview.indexOf(' ');
        if (firstSpace > 0 && preview.length >= THINKING_PREVIEW_LEN) {
            preview = preview.substring(firstSpace + 1);
        }
        lines.push(`_${preview.replace(/\n/g, ' ')}_`);
    }

    // Tool chain
    if (tools.length > 0) {
        const chain = tools.slice(-5).map(t => `${toolIcon(t)} ${t}`).join(' → ');
        lines.push(chain);
    }

    if (lines.length === 0) {
        return '_thinking..._';
    }

    return lines.join('\n');
}

function writeProgress() {
    fs.writeFileSync(progressFile, buildStatus());
    lastWrite = Date.now();
}

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const data = JSON.parse(line);

            if (data.type === 'stream_event') {
                const event = data.event;

                // Thinking streaming (if available in future)
                if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
                    progressText += event.delta.thinking;
                    process.stdout.write('\x1b[2m' + event.delta.thinking + '\x1b[0m'); // dim in tmux
                }

                // Text streaming - also used as live "thinking" preview
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    fullText += event.delta.text;
                    progressText += event.delta.text;
                    process.stdout.write(event.delta.text);
                }

                // Tool use - track it
                if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                    const toolName = event.content_block.name || 'tool';
                    tools.push(toolName);
                    process.stdout.write(`\n${toolIcon(toolName)} ${toolName}\n`);
                    writeProgress();
                }

                // Thinking block starts
                if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
                    process.stdout.write('\n💭 ');
                }
            }

            // Final result
            if (data.type === 'result') {
                const finalText = data.result || fullText;
                fs.writeFileSync(outFile, finalText);
                fs.writeFileSync(doneMarker, String(data.is_error ? 1 : 0));
                process.stdout.write('\n✅ Done\n');
            }

        } catch (e) {
            // skip
        }
    }

    // Throttled progress updates
    if (Date.now() - lastWrite > THROTTLE_MS) {
        writeProgress();
    }
});

process.stdin.on('end', () => {
    if (!fs.existsSync(doneMarker)) {
        fs.writeFileSync(outFile, fullText || '(no output)');
        fs.writeFileSync(doneMarker, '1');
    }
});
