/**
 * Adapter Setup
 * Validate and test chat platform connections
 */

const ADAPTERS = {
    telegram: {
        name: 'telegram',
        displayName: 'Telegram',
        envVars: [
            { key: 'TELEGRAM_TOKEN', label: 'Bot Token', placeholder: '123456:ABC-DEF...', required: true, secret: true },
            { key: 'TG_OWNER', label: 'Owner ID(s)', placeholder: '123456789', required: true, secret: false, description: 'Your Telegram user ID. Send /start to @userinfobot to get it.' },
        ],
        instructions: '1. Message @BotFather on Telegram\n2. Send /newbot and follow prompts\n3. Copy the bot token',
    },
    whatsapp: {
        name: 'whatsapp',
        displayName: 'WhatsApp',
        envVars: [
            { key: 'WA_ENABLED', label: 'Enabled', placeholder: 'true', required: true, secret: false, default: 'true' },
            { key: 'WA_GROUP', label: 'Group Name', placeholder: 'bark-pack', required: true, secret: false, description: 'Name of the WhatsApp group to monitor' },
            { key: 'WA_OWNER', label: 'Owner ID(s)', placeholder: '972501234567', required: true, secret: false, description: 'Your phone number with country code, no + or spaces' },
        ],
        instructions: '1. Create a WhatsApp group (e.g., "bark-pack")\n2. On first server start, scan the QR code in terminal\n3. The bot will listen in the specified group',
    },
    slack: {
        name: 'slack',
        displayName: 'Slack',
        envVars: [
            { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-...', required: true, secret: true },
            { key: 'SLACK_APP_TOKEN', label: 'App Token', placeholder: 'xapp-...', required: true, secret: true, description: 'Socket Mode app-level token' },
            { key: 'SLACK_OWNER', label: 'Owner ID(s)', placeholder: 'U0123456789', required: true, secret: false, description: 'Your Slack user ID' },
        ],
        instructions: '1. Create a Slack App at api.slack.com/apps\n2. Enable Socket Mode\n3. Add Bot Token Scopes: chat:write, channels:history, im:history, users:read\n4. Install to workspace\n5. Copy Bot Token (xoxb-) and App Token (xapp-)',
    },
};

async function testTelegram(token) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (data.ok) {
            return {
                success: true,
                botName: data.result.username,
                botId: data.result.id,
                message: `Connected as @${data.result.username}`,
            };
        }
        return { success: false, error: data.description || 'Invalid token' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function testSlack(botToken) {
    try {
        const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
        });
        const data = await res.json();
        if (data.ok) {
            return {
                success: true,
                team: data.team,
                botId: data.user_id,
                message: `Connected to ${data.team} as ${data.user}`,
            };
        }
        return { success: false, error: data.error || 'Auth failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function testAdapter(name, config) {
    switch (name) {
        case 'telegram':
            return testTelegram(config.TELEGRAM_TOKEN);
        case 'slack':
            return testSlack(config.SLACK_BOT_TOKEN);
        case 'whatsapp':
            return {
                success: true,
                message: 'WhatsApp auth happens on first server start (QR code scan). Config looks valid.',
                note: 'You will need to scan a QR code in terminal when the server starts.',
            };
        default:
            return { success: false, error: `Unknown adapter: ${name}` };
    }
}

function getAdapterInfo() {
    return Object.values(ADAPTERS);
}

module.exports = { testAdapter, getAdapterInfo, ADAPTERS };
