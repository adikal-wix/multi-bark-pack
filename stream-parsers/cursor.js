/**
 * Cursor Agent stream-json parser
 * Processes streaming output from `agent -p --output-format stream-json`
 */

const TOOL_ICONS = {
    Bash: '💻', Read: '📖', Edit: '✏️', Write: '📝', Grep: '🔍', Glob: '📂',
    WebFetch: '🌐', WebSearch: '🌐', Skill: '⚡', Task: '🔀',
    shell: '💻', read: '📖', edit: '✏️', write: '📝', grep: '🔍',
};

function toolIcon(name) {
    // Check exact match first
    if (TOOL_ICONS[name]) return TOOL_ICONS[name];

    // Check prefix/contains
    for (const [key, icon] of Object.entries(TOOL_ICONS)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return icon;
    }

    // MCP tools
    if (name.startsWith('mcp__')) return '🔌';

    return '🔧';
}

/**
 * Extract tool name from Cursor's tool_call structure
 */
function extractToolName(toolCall) {
    if (!toolCall) return 'tool';

    // Shell tool
    if (toolCall.shellToolCall) {
        return 'Bash';
    }

    // File read tool
    if (toolCall.readToolCall) {
        return 'Read';
    }

    // File edit tool
    if (toolCall.editToolCall) {
        return 'Edit';
    }

    // File write tool
    if (toolCall.writeToolCall) {
        return 'Write';
    }

    // Grep tool
    if (toolCall.grepToolCall) {
        return 'Grep';
    }

    // Glob tool
    if (toolCall.globToolCall) {
        return 'Glob';
    }

    // Try to extract from any *ToolCall property
    for (const key of Object.keys(toolCall)) {
        if (key.endsWith('ToolCall')) {
            const name = key.replace('ToolCall', '');
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
    }

    return 'tool';
}

module.exports = {
    name: 'cursor',
    toolIcons: TOOL_ICONS,

    /**
     * Parse a single line of stream-json output
     * @param {string} line - Raw JSON line from CLI
     * @returns {object|null} Parsed event or null if unparseable
     */
    parseLine(line) {
        if (!line.trim()) return null;

        try {
            const data = JSON.parse(line);

            // Thinking delta
            if (data.type === 'thinking' && data.subtype === 'delta') {
                return {
                    type: 'thinking',
                    text: data.text || '',
                };
            }

            // Tool call started
            if (data.type === 'tool_call' && data.subtype === 'started') {
                const toolName = extractToolName(data.tool_call);
                return {
                    type: 'tool',
                    name: toolName,
                    icon: toolIcon(toolName),
                };
            }

            // Assistant text message
            if (data.type === 'assistant' && data.message?.content) {
                const textContent = data.message.content.find(c => c.type === 'text');
                if (textContent?.text) {
                    return {
                        type: 'text',
                        text: textContent.text,
                    };
                }
            }

            // Final result
            if (data.type === 'result') {
                return {
                    type: 'result',
                    text: data.result || '',
                    isError: !!data.is_error,
                    sessionId: data.session_id || null,
                };
            }

            // System init (can extract session_id if needed)
            if (data.type === 'system' && data.subtype === 'init') {
                return {
                    type: 'init',
                    sessionId: data.session_id,
                    model: data.model,
                    cwd: data.cwd,
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
