/**
 * Google Gemini CLI stream parser
 * Processes streaming output from `gemini --output-format stream-json`
 */

const TOOL_ICONS = {
    Bash: '💻', Read: '📖', Edit: '✏️', Write: '📝', Grep: '🔍', Glob: '📂',
    WebFetch: '🌐', WebSearch: '🌐', Skill: '⚡', Task: '🔀',
    list_directory: '📂', read_file: '📖', write_file: '📝', edit_file: '✏️',
    shell: '💻', run_command: '💻',
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
    name: 'gemini',
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

            // Init message - extract session ID
            if (data.type === 'init') {
                return {
                    type: 'init',
                    sessionId: data.session_id,
                    model: data.model,
                };
            }

            // User message (echo)
            if (data.type === 'message' && data.role === 'user') {
                return null;  // Skip user message echo
            }

            // Assistant message
            if (data.type === 'message' && data.role === 'assistant') {
                return {
                    type: 'text',
                    text: data.content || '',
                    delta: data.delta || false,
                };
            }

            // Tool use
            if (data.type === 'tool_use') {
                const toolName = data.tool_name || 'tool';
                return {
                    type: 'tool',
                    name: toolName,
                    icon: toolIcon(toolName),
                    toolId: data.tool_id,
                    parameters: data.parameters,
                };
            }

            // Tool result
            if (data.type === 'tool_result') {
                return {
                    type: 'tool_result',
                    toolId: data.tool_id,
                    status: data.status,
                    output: data.output,
                };
            }

            // Final result
            if (data.type === 'result') {
                return {
                    type: 'result',
                    text: '',
                    isError: data.status !== 'success',
                    stats: data.stats || null,
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
