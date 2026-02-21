/**
 * Claude Code stream-json parser
 * Processes streaming output from `claude -p --output-format stream-json`
 */

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

module.exports = {
    name: 'claude',
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

            // Stream events
            if (data.type === 'stream_event') {
                const event = data.event;

                // Thinking delta
                if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
                    return {
                        type: 'thinking',
                        text: event.delta.thinking,
                    };
                }

                // Text delta
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    return {
                        type: 'text',
                        text: event.delta.text,
                    };
                }

                // Tool use start
                if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                    const toolName = event.content_block.name || 'tool';
                    return {
                        type: 'tool',
                        name: toolName,
                        icon: toolIcon(toolName),
                    };
                }

                // Thinking block start
                if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
                    return {
                        type: 'thinking_start',
                    };
                }
            }

            // Final result
            if (data.type === 'result') {
                return {
                    type: 'result',
                    text: data.result || '',
                    isError: !!data.is_error,
                    usage: data.usage || null,
                    costUsd: data.total_cost_usd || null,
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
