/**
 * Example external backend that receives WhatsApp messages and replies via the gateway API.
 *
 * Run:
 *   1. npm start          (WhatsApp service on port 3002)
 *   2. node integrations/example-backend.js   (this file on port 3000)
 *
 * Set in whatsapp-service .env:
 *   WEBHOOK_URL=http://127.0.0.1:3000/whatsapp/webhook
 *   API_KEY=dev-secret     (optional but recommended)
 */
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || process.env.BACKEND_PORT || 3000;
const WHATSAPP_API = process.env.WHATSAPP_API_URL || 'http://127.0.0.1:3003';
const API_KEY = process.env.API_KEY || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function whatsappHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return headers;
}

async function sendWhatsAppReply(chatId, message, replyToMessageId) {
  const response = await fetch(`${WHATSAPP_API}/api/send`, {
    method: 'POST',
    headers: whatsappHeaders(),
    body: JSON.stringify({ chatId, message, replyToMessageId }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Send failed (${response.status}): ${text}`);
  }
  return response.json();
}

/**
 * Replace this with your LLM call (OpenAI, Anthropic, local model, etc.)
 */
async function generateReply(message) {
  const userText = message.body?.trim();
  if (!userText) return 'I received your message but it had no text content.';

  // Simple echo bot — swap for real LLM integration
  return `You said: "${userText}"\n\n(This is the example backend — plug in your LLM here.)`;
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
    await sendWhatsAppReply(message.chat.id, reply, message.id);
    console.log(`[reply] Sent to ${message.chat.name}`);
  } catch (error) {
    console.error('[reply] Failed:', error.message);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Example backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Webhook: POST http://127.0.0.1:${PORT}/whatsapp/webhook`);
  console.log(`WhatsApp API: ${WHATSAPP_API}`);
});
