---
name: add-backend
description: Scaffold a new LLM backend for multi-bark-pack
user-invocable: true
---

# Add Backend Skill

Scaffold a new LLM agent backend for multi-bark-pack.

## Usage

```
/add-backend cursor
/add-backend codex
/add-backend <backend-name>
```

## Steps to Add a New Backend

### 1. Create Backend Module

Create `backends/<name>.js`:

```javascript
/**
 * <Name> CLI Backend
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

const EXEC_OPTS = { encoding: 'utf8', timeout: 5000 };

module.exports = function create<Name>Backend(config = {}) {
    return {
        name: '<name>',
        displayName: '<Display Name>',

        async isInstalled() {
            try {
                execSync('which <cli-command>', EXEC_OPTS);
                return true;
            } catch {
                return false;
            }
        },

        async getVersion() {
            try {
                const output = execSync('<cli-command> --version', EXEC_OPTS);
                return output.trim();
            } catch {
                return null;
            }
        },

        models: ['model1', 'model2'],
        defaultModel: 'model1',

        validateModel(model) {
            return this.models.includes(model);
        },

        canResume: true,

        generateSessionId() {
            return crypto.randomUUID();
        },

        buildCommand(opts) {
            const { promptFile, sessionId, isResume, model, systemPromptFile, streamParserScript, agentId, tmpDir } = opts;

            // Build CLI-specific command
            let script = '#!/bin/bash\n';
            script += `# TODO: Implement <name> CLI invocation\n`;

            return { script, env: {} };
        },

        streamParserName: '<name>',

        extractSessionId(output) {
            return null;
        },

        capabilities: {
            streaming: true,
            sessionPersistence: true,
            workingDirectory: true,
            forceMode: true,
            systemPrompt: true,
            planning: true,
        },
    };
};
```

### 2. Create Stream Parser

Create `stream-parsers/<name>.js`:

```javascript
/**
 * <Name> stream parser
 */

const TOOL_ICONS = {
    // Map tool names to icons
};

module.exports = {
    name: '<name>',
    toolIcons: TOOL_ICONS,

    parseLine(line) {
        // Parse CLI output format
        // Return: { type: 'text'|'tool'|'result', ... }
    },

    getToolIcon(name) {
        return TOOL_ICONS[name] || '🔧';
    },
};
```

### 3. Register Backend

In `backends/index.js`, add:

```javascript
const create<Name>Backend = require('./<name>');

const backendFactories = {
    'claude-code': createClaudeCodeBackend,
    '<name>': create<Name>Backend,  // Add this
};
```

### 4. Register Parser

In `stream-parsers/index.js`, add:

```javascript
const <name>Parser = require('./<name>');

const parsers = {
    claude: claudeParser,
    '<name>': <name>Parser,  // Add this
};
```

### 5. Update Config

In `.env.example`, add:

```bash
ENABLED_BACKENDS=claude-code,<name>
```

### 6. Test

```bash
node server.js
# In chat: /backends (should show new backend)
# Spawn a pup with new backend (once implemented)
```

## Checklist

- [ ] Backend module in `backends/<name>.js`
- [ ] Stream parser in `stream-parsers/<name>.js`
- [ ] Registered in `backends/index.js`
- [ ] Registered in `stream-parsers/index.js`
- [ ] CLI availability check works
- [ ] Session management works
- [ ] Streaming output parsed correctly
- [ ] Updated docs in CLAUDE.md
