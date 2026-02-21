/**
 * Skills Manager
 * Cross-backend skill system - loads skills once at startup
 */

const { existsSync, readdirSync, readFileSync } = require('fs');
const path = require('path');
const { parseSkillFile, estimateTokens } = require('./parser');

// In-memory skill registry
const skills = new Map();

// Default skills directory (Claude Code compatible)
const SKILLS_DIR = path.join(__dirname, '..', '.claude', 'skills');

/**
 * Initialize skills registry - call once at server startup
 * @param {string} skillsDir - Optional custom skills directory
 * @returns {object} Summary of loaded skills
 */
function initialize(skillsDir = SKILLS_DIR) {
    skills.clear();

    if (!existsSync(skillsDir)) {
        console.log('  ⚠️ Skills directory not found:', skillsDir);
        return { loaded: 0, skills: [] };
    }

    const dirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    const loaded = [];

    for (const dir of dirs) {
        const skillFile = path.join(skillsDir, dir, 'SKILL.md');

        if (!existsSync(skillFile)) {
            continue;
        }

        try {
            const content = readFileSync(skillFile, 'utf8');
            const parsed = parseSkillFile(content);

            // Use directory name as skill ID, parsed name as display name
            const skillId = dir;
            const skill = {
                id: skillId,
                name: parsed.name || skillId,
                description: parsed.description || '',
                userInvocable: parsed.userInvocable,
                content: parsed.content,
                tokens: estimateTokens(parsed.content),
                path: skillFile,
            };

            skills.set(skillId, skill);
            loaded.push(skillId);
        } catch (err) {
            console.log(`  ⚠️ Failed to load skill ${dir}:`, err.message);
        }
    }

    if (loaded.length > 0) {
        console.log(`  ⚡ Loaded ${loaded.length} skills: ${loaded.join(', ')}`);
    }

    return { loaded: loaded.length, skills: loaded };
}

/**
 * Get a skill by ID
 * @param {string} id - Skill ID
 * @returns {object|null} Skill object or null
 */
function get(id) {
    return skills.get(id) || null;
}

/**
 * List all available skills
 * @param {boolean} userInvocableOnly - Only return user-invocable skills
 * @returns {Array} Array of skill summaries
 */
function list(userInvocableOnly = false) {
    const result = [];

    for (const skill of skills.values()) {
        if (userInvocableOnly && !skill.userInvocable) {
            continue;
        }

        result.push({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            tokens: skill.tokens,
            userInvocable: skill.userInvocable,
        });
    }

    return result;
}

/**
 * Check if a skill exists
 * @param {string} id - Skill ID
 * @returns {boolean}
 */
function has(id) {
    return skills.has(id);
}

/**
 * Get skill content for injection into system prompt
 * @param {string} id - Skill ID
 * @returns {string|null} Skill content or null
 */
function getContent(id) {
    const skill = skills.get(id);
    return skill ? skill.content : null;
}

/**
 * Build combined skill content for multiple skills
 * @param {Array<string>} skillIds - Array of skill IDs
 * @returns {string} Combined skill content
 */
function buildSkillPrompt(skillIds) {
    if (!skillIds || skillIds.length === 0) {
        return '';
    }

    const parts = [];

    for (const id of skillIds) {
        const content = getContent(id);
        if (content) {
            parts.push(content);
        }
    }

    if (parts.length === 0) {
        return '';
    }

    return '\n\n---\n\n' + parts.join('\n\n---\n\n');
}

/**
 * Get total token count for skills
 * @param {Array<string>} skillIds - Array of skill IDs
 * @returns {number} Total estimated tokens
 */
function getTokenCount(skillIds) {
    let total = 0;

    for (const id of skillIds) {
        const skill = skills.get(id);
        if (skill) {
            total += skill.tokens;
        }
    }

    return total;
}

/**
 * Format skills list for display
 * @returns {string} Formatted skills list
 */
function formatList() {
    const skillList = list(true);

    if (skillList.length === 0) {
        return 'No skills available.';
    }

    const lines = ['*Available Skills:*', ''];

    for (const skill of skillList) {
        lines.push(`• \`/${skill.id}\` — ${skill.description} (~${skill.tokens} tokens)`);
    }

    lines.push('');
    lines.push('_Use `/skill <name>` to activate a skill for a pup._');

    return lines.join('\n');
}

module.exports = {
    initialize,
    get,
    list,
    has,
    getContent,
    buildSkillPrompt,
    getTokenCount,
    formatList,
};
