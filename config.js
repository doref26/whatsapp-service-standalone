import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.warn(`[config] Could not read .env at ${envPath}: ${envResult.error.message}`);
} else {
  console.log(`[config] Loaded environment from ${envPath}`);
}

function parseCsv(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  whatsapp: {
    targetGroupName: process.env.TARGET_GROUP_NAME || '',
    allowedChatIds: parseCsv(process.env.ALLOWED_CHAT_IDS),
  },

  bot: {
    trigger: process.env.BOT_TRIGGER || '@bot',
    respondToAll: process.env.RESPOND_TO_ALL === 'true',
    standaloneAutoReply: process.env.STANDALONE_BOT_AUTO_REPLY === 'true',
  },

  whisper: {
    model: process.env.WHISPER_MODEL || 'base',
    language: process.env.WHISPER_LANGUAGE || '',
    provider: process.env.TRANSCRIPTION_PROVIDER || 'whisper',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },

  tts: {
    provider: process.env.TTS_PROVIDER || 'edge',
    voice: process.env.TTS_VOICE || 'he-IL-HilaNeural',
    style: process.env.TTS_STYLE || '',
    rate: process.env.TTS_RATE || '',
    pitch: process.env.TTS_PITCH || '',
    volume: process.env.TTS_VOLUME || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_TTS_MODEL || 'tts-1',
    openaiVoice: process.env.OPENAI_TTS_VOICE || 'nova',
    openaiSpeed: parseFloat(process.env.OPENAI_TTS_SPEED || '1.0'),
  },

  webhook: {
    includeMediaBase64: process.env.WEBHOOK_INCLUDE_MEDIA !== 'false',
    secret: process.env.WEBHOOK_SECRET || '',
  },

  api: {
    port: parseInt(process.env.PORT || process.env.API_PORT, 10) || 3002,
    webhookUrl: (process.env.WEBHOOK_URL || '').trim(),
    apiKey: process.env.API_KEY || '',
  },
};

export default config;
