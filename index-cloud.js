import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import config from './config.js';
import TranscriptionService from './transcription.js';
import { createIngressController } from './lib/ingress.js';
import { createAuthMiddleware } from './lib/auth.js';
import { WebhookDelivery } from './lib/webhook-delivery.js';
import { attachMessageHandler } from './lib/message-handler.js';
import { registerRoutes } from './lib/routes.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSION_DIR = process.env.SESSION_DIR || '/tmp/.wwebjs_auth';

const transcriptionService = new TranscriptionService();
const ingress = createIngressController({ defaultSlackSec: 5, defaultMaxAgeSec: 600 });
const webhookDelivery = new WebhookDelivery(config, { dataDir: join(__dirname, '.data') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(createAuthMiddleware(config));

let whatsappClient = null;
let isClientReady = false;
let qrCodeData = null;

function getClientState() {
  return {
    whatsappClient,
    isClientReady,
    qrCodeData,
    initPhase: isClientReady ? 'ready' : qrCodeData ? 'waiting_qr' : 'starting',
    initStartedAt: null,
    initializationAttempts: 0,
    hasWwebjsSessionOnDisk: () => false,
    renderQrPage: (_req, res) => {
      if (typeof qrCodeData === 'string' && qrCodeData.startsWith('data:')) {
        res.send(`<!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;min-height:100vh;">
          <div style="text-align:center"><h1>WhatsApp QR</h1><img src="${qrCodeData}" alt="QR" width="300"/></div></body></html>`);
      } else {
        res.json({ qr: qrCodeData });
      }
    },
  };
}

async function sendMessageToChat(chatId, text, replyToMessageId = null) {
  if (!isClientReady || !whatsappClient) throw new Error('WhatsApp client is not ready');
  const chat = await whatsappClient.getChatById(chatId);
  const sendOptions = { sendSeen: false };
  if (replyToMessageId) sendOptions.quotedMessageId = replyToMessageId;
  const sentMessage = await chat.sendMessage(text, sendOptions);
  return { success: true, messageId: sentMessage.id._serialized };
}

registerRoutes(app, {
  config,
  ingress,
  webhookDelivery,
  getClientState,
  sendMessageToChat,
  MessageMedia,
  envFile: join(__dirname, '.env'),
  serviceDir: __dirname,
  restartWhatsAppClient: async () => {
    throw new Error('Restart not supported in cloud mode — redeploy the service');
  },
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  },
});

console.log('╔════════════════════════════════════════════════════╗');
console.log('║    📱 WhatsApp Service API (Cloud)                   ║');
console.log('╚════════════════════════════════════════════════════╝\n');
console.log(`📁 Session directory: ${SESSION_DIR}`);

client.on('qr', async (qr) => {
  try {
    qrCodeData = await qrcode.toDataURL(qr);
    console.log('✅ QR code ready at GET /api/qr');
  } catch {
    qrCodeData = qr;
  }
});

client.on('ready', () => {
  whatsappClient = client;
  isClientReady = true;
  qrCodeData = null;
  ingress.activate('ready');
  console.log('✅ WhatsApp client ready (cloud)');
});

attachMessageHandler(client, {
  config,
  ingress,
  webhookDelivery,
  transcriptionService,
  sendMessageToChat,
});

client.on('authenticated', () => {
  qrCodeData = null;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
  qrCodeData = null;
});

client.on('disconnected', (reason) => {
  console.error('❌ Disconnected:', reason);
  ingress.deactivate('disconnected');
  isClientReady = false;
  whatsappClient = null;
});

const port = config.api.port;
app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 API listening on 0.0.0.0:${port}`);
  client.initialize().catch((error) => {
    console.error('❌ Failed to initialize WhatsApp client:', error.message);
  });
});

process.on('SIGTERM', async () => {
  webhookDelivery.stop();
  if (client) await client.destroy();
  process.exit(0);
});
