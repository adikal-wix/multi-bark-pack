const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { writeFileSync } = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', '.bark-tmp');

function createWhatsAppAdapter({ groupName }) {
    let client = null;
    let groupChat = null;
    // Cache msg objects for edit/pin (WhatsApp msgs aren't reconstructible from ID)
    const msgCache = new Map();

    const adapter = {
        name: 'whatsapp',

        async initialize(onMessage) {
            client = new Client({
                authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
                puppeteer: {
                    headless: true,
                    handleSIGINT: false,
                    handleSIGTERM: false,
                    handleSIGHUP: false,
                    protocolTimeout: 120000, // 2 minutes timeout for slow connections
                },
            });

            client.on('qr', (qr) => {
                console.log('Scan this QR code with your WhatsApp:');
                qrcode.generate(qr, { small: true });
            });

            client.on('authenticated', () => {
                console.log('WhatsApp authenticated');
            });

            client.on('disconnected', (reason) => {
                console.log('WhatsApp disconnected:', reason);
            });

            return new Promise((resolve) => {
                client.on('ready', async () => {
                    console.log('WhatsApp connected');

                    const chats = await client.getChats();
                    groupChat = chats.find(c => c.isGroup && c.name === groupName);

                    if (groupChat) {
                        console.log(`WhatsApp listening on group: "${groupChat.name}"`);

                        // Unpin old status messages
                        try {
                            const pinned = await groupChat.getPinnedMessages();
                            for (const msg of pinned) {
                                if (msg.fromMe && (msg.body.startsWith('📋') || msg.body.startsWith('🐾'))) {
                                    try { await msg.unpin(); } catch {}
                                }
                            }
                        } catch (e) {
                            console.log(`  ⚠️ Could not clean old pins: ${e.message}`);
                        }
                    } else {
                        console.log(`WhatsApp group "${groupName}" not found. Available groups:`);
                        chats.filter(c => c.isGroup).forEach(c => console.log(`  - ${c.name}`));
                        console.log(`\nSet WA_GROUP env var or create a group named "${groupName}"`);
                    }

                    // Wire up message handler
                    client.on('message', async (msg) => {
                        const chat = await msg.getChat();
                        if (!chat.isGroup || chat.name !== groupName) return;
                        if (msg.fromMe) return;

                        const contact = await msg.getContact();
                        const sender = contact.pushname || contact.number;
                        const body = msg.body.trim();

                        // Determine media type
                        let hasMedia = msg.hasMedia;
                        let mediaType = null;
                        if (hasMedia) {
                            if (msg.type === 'image' || msg.type === 'sticker') mediaType = 'image';
                            else if (msg.type === 'ptt' || msg.type === 'audio') mediaType = 'voice';
                            else hasMedia = false; // unsupported media type
                        }

                        const normalized = {
                            id: 'wa:' + msg.id._serialized,
                            text: body,
                            sender,
                            senderId: contact.number || contact.id?.user || sender,
                            hasMedia,
                            mediaType,
                            isQuotedReply: msg.hasQuotedMsg,
                            raw: msg,
                            adapter,
                        };

                        onMessage(normalized);
                    });

                    resolve();
                });

                client.initialize();
            });
        },

        async destroy() {
            if (client) {
                await client.destroy();
            }
        },

        isReady() {
            return !!groupChat;
        },

        async send(text, replyToId) {
            if (!groupChat) throw new Error('WhatsApp not connected to group');
            const opts = {};
            if (replyToId) {
                opts.quotedMessageId = stripPrefix(replyToId);
            }
            const sent = await groupChat.sendMessage(text, opts);
            msgCache.set(sent.id._serialized, sent);
            return 'wa:' + sent.id._serialized;
        },

        async sendFile(filePath, caption, replyToId) {
            if (!groupChat) throw new Error('WhatsApp not connected to group');
            try {
                const media = MessageMedia.fromFilePath(filePath);
                const opts = {};
                if (caption) opts.caption = caption;
                if (replyToId) opts.quotedMessageId = stripPrefix(replyToId);
                const sent = await groupChat.sendMessage(media, opts);
                msgCache.set(sent.id._serialized, sent);
                return 'wa:' + sent.id._serialized;
            } catch (e) {
                console.log(`  ⚠️ WhatsApp sendFile failed: ${e.message}`);
                return null;
            }
        },

        async edit(msgId, text) {
            const rawId = stripPrefix(msgId);
            const cached = msgCache.get(rawId);
            if (!cached) return false;
            try {
                await cached.edit(text);
                return true;
            } catch {
                return false;
            }
        },

        async pin(msgId) {
            const rawId = stripPrefix(msgId);
            const cached = msgCache.get(rawId);
            if (cached) {
                try { await cached.pin(2592000); } catch (e) {
                    console.log(`  ⚠️ Could not pin message: ${e.message}`);
                }
            }
        },

        async unpin(msgId) {
            const rawId = stripPrefix(msgId);
            const cached = msgCache.get(rawId);
            if (cached) {
                try { await cached.unpin(); } catch {}
            }
        },

        async deleteMsg(msgId) {
            const rawId = stripPrefix(msgId);
            const cached = msgCache.get(rawId);
            if (cached) {
                try { await cached.delete(true); } catch {}
            }
        },

        async downloadMedia(rawMsg) {
            try {
                const media = await rawMsg.downloadMedia();
                if (!media || !media.data) return null;

                if (rawMsg.type === 'image' || rawMsg.type === 'sticker') {
                    const ext = media.mimetype === 'image/png' ? 'png'
                        : media.mimetype === 'image/webp' ? 'webp'
                        : 'jpg';
                    const filePath = path.join(TMP_DIR, `img-${Date.now()}.${ext}`);
                    writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                    return { filePath, mimetype: media.mimetype };
                }

                if (rawMsg.type === 'ptt' || rawMsg.type === 'audio') {
                    const filePath = path.join(TMP_DIR, `voice-${Date.now()}.ogg`);
                    writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                    return { filePath, mimetype: media.mimetype };
                }

                return null;
            } catch (e) {
                console.log(`  ⚠️ Could not download WhatsApp media: ${e.message}`);
                return null;
            }
        },

        async getQuotedMessage(rawMsg) {
            if (!rawMsg.hasQuotedMsg) return null;
            try {
                const quoted = await rawMsg.getQuotedMessage();
                return {
                    id: 'wa:' + quoted.id._serialized,
                    body: quoted.body || '',
                };
            } catch {
                return null;
            }
        },

        async sendGoodbye() {
            if (groupChat) {
                try {
                    await groupChat.sendMessage('🐺 bark-pack is offline. byebye');
                } catch {}
            }
        },
    };

    return adapter;
}

function stripPrefix(msgId) {
    if (msgId.startsWith('wa:')) return msgId.slice(3);
    return msgId;
}

module.exports = { createWhatsAppAdapter };
