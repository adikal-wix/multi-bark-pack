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
const sessionFile = path.join(tmpDir, `${agentId}.session`);
const usageFile = path.join(tmpDir, `${agentId}.usage`);

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

            // ═══════════════════════════════════════════════════════════
            // CLAUDE CODE FORMAT
            // ═══════════════════════════════════════════════════════════
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

            // Final result (Claude)
            if (data.type === 'result') {
                const finalText = data.result || fullText;
                fs.writeFileSync(outFile, finalText);
                fs.writeFileSync(doneMarker, String(data.is_error ? 1 : 0));
                // Write usage/cost data if present (Claude Code only)
                if (data.usage || data.total_cost_usd) {
                    fs.writeFileSync(usageFile, JSON.stringify({
                        costUsd: data.total_cost_usd || null,
                        usage: data.usage || null,
                    }));
                }
                process.stdout.write('\n✅ Done\n');
            }

            // ═══════════════════════════════════════════════════════════
            // CODEX FORMAT
            // ═══════════════════════════════════════════════════════════
            if (data.type === 'thread.started') {
                process.stdout.write(`🧵 Session: ${data.thread_id}\n`);
                // Write session ID to file for server to read
                if (data.thread_id) {
                    fs.writeFileSync(sessionFile, data.thread_id);
                }
            }

            if (data.type === 'item.completed' && data.item) {
                const item = data.item;

                // Reasoning/thinking
                if (item.type === 'reasoning') {
                    progressText += item.text || '';
                    process.stdout.write('\x1b[2m' + (item.text || '') + '\x1b[0m');
                    writeProgress();
                }

                // Agent message (response)
                if (item.type === 'agent_message') {
                    fullText += (item.text || '') + '\n';
                    progressText += item.text || '';
                    process.stdout.write(item.text || '');
                    writeProgress();
                }

                // Command execution (tool use)
                if (item.type === 'command_execution') {
                    tools.push('Bash');
                    process.stdout.write(`\n💻 Bash: ${item.command || ''}\n`);
                    if (item.aggregated_output) {
                        process.stdout.write(item.aggregated_output + '\n');
                    }
                    writeProgress();
                }
            }

            if (data.type === 'turn.completed') {
                fs.writeFileSync(outFile, fullText || '(no output)');
                fs.writeFileSync(doneMarker, '0');
                process.stdout.write('\n✅ Done\n');
            }

            // ═══════════════════════════════════════════════════════════
            // GEMINI FORMAT
            // ═══════════════════════════════════════════════════════════
            if (data.type === 'init' && data.session_id) {
                process.stdout.write(`🧵 Session: ${data.session_id}\n`);
                // Write session ID to file for server to read
                fs.writeFileSync(sessionFile, data.session_id);
            }

            if (data.type === 'message' && data.role === 'assistant') {
                const text = data.content || '';
                fullText += text;
                progressText += text;
                process.stdout.write(text);
                writeProgress();
            }

            if (data.type === 'result' && data.status) {
                // Gemini result format
                fs.writeFileSync(outFile, fullText || '(no output)');
                fs.writeFileSync(doneMarker, data.status === 'success' ? '0' : '1');
                process.stdout.write('\n✅ Done\n');
            }

            // ═══════════════════════════════════════════════════════════
            // CURSOR FORMAT
            // ═══════════════════════════════════════════════════════════
            if (data.type === 'system' && data.subtype === 'init') {
                process.stdout.write(`🧵 Session: ${data.session_id}\n`);
                // Write session ID to file for server to read
                if (data.session_id) {
                    fs.writeFileSync(sessionFile, data.session_id);
                }
            }

            if (data.type === 'thinking' && data.subtype === 'delta') {
                progressText += data.text || '';
                process.stdout.write('\x1b[2m' + (data.text || '') + '\x1b[0m');
            }

            if (data.type === 'assistant' && data.message?.content) {
                // Extract text from content array
                for (const block of data.message.content) {
                    if (block.type === 'text' && block.text) {
                        fullText += block.text;
                        progressText += block.text;
                        process.stdout.write(block.text);
                    }
                    if (block.type === 'tool_use') {
                        const toolName = block.name || 'tool';
                        tools.push(toolName);
                        process.stdout.write(`\n${toolIcon(toolName)} ${toolName}\n`);
                    }
                }
                writeProgress();
            }

            if (data.type === 'result' && data.subtype) {
                // Cursor result format
                const finalText = data.result || fullText;
                fs.writeFileSync(outFile, finalText);
                fs.writeFileSync(doneMarker, data.is_error ? '1' : '0');
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
