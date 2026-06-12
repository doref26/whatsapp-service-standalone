import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import cors from 'cors';
import config from './config.js';
import TranscriptionService from './transcription.js';
import TextToSpeechService from './tts.js';
import WebSearchService from './web-search.js';
import { createIngressController } from './lib/ingress.js';
import { createAuthMiddleware } from './lib/auth.js';
import { WebhookDelivery } from './lib/webhook-delivery.js';
import { attachMessageHandler } from './lib/message-handler.js';
import { registerRoutes, saveWebhookUrlToEnv } from './lib/routes.js';
import { sendVoiceToChat } from './lib/voice-sender.js';
import { createServer } from 'net';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_FILE = join(__dirname, '.env');
const isWindows = process.platform === 'win32';

const transcriptionService = new TranscriptionService();
const ttsService = new TextToSpeechService();
const webSearch = new WebSearchService();
const ingress = createIngressController({ defaultSlackSec: 120, defaultMaxAgeSec: 600 });
const webhookDelivery = new WebhookDelivery(config, { dataDir: join(__dirname, '.data') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(createAuthMiddleware(config));

let whatsappClient = null;
let isClientReady = false;
let qrCodeData = null;
let initPhase = 'idle';
let initStartedAt = null;
let isInitializing = false;
let initializationAttempts = 0;
let client = null;

const INIT_TIMEOUT_MS = Number.parseInt(process.env.WHATSAPP_INIT_TIMEOUT_MS || '180000', 10);
const MAX_INIT_ATTEMPTS = 3;

function isStandaloneEchoEnabled() {
  if (config.bot.standaloneAutoReply) return true;
  return !(config.api.webhookUrl || '').trim();
}

function hasWwebjsSessionOnDisk() {
  return existsSync(join(__dirname, '.wwebjs_auth'));
}

function clearWwebjsSession() {
  for (const name of ['.wwebjs_auth', '.wwebjs_cache']) {
    const p = join(__dirname, name);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`[session] Removed ${p}`);
    }
  }
  qrCodeData = null;
}

function markClientReady(source) {
  if (isClientReady || !client) return;
  whatsappClient = client;
  isClientReady = true;
  initializationAttempts = 0;
  initPhase = 'ready';
  ingress.activate(source);
  console.log(`✅ WhatsApp client ready (${source})`);
}

function getClientState() {
  return {
    whatsappClient,
    isClientReady,
    qrCodeData,
    initPhase,
    initStartedAt,
    initializationAttempts,
    hasWwebjsSessionOnDisk,
  };
}

async function sendMessageToChat(chatId, text, replyToMessageId = null, mentionId = null) {
  if (!isClientReady || !whatsappClient) throw new Error('WhatsApp client is not ready');

  const chat = await whatsappClient.getChatById(chatId);
  if (!chat?.id?._serialized) throw new Error(`Chat not found for ID: ${chatId}`);

  const sendOptions = { sendSeen: false };
  if (replyToMessageId) sendOptions.quotedMessageId = replyToMessageId;
  if (mentionId) {
    sendOptions.mentions = [mentionId];
    text = `@${mentionId.split('@')[0]} ${text}`;
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  const sentMessage = await chat.sendMessage(text, sendOptions);
  return { success: true, messageId: sentMessage.id._serialized };
}

async function handleStandaloneAutoReply({ message, chat, senderId, messageBody }) {
  if (!isStandaloneEchoEnabled()) return;

  const triggerRegex = new RegExp(
    `\\b${config.bot.trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'i',
  );
  const shouldRespond = config.bot.respondToAll || triggerRegex.test(messageBody);
  if (!shouldRespond) return;

  let prompt = messageBody.replace(new RegExp(config.bot.trigger, 'gi'), '').trim();
  prompt = prompt.replace(/@\d{10,15}/g, '').trim();

  if (!prompt) {
    await sendMessageToChat(chat.id._serialized, '👋 Hi! Connect your backend via WEBHOOK_URL to handle messages with your LLM.');
    return;
  }

  try {
    await chat.sendStateTyping();
  } catch {
    // non-critical
  }

  let response;
  if (prompt.toLowerCase().startsWith('echo ')) {
    response = prompt.substring(5);
  } else if (webSearch.needsWebSearch(prompt)) {
    const searchQuery = webSearch.extractSearchQuery(prompt);
    const searchResult = await webSearch.search(searchQuery);
    response = searchResult
      ? `${searchResult.text}${searchResult.url ? `\n\n🔗 Source: ${searchResult.url}` : ''}`
      : '⚠️ Could not find information on the web.';
  } else {
    response = `📝 You said: "${prompt}"\n\n💡 Configure WEBHOOK_URL to forward messages to your LLM backend.`;
  }

  await sendMessageToChat(chat.id._serialized, response, message.id._serialized, senderId);
}

registerRoutes(app, {
  config,
  ingress,
  webhookDelivery,
  getClientState,
  sendMessageToChat,
  sendVoiceToChat: (args) => sendVoiceToChat({ ...args, ttsService }),
  MessageMedia,
  envFile: ENV_FILE,
  serviceDir: __dirname,
  restartWhatsAppClient,
});

const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--disable-hang-monitor',
  '--disable-prompt-on-repost',
  '--disable-sync',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
  '--no-pings',
  '--use-mock-keychain',
];

if (!isWindows) {
  puppeteerArgs.push('--no-zygote', '--single-process');
}

function createClient() {
  const sessionDir = join(__dirname, '.wwebjs_auth');
  const cdpPort = process.env.WHATSAPP_CDP_PORT || '9231';
  return new Client({
    authStrategy: new LocalAuth({ dataPath: sessionDir }),
    takeoverOnConflict: true,
    bypassCSP: true,
    authTimeoutMs: Number.parseInt(process.env.WHATSAPP_AUTH_TIMEOUT_MS || '120000', 10),
    qrMaxRetries: Number.parseInt(process.env.WHATSAPP_QR_MAX_RETRIES || '6', 10),
    puppeteer: {
      headless: !isWindows,
      args: [...puppeteerArgs, `--remote-debugging-port=${cdpPort}`],
      timeout: 120000,
      ignoreHTTPSErrors: true,
    },
  });
}

function attachEventHandlers() {
  if (!client) return;

  client.on('qr', (qr) => {
    initPhase = 'waiting_qr';
    console.log('📱 Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log(`💡 Or open: http://127.0.0.1:${config.api.port}/api/qr\n`);
    qrCodeData = qr;
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading WhatsApp: ${percent}% - ${message}`);
    if (percent >= 99 && !isClientReady) {
      setTimeout(() => markClientReady('loading_screen'), 3000);
    }
  });

  client.on('remote_session_saved', () => {
    console.log("💾 Session saved - you won't need to scan QR next time");
    qrCodeData = null;
  });

  client.on('authenticated', () => {
    initPhase = 'authenticating';
    console.log('✅ WhatsApp authenticated successfully!\n');
    qrCodeData = null;
    initializationAttempts = 0;
    setTimeout(() => {
      if (!isClientReady) {
        console.warn('⚠️ "ready" event not received; using authenticated fallback.');
        markClientReady('authenticated-fallback');
      }
    }, 5000);
  });

  client.on('auth_failure', (msg) => {
    initPhase = 'auth_failed';
    console.error('❌ Authentication failed:', msg);
    qrCodeData = null;
  });

  client.on('disconnected', (reason) => {
    console.error('❌ WhatsApp client disconnected:', reason);
    ingress.deactivate('disconnected');
    isClientReady = false;
    whatsappClient = null;

    if (reason === 'NAVIGATION' && initializationAttempts < MAX_INIT_ATTEMPTS) {
      setTimeout(() => initializeClient(), 5000);
    }
  });

  client.on('error', (error) => {
    console.error('❌ WhatsApp client error:', error.message);
    if (error.message.includes('Target closed') || error.message.includes('Protocol error')) {
      ingress.deactivate('client error');
      isClientReady = false;
      whatsappClient = null;
      setTimeout(() => {
        if (initializationAttempts < MAX_INIT_ATTEMPTS) initializeClient();
      }, 10000);
    }
  });

  client.on('ready', () => {
    markClientReady('ready');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║          ✅ WhatsApp Client Ready!                 ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    console.log(`Webhook: ${config.api.webhookUrl || 'polling via GET /api/webhook'}`);
    console.log(`API key required: ${Boolean((config.api.apiKey || '').trim())}`);
  });

  attachMessageHandler(client, {
    config,
    ingress,
    webhookDelivery,
    transcriptionService,
    sendMessageToChat,
    onAutoReply: handleStandaloneAutoReply,
  });

  client.on('change_state', (s) => {
    console.log(`[wwebjs] connection state: ${s}`);
    if (s === 'CONNECTED' && !isClientReady) {
      setTimeout(() => markClientReady('change_state-connected'), 2000);
    }
  });
}

async function initializeClient({ clearedSession = false } = {}) {
  if (isInitializing) return;
  isInitializing = true;
  ingress.deactivate('initializeClient');
  initializationAttempts++;
  initPhase = 'starting';
  initStartedAt = Date.now();
  isClientReady = false;
  whatsappClient = null;

  if (initializationAttempts > MAX_INIT_ATTEMPTS) {
    if (!clearedSession && hasWwebjsSessionOnDisk()) {
      clearWwebjsSession();
      initializationAttempts = 0;
      isInitializing = false;
      setTimeout(() => initializeClient({ clearedSession: true }), 3000);
      return;
    }
    initPhase = 'failed';
    isInitializing = false;
    return;
  }

  try {
    console.log(`🚀 Initializing WhatsApp client (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS})...`);
    if (client) {
      try {
        await client.destroy();
      } catch {
        // ignore
      }
    }

    client = createClient();
    attachEventHandlers();

    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`initialize timed out after ${INIT_TIMEOUT_MS / 1000}s`)), INIT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error('❌ Failed to initialize client:', error.message);
    initPhase = 'retrying';
    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
      isInitializing = false;
      setTimeout(() => initializeClient({ clearedSession }), initializationAttempts * 5000);
      return;
    }
    initPhase = 'failed';
  } finally {
    isInitializing = false;
  }
}

async function restartWhatsAppClient({ clearSession = false } = {}) {
  ingress.deactivate('restart');
  isClientReady = false;
  whatsappClient = null;
  qrCodeData = null;
  initializationAttempts = 0;
  initPhase = 'restarting';

  if (client) {
    try {
      await client.destroy();
    } catch {
      // ignore
    }
    client = null;
  }

  if (clearSession) clearWwebjsSession();
  await initializeClient({ clearedSession: clearSession });
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });
}

async function startHttpServer() {
  const host = process.env.WHATSAPP_BIND_HOST || (isWindows ? '127.0.0.1' : '0.0.0.0');
  const port = config.api.port;

  if (!(await isPortAvailable(port, host))) {
    console.error(`❌ Port ${port} is already in use on ${host}.`);
    process.exit(1);
  }

  await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`🌐 API Server started on http://${host}:${port}`);
      console.log(`   Voice settings: http://${host}:${port}/settings/voice`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

async function start() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║    📱 WhatsApp Service API (Standalone)            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`WEBHOOK_URL: ${config.api.webhookUrl || '(empty — use GET /api/webhook polling)'}`);

  if (!config.api.webhookUrl) {
    const backendPort = process.env.BACKEND_PORT || '3000';
    const defaultWebhookUrl = `http://127.0.0.1:${backendPort}/whatsapp/webhook`;
    console.log(`🔧 Auto-configuring webhook URL: ${defaultWebhookUrl}`);
    config.api.webhookUrl = defaultWebhookUrl;
    saveWebhookUrlToEnv(ENV_FILE, defaultWebhookUrl);
  }

  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    ingress.deactivate('SIGINT');
    webhookDelivery.stop();
    if (whatsappClient) await whatsappClient.destroy();
    process.exit(0);
  });

  await startHttpServer();
  await initializeClient();
}

start().catch((error) => {
  console.error('❌ Failed to start WhatsApp service:', error.message);
  process.exit(1);
});
