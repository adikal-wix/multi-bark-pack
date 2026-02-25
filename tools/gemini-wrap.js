#!/usr/bin/env node
// Wraps Gemini CLI plain text output into JSON lines for stream-display.js

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

const SKIP_PATTERNS = ['Loaded cached credentials', 'Code Assist'];

rl.on('line', (line) => {
    if (!line.trim()) return;
    if (SKIP_PATTERNS.some(p => line.includes(p))) return;
    console.log(JSON.stringify({ type: 'message', role: 'assistant', content: line + '\n' }));
});

rl.on('close', () => {
    console.log(JSON.stringify({ type: 'result', status: 'success' }));
});
