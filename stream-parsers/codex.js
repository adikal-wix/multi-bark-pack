/**
 * OpenAI Codex CLI stream parser
 * Processes streaming output from `codex exec --json`
 */

const TOOL_ICONS = {
    Bash: '💻', Read: '📖', Edit: '✏️', Write: '📝', Grep: '🔍', Glob: '📂',
    WebFetch: '🌐', WebSearch: '🌐', Skill: '⚡', Task: '🔀',
    command_execution: '💻', shell: '💻',
};

function toolIcon(name) {
    // Check exact match first
    if (TOOL_ICONS[name]) return TOOL_ICONS[name];

    // Check prefix/contains
    for (const [key, icon] of Object.entries(TOOL_ICONS)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return icon;
    }

    return '🔧';
}

module.exports = {
    name: 'codex',
    toolIcons: TOOL_ICONS,

    /**
     * Parse a single line of JSON output
     * @param {string} line - Raw JSON line from CLI
     * @returns {object|null} Parsed event or null if unparseable
     */
    parseLine(line) {
        if (!line.trim()) return null;

        try {
            const data = JSON.parse(line);

            // Thread started - extract session ID
            if (data.type === 'thread.started') {
                return {
                    type: 'init',
                    sessionId: data.thread_id,
                };
            }

            // Item completed
            if (data.type === 'item.completed' && data.item) {
                const item = data.item;

                // Reasoning/thinking
                if (item.type === 'reasoning') {
                    return {
                        type: 'thinking',
                        text: item.text || '',
                    };
                }

                // Agent message (response)
                if (item.type === 'agent_message') {
                    return {
                        type: 'text',
                        text: item.text || '',
                    };
                }

                // Command execution (tool use)
                if (item.type === 'command_execution') {
                    return {
                        type: 'tool',
                        name: 'Bash',
                        icon: '💻',
                        command: item.command,
                        output: item.aggregated_output,
                        exitCode: item.exit_code,
                        status: item.status,
                    };
                }
            }

            // Item started (tool in progress)
            if (data.type === 'item.started' && data.item) {
                const item = data.item;

                if (item.type === 'command_execution') {
                    return {
                        type: 'tool',
                        name: 'Bash',
                        icon: '💻',
                        command: item.command,
                        status: 'in_progress',
                    };
                }
            }

            // Turn completed (final result)
            if (data.type === 'turn.completed') {
                return {
                    type: 'result',
                    text: '',  // Codex doesn't include final text in turn.completed
                    isError: false,
                    usage: data.usage || null,
                };
            }

            return null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Get icon for a tool name
     */
    getToolIcon(name) {
        return toolIcon(name);
    },
};
