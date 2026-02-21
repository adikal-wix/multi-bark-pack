const { WebClient } = require('@slack/web-api');
const { SocketModeClient } = require('@slack/socket-mode');
const { writeFileSync, readFileSync } = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', '.bark-tmp');

function createSlackAdapter({ botToken, appToken, owners }) {
    let web = null;
    let socket = null;
    let socketReady = false;
    let botUserId = null;
    let dmChannelId = null; // DM channel with owner for status + fallback sends

    // User name cache to avoid repeated API calls
    const userNameCache = new Map();
    async function getUserName(userId) {
        if (userNameCache.has(userId)) return userNameCache.get(userId);
        try {
            const info = await web.users.info({ user: userId });
            const name = info.user.profile.display_name
                || info.user.profile.real_name
                || info.user.name;
            userNameCache.set(userId, name);
            return name;
        } catch {
            return 'Unknown';
        }
    }

    const adapter = {
        name: 'slack',

        async initialize(onMessage) {
            web = new WebClient(botToken);
            socket = new SocketModeClient({ appToken });

            // Validate credentials and get bot user ID
            const authResult = await web.auth.test();
            botUserId = authResult.user_id;
            console.log(`Slack bot: @${authResult.user} (${botUserId})`);

            // Open DM channel with first owner for status pin + startup messages
            // DANGER-ALL has no specific owner, so status pins are disabled in that mode
            const firstOwner = (owners instanceof Set) ? owners.values().next().value : null;
            if (!firstOwner && owners === 'DANGER-ALL') {
                console.log(`  ⚠️ Slack: DANGER-ALL mode — no owner DM channel, status pins disabled`);
            }
            if (firstOwner) {
                try {
                    const dm = await web.conversations.open({ users: firstOwner });
                    dmChannelId = dm.channel.id;
                    console.log(`Slack DM channel with owner: ${dmChannelId}`);

                    // Unpin old status messages from previous runs
                    try {
                        const pins = await web.pins.list({ channel: dmChannelId });
                        for (const item of (pins.items || [])) {
                            const msg = item.message;
                            if (msg && msg.user === botUserId &&
                                (msg.text.startsWith('🐾') || msg.text.startsWith('📋'))) {
                                try { await web.pins.remove({ channel: dmChannelId, timestamp: msg.ts }); } catch {}
                            }
                        }
                    } catch {}
                } catch (e) {
                    console.log(`  ⚠️ Could not open Slack DM with owner: ${e.message}`);
                }
            }

            console.log(`Slack listening for @mentions in all channels`);

            // Listen for 'message' events directly (emitted by Socket Mode for events_api envelopes)
            // Note: 'slack_event' does NOT include the `event` field — only 'message' does
            socket.on('message', async ({ event, body, ack }) => {
                await ack();

                if (!event) return;
                if (event.user === botUserId) return;
                if (event.subtype) return;
                if (event.bot_id) return;

                const text = (event.text || '').trim();

                // Slack encodes mentions as <@U12345>
                const botMention = `<@${botUserId}>`;
                const isMention = text.includes(botMention);
                const isThreadReply = !!event.thread_ts && event.thread_ts !== event.ts;
                // channel_type is 'im' for DMs — but Socket Mode may deliver it
                // via event.channel_type OR we can check if channel starts with 'D'
                const isDM = event.channel_type === 'im' || (event.channel && event.channel.startsWith('D'));

                console.log(`  [slack] msg from ${event.user} in ${event.channel} (type=${event.channel_type||'?'}, isDM=${isDM}, mention=${isMention}, thread=${isThreadReply}): ${text.substring(0, 80)}`);

                // Respond to: DMs, direct @mentions, or thread replies
                if (!isDM && !isMention && !isThreadReply) return;

                // Strip the bot mention from the text
                // User can write "@bark-pack @Chase do this" to target a specific pup
                const cleanText = text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim();

                const sender = await getUserName(event.user);

                // Determine media type
                let hasMedia = false;
                let mediaType = null;
                if (event.files && event.files.length > 0) {
                    const file = event.files[0];
                    if (file.mimetype && file.mimetype.startsWith('image/')) {
                        hasMedia = true;
                        mediaType = 'image';
                    } else if (file.mimetype && file.mimetype.startsWith('audio/')) {
                        hasMedia = true;
                        mediaType = 'voice';
                    }
                }

                const normalized = {
                    id: packId(event.channel, event.ts),
                    text: cleanText,
                    sender,
                    senderId: event.user,
                    hasMedia,
                    mediaType,
                    isQuotedReply: isThreadReply,
                    raw: event,
                    adapter,
                };

                onMessage(normalized);
            });

            await socket.start();
            socketReady = true;
            console.log('Slack Socket Mode connected');
        },

        async destroy() {
            socketReady = false;
            if (socket) {
                await socket.disconnect();
            }
        },

        isReady() {
            return !!web && socketReady;
        },

        async send(text, replyToId) {
            const { channel, ts } = replyToId ? unpackId(replyToId) : {};
            const targetChannel = channel || dmChannelId;
            if (!targetChannel) {
                console.log('  ⚠️ Slack send: no channel context and no DM fallback, skipping');
                return null;
            }
            const opts = {
                channel: targetChannel,
                text: truncateSlack(text),
            };
            if (ts) {
                opts.thread_ts = ts;
            }
            const result = await web.chat.postMessage(opts);
            return packId(targetChannel, result.ts);
        },

        async sendFile(filePath, caption, replyToId) {
            const { channel, ts } = replyToId ? unpackId(replyToId) : {};
            const targetChannel = channel || dmChannelId;
            if (!targetChannel) return null;
            try {
                const result = await web.filesUploadV2({
                    channel_id: targetChannel,
                    file: readFileSync(filePath),
                    filename: path.basename(filePath),
                    initial_comment: caption || undefined,
                    thread_ts: ts || undefined,
                });
                // filesUploadV2 returns file info, not a message ts
                return null;
            } catch (e) {
                console.log(`  ⚠️ Slack sendFile failed: ${e.message}`);
                return null;
            }
        },

        async edit(msgId, text) {
            const { channel, ts } = unpackId(msgId);
            if (!channel || !ts) return false;
            try {
                await web.chat.update({
                    channel,
                    ts,
                    text: truncateSlack(text),
                });
                return true;
            } catch (e) {
                if (e.data?.error === 'message_not_found') return false;
                return false;
            }
        },

        async pin(msgId) {
            const { channel, ts } = unpackId(msgId);
            if (!channel || !ts) return;
            try {
                await web.pins.add({ channel, timestamp: ts });
            } catch (e) {
                if (e.data?.error !== 'already_pinned') {
                    console.log(`  ⚠️ Could not pin Slack message: ${e.message}`);
                }
            }
        },

        async unpin(msgId) {
            const { channel, ts } = unpackId(msgId);
            if (!channel || !ts) return;
            try {
                await web.pins.remove({ channel, timestamp: ts });
            } catch {}
        },

        async deleteMsg(msgId) {
            const { channel, ts } = unpackId(msgId);
            if (!channel || !ts) return;
            try {
                await web.chat.delete({ channel, ts });
            } catch {}
        },

        async downloadMedia(rawMsg) {
            try {
                if (!rawMsg.files || rawMsg.files.length === 0) return null;
                const file = rawMsg.files[0];

                const url = file.url_private_download || file.url_private;
                if (!url) return null;

                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${botToken}` },
                });
                if (!res.ok) return null;
                const buffer = Buffer.from(await res.arrayBuffer());

                if (file.mimetype && file.mimetype.startsWith('image/')) {
                    const ext = file.mimetype === 'image/png' ? 'png'
                        : file.mimetype === 'image/webp' ? 'webp'
                        : 'jpg';
                    const filePath = path.join(TMP_DIR, `img-${Date.now()}.${ext}`);
                    writeFileSync(filePath, buffer);
                    return { filePath, mimetype: file.mimetype };
                }

                if (file.mimetype && file.mimetype.startsWith('audio/')) {
                    const ext = file.filetype || 'webm';
                    const filePath = path.join(TMP_DIR, `voice-${Date.now()}.${ext}`);
                    writeFileSync(filePath, buffer);
                    return { filePath, mimetype: file.mimetype };
                }

                return null;
            } catch (e) {
                console.log(`  ⚠️ Could not download Slack media: ${e.message}`);
                return null;
            }
        },

        async getQuotedMessage(rawMsg) {
            if (!rawMsg.thread_ts || rawMsg.thread_ts === rawMsg.ts) return null;

            try {
                const result = await web.conversations.replies({
                    channel: rawMsg.channel,
                    ts: rawMsg.thread_ts,
                    limit: 1,
                    inclusive: true,
                });
                const parent = result.messages?.[0];
                if (!parent) return null;
                return {
                    id: packId(rawMsg.channel, parent.ts),
                    body: parent.text || '',
                };
            } catch {
                return null;
            }
        },

        async sendGoodbye() {
            if (dmChannelId && web) {
                try {
                    await web.chat.postMessage({
                        channel: dmChannelId,
                        text: '🐺 bark-pack is offline. byebye',
                    });
                } catch {}
            }
        },
    };

    return adapter;
}

// Encode channel + ts into a single prefixed ID: slack:C123:1234567890.123456
function packId(channel, ts) {
    return `slack:${channel}:${ts}`;
}

// Decode: 'slack:C123:1234567890.123456' → { channel: 'C123', ts: '1234567890.123456' }
function unpackId(msgId) {
    const s = String(msgId);
    const parts = s.replace(/^slack:/, '').split(':');
    if (parts.length >= 2) {
        return { channel: parts[0], ts: parts.slice(1).join(':') };
    }
    return { channel: null, ts: null };
}

function truncateSlack(text) {
    if (text.length > 4000) return text.substring(0, 3990) + '...';
    return text;
}

module.exports = { createSlackAdapter };
