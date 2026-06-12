/**
 * Example external backend that receives WhatsApp messages and replies via the gateway API.
 *
 * Replace generateReply() with your LLM — return ONLY the text to send (no logs/meta).
 */
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || process.env.BACKEND_PORT || 3000;
const WHATSAPP_API = process.env.WHATSAPP_API_URL || 'http://127.0.0.1:3003';
const API_KEY = process.env.API_KEY || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const REPLY_WITH_VOICE = process.env.REPLY_WITH_VOICE === 'true';

function whatsappHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return headers;
}

function buildVoiceOptions() {
  const options = {};
  if (process.env.TTS_STYLE) options.style = process.env.TTS_STYLE;
  if (process.env.TTS_VOICE) options.voice = process.env.TTS_VOICE;
  if (process.env.TTS_RATE) options.rate = process.env.TTS_RATE;
  if (process.env.TTS_PITCH) options.pitch = process.env.TTS_PITCH;
  if (process.env.TTS_VOLUME) options.volume = process.env.TTS_VOLUME;
  if (process.env.OPENAI_TTS_VOICE) options.openaiVoice = process.env.OPENAI_TTS_VOICE;
  if (process.env.OPENAI_TTS_SPEED) options.speed = process.env.OPENAI_TTS_SPEED;
  return options;
}

async function sendWhatsAppReply(chatId, message, replyToMessageId, { asVoice = false } = {}) {
  const endpoint = asVoice ? '/api/send-voice' : '/api/send';
  const body = { chatId, message, replyToMessageId };
  if (asVoice) Object.assign(body, buildVoiceOptions());

  const response = await fetch(`${WHATSAPP_API}${endpoint}`, {
    method: 'POST',
    headers: whatsappHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Send failed (${response.status}): ${text}`);
  }
  return response.json();
}

/**
 * Return ONLY the message text to send to the user.
 * Plug your LLM here — do not include debug/meta text.
 */
async function generateReply(message) {
  const userText = message.body?.trim();
  if (!userText) return null;

  // TODO: replace with your LLM call
  return userText;
}

app.post('/whatsapp/webhook', async (req, res) => {
  if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const message = req.body;
  console.log(`[webhook] ${message.from?.name}: ${message.body?.substring(0, 80)}`);

  res.json({ received: true });

  try {
    const reply = await generateReply(message);
    if (!reply) return;

    const replyAsVoice = REPLY_WITH_VOICE || message.type === 'voice';
    await sendWhatsAppReply(message.chat.id, reply, message.id, { asVoice: replyAsVoice });
    console.log(`[reply] Sent ${replyAsVoice ? 'voice' : 'text'} to ${message.chat.name}`);
  } catch (error) {
    console.error('[reply] Failed:', error.message);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Example backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Webhook: POST http://127.0.0.1:${PORT}/whatsapp/webhook`);
  console.log(`WhatsApp API: ${WHATSAPP_API}`);
  console.log(`Voice replies: ${REPLY_WITH_VOICE ? 'always' : 'when inbound message is voice'}`);
});
