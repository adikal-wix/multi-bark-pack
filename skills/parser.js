/**
 * SKILL.md Parser
 * Parses skill files with YAML frontmatter + markdown content
 */

/**
 * Parse a SKILL.md file content
 * @param {string} content - Raw file content
 * @returns {object} Parsed skill object
 */
function parseSkillFile(content) {
    const lines = content.split('\n');

    // Check for YAML frontmatter
    if (lines[0].trim() !== '---') {
        // No frontmatter, treat entire content as markdown
        return {
            name: null,
            description: null,
            userInvocable: false,
            content: content.trim(),
        };
    }

    // Find end of frontmatter
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        // Malformed frontmatter
        return {
            name: null,
            description: null,
            userInvocable: false,
            content: content.trim(),
        };
    }

    // Parse frontmatter
    const frontmatter = lines.slice(1, endIndex).join('\n');
    const metadata = parseFrontmatter(frontmatter);

    // Extract markdown content (after frontmatter)
    const markdown = lines.slice(endIndex + 1).join('\n').trim();

    return {
        name: metadata.name || null,
        description: metadata.description || null,
        userInvocable: metadata['user-invocable'] === true || metadata['user-invocable'] === 'true',
        content: markdown,
    };
}

/**
 * Parse YAML-like frontmatter (simple key: value pairs)
 * @param {string} frontmatter - Frontmatter content
 * @returns {object} Parsed key-value pairs
 */
function parseFrontmatter(frontmatter) {
    const result = {};
    const lines = frontmatter.split('\n');

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        // Handle boolean values
        if (value === 'true') value = true;
        else if (value === 'false') value = false;

        result[key] = value;
    }

    return result;
}

/**
 * Estimate token count for content (rough approximation)
 * @param {string} content - Text content
 * @returns {number} Estimated token count
 */
function estimateTokens(content) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
}

module.exports = {
    parseSkillFile,
    parseFrontmatter,
    estimateTokens,
};
