import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { sendVoiceToChat } from './voice-sender.js';
import { extractTtsOptionsFromBody, HEBREW_VOICES, OPENAI_VOICES, listStylePresets, resolveTtsOptions } from './tts-options.js';
import { getTtsSettings, saveTtsSettings } from './tts-settings-store.js';

/**
 * Register all REST API routes for the WhatsApp gateway service.
 */
export function registerRoutes(app, deps) {
  const {
    config,
    ingress,
    webhookDelivery,
    getClientState,
    sendMessageToChat,
    sendVoiceToChat: sendVoiceFn,
    MessageMedia,
    envFile,
    serviceDir,
    restartWhatsAppClient,
  } = deps;

  const sendVoice = sendVoiceFn || sendVoiceToChat;

  app.get('/health', (_req, res) => {
    const state = getClientState();
    res.json({
      ok: state.isClientReady,
      status: state.isClientReady ? 'ready' : 'initializing',
    });
  });

  app.get('/api/status', (_req, res) => {
    const state = getClientState();
    res.json({
      status: state.isClientReady ? 'ready' : 'initializing',
      whatsappReady: state.isClientReady,
      acceptInboundMessages: ingress.acceptInboundMessages,
      ingestSinceUnix: ingress.ingestSinceUnix || null,
      initPhase: state.initPhase,
      initStartedAt: state.initStartedAt,
      initAttempts: state.initializationAttempts,
      qrCodeAvailable: Boolean(state.qrCodeData),
      sessionOnDisk: state.hasWwebjsSessionOnDisk?.() ?? false,
      apiPort: config.api.port,
      webhookConfigured: Boolean(config.api.webhookUrl),
      webhookUrl: config.api.webhookUrl || null,
      apiKeyRequired: Boolean((config.api.apiKey || '').trim()),
      targetGroupName: config.whatsapp.targetGroupName || null,
      allowedChatIds: config.whatsapp.allowedChatIds || [],
      queuedMessages: webhookDelivery.queuedCount,
      qrUrl: `http://127.0.0.1:${config.api.port}/api/qr`,
      voiceSettingsUrl: `http://127.0.0.1:${config.api.port}/settings/voice`,
      processCwd: process.cwd(),
      serviceDir,
    });
  });

  app.post('/api/restart', async (_req, res) => {
    try {
      void restartWhatsAppClient({ clearSession: false });
      res.json({ ok: true, message: 'Restarting WhatsApp client...' });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/reset-session', async (_req, res) => {
    try {
      void restartWhatsAppClient({ clearSession: true });
      res.json({
        ok: true,
        message: 'Session cleared. Open /api/qr to scan within ~30 seconds.',
        qrUrl: `http://127.0.0.1:${config.api.port}/api/qr`,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/webhook', (_req, res) => {
    const messages = webhookDelivery.drainQueue();
    res.json({ messages });
  });

  app.get('/api/qr', (req, res) => {
    const state = getClientState();

    if (state.isClientReady) {
      return res.json({
        ready: true,
        message: 'WhatsApp client is already connected. No QR code needed.',
      });
    }

    if (!state.qrCodeData) {
      return res.json({
        available: false,
        message: 'QR code not generated yet. Please wait...',
      });
    }

    if (typeof state.renderQrPage === 'function') {
      return state.renderQrPage(req, res);
    }

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(state.qrCodeData)}`;
    res.send(buildQrHtmlPage(qrImageUrl));
  });

  app.post('/api/webhook', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Webhook URL is required' });

    webhookDelivery.setWebhookUrl(url);
    saveWebhookUrlToEnv(envFile, url);
    console.log(`✅ Webhook URL updated: ${url}`);

    res.json({
      success: true,
      webhookUrl: url,
      message: 'Webhook URL configured. Incoming messages will be forwarded to this URL.',
    });
  });

  app.get('/settings/voice', (_req, res) => {
    res.sendFile(join(serviceDir, 'public', 'voice-settings.html'));
  });

  app.get('/api/tts/settings', (_req, res) => {
    res.json(getTtsSettings(config));
  });

  app.post('/api/tts/settings/preview', (req, res) => {
    const overrides = extractTtsOptionsFromBody(req.body);
    const previewConfig = {
      tts: {
        ...config.tts,
        provider: overrides.provider || config.tts.provider,
        voice: overrides.voice || config.tts.voice,
        style: overrides.style ?? config.tts.style,
        rate: overrides.rate !== undefined ? overrides.rate : config.tts.rate,
        pitch: overrides.pitch !== undefined ? overrides.pitch : config.tts.pitch,
        volume: overrides.volume !== undefined ? overrides.volume : config.tts.volume,
      },
    };
    const resolved = resolveTtsOptions({}, previewConfig);
    res.json({
      resolved: {
        style: resolved.style || overrides.style || config.tts.style || 'neutral',
        voice: resolved.voice,
        rate: resolved.rate,
        pitch: resolved.pitch,
        volume: resolved.volume,
        speed: resolved.speed,
      },
    });
  });

  app.post('/api/tts/settings', (req, res) => {
    try {
      const saved = saveTtsSettings(envFile, config, req.body);
      console.log(`💾 TTS settings updated: style=${saved.style || 'neutral'}, voice=${saved.voice}`);
      res.json(saved);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/tts/voices', (_req, res) => {
    res.json({
      provider: config.tts.provider,
      current: {
        style: config.tts.style || 'neutral',
        voice: config.tts.voice,
        rate: config.tts.rate || '(from style preset)',
        pitch: config.tts.pitch || '(from style preset)',
        volume: config.tts.volume || '(from style preset)',
        openaiVoice: config.tts.openaiVoice,
        openaiSpeed: config.tts.openaiSpeed,
      },
      styles: listStylePresets(),
      edge: {
        voices: HEBREW_VOICES,
        rate: 'Override preset, e.g. +10% or -15%',
        pitch: 'Override preset, e.g. +5Hz or -10Hz',
        volume: 'Override preset, e.g. +10% or -20%',
      },
      openai: {
        voices: OPENAI_VOICES,
        speed: '0.25 to 4.0 (default from style preset)',
      },
      usage: {
        env: 'TTS_STYLE=joyful',
        api: 'POST /api/send-voice with { "style": "serious", "message": "..." }',
        ui: '/settings/voice',
      },
    });
  });

  app.post('/api/send', async (req, res) => {
    try {
      const state = getClientState();
      if (!state.isClientReady) {
        return res.status(503).json({ error: 'WhatsApp client is not ready', status: 'initializing' });
      }

      const { chatId, message, replyToMessageId, mentionId, asVoice } = req.body;
      if (!chatId || !message) {
        return res.status(400).json({ error: 'chatId and message are required' });
      }

      if (asVoice) {
        const result = await sendVoice({
          whatsappClient: state.whatsappClient,
          MessageMedia,
          chatId,
          text: message,
          replyToMessageId,
          ttsOptions: extractTtsOptionsFromBody(req.body),
        });
        return res.json(result);
      }

      const result = await sendMessageToChat(chatId, message, replyToMessageId, mentionId);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/send-voice', async (req, res) => {
    try {
      const state = getClientState();
      if (!state.isClientReady || !state.whatsappClient) {
        return res.status(503).json({ error: 'WhatsApp client is not ready', status: 'initializing' });
      }

      const { chatId, message, replyToMessageId } = req.body;
      if (!chatId || !message) {
        return res.status(400).json({ error: 'chatId and message are required' });
      }

      const result = await sendVoice({
        whatsappClient: state.whatsappClient,
        MessageMedia,
        chatId,
        text: message,
        replyToMessageId,
        ttsOptions: extractTtsOptionsFromBody(req.body),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/send-media', async (req, res) => {
    try {
      const state = getClientState();
      if (!state.isClientReady || !state.whatsappClient) {
        return res.status(503).json({ error: 'WhatsApp client is not ready', status: 'initializing' });
      }

      const { chatId, mediaUrl, caption } = req.body;
      if (!chatId || !mediaUrl) {
        return res.status(400).json({ error: 'chatId and mediaUrl are required' });
      }

      const chat = await state.whatsappClient.getChatById(chatId);
      const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      if (caption) media.caption = caption;

      const sentMessage = await chat.sendMessage(media, { sendSeen: false });
      res.json({ success: true, messageId: sentMessage.id._serialized });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/send-poll', async (req, res) => {
    try {
      const state = getClientState();
      if (!state.isClientReady || !state.whatsappClient) {
        return res.status(503).json({ error: 'WhatsApp client is not ready', status: 'initializing' });
      }

      const { chatId, title, options, replyToMessageId } = req.body;
      if (!chatId || !title || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({
          error: 'chatId, title, and options (array with 2+ items) are required',
        });
      }

      const chat = await state.whatsappClient.getChatById(chatId);
      const pollText = `📊 *${title}*\n\n${options.map((opt, idx) => `${idx + 1}️⃣ ${opt}`).join('\n')}\n\n💡 Reply with the number to vote!`;
      const sendOptions = { sendSeen: false };
      if (replyToMessageId) sendOptions.quotedMessageId = replyToMessageId;

      const pollMessage = await chat.sendMessage(pollText, sendOptions);
      res.json({ success: true, messageId: pollMessage.id._serialized });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/chats', async (_req, res) => {
    try {
      const state = getClientState();
      if (!state.isClientReady || !state.whatsappClient) {
        return res.status(503).json({ error: 'WhatsApp client is not ready', status: 'initializing' });
      }

      const chats = await state.whatsappClient.getChats();
      res.json({
        chats: chats.map((chat) => ({
          id: chat.id._serialized,
          name: chat.name,
          isGroup: chat.isGroup,
          unreadCount: chat.unreadCount,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

function saveWebhookUrlToEnv(envFile, url) {
  try {
    let envContent = '';
    if (existsSync(envFile)) {
      envContent = readFileSync(envFile, 'utf-8');
    }

    const lines = envContent.split('\n');
    let found = false;
    const updatedLines = lines.map((line) => {
      if (line.startsWith('WEBHOOK_URL=')) {
        found = true;
        return `WEBHOOK_URL=${url}`;
      }
      return line;
    });

    if (!found) updatedLines.push(`WEBHOOK_URL=${url}`);
    writeFileSync(envFile, updatedLines.join('\n'), 'utf-8');
    console.log('💾 Webhook URL saved to .env file');
  } catch (error) {
    console.error(`⚠️  Failed to save webhook URL to .env: ${error.message}`);
  }
}

function buildQrHtmlPage(qrImageUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp QR Code</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #eef2ff; }
    .container { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.15); text-align: center; color: #333; max-width: 420px; }
    h1 { color: #25D366; margin-top: 0; }
    img { border: 4px solid #25D366; border-radius: 0.5rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WhatsApp QR Code</h1>
    <img src="${qrImageUrl}" alt="QR Code" width="300" height="300" />
    <p><strong>Scan with WhatsApp → Linked Devices → Link a Device</strong></p>
    <p style="color:#888;font-size:0.9rem;">Page refreshes every 5 seconds.</p>
  </div>
</body>
</html>`;
}

export { saveWebhookUrlToEnv };
