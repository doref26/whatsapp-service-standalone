import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolveTtsOptions } from './tts-options.js';

const TTS_ENV_KEYS = {
  provider: 'TTS_PROVIDER',
  voice: 'TTS_VOICE',
  style: 'TTS_STYLE',
  rate: 'TTS_RATE',
  pitch: 'TTS_PITCH',
  volume: 'TTS_VOLUME',
  openaiModel: 'OPENAI_TTS_MODEL',
  openaiVoice: 'OPENAI_TTS_VOICE',
  openaiSpeed: 'OPENAI_TTS_SPEED',
};

export function getTtsSettings(config) {
  const tts = config.tts || {};
  const resolved = resolveTtsOptions({}, config);

  return {
    provider: tts.provider || 'edge',
    voice: tts.voice || 'he-IL-HilaNeural',
    style: tts.style || 'neutral',
    rate: tts.rate || '',
    pitch: tts.pitch || '',
    volume: tts.volume || '',
    openaiModel: tts.openaiModel || 'tts-1',
    openaiVoice: tts.openaiVoice || 'nova',
    openaiSpeed: String(tts.openaiSpeed ?? 1.0),
    resolved: {
      voice: resolved.voice,
      rate: resolved.rate,
      pitch: resolved.pitch,
      volume: resolved.volume,
      speed: resolved.speed,
      openaiVoice: resolved.openaiVoice,
      style: resolved.style || 'neutral',
    },
  };
}

export function applyTtsToConfig(config, settings) {
  config.tts.provider = settings.provider || 'edge';
  config.tts.voice = settings.voice || 'he-IL-HilaNeural';
  config.tts.style = settings.style || '';
  config.tts.rate = settings.rate || '';
  config.tts.pitch = settings.pitch || '';
  config.tts.volume = settings.volume || '';
  config.tts.openaiModel = settings.openaiModel || 'tts-1';
  config.tts.openaiVoice = settings.openaiVoice || 'nova';
  config.tts.openaiSpeed = parseFloat(settings.openaiSpeed || '1.0');
}

function upsertEnvLines(envContent, updates) {
  const lines = envContent.split('\n');
  const updatedKeys = new Set();

  const newLines = lines.map((line) => {
    for (const [field, envKey] of Object.entries(TTS_ENV_KEYS)) {
      if (line.startsWith(`${envKey}=`)) {
        updatedKeys.add(envKey);
        const value = updates[field] ?? '';
        return `${envKey}=${value}`;
      }
    }
    return line;
  });

  for (const [field, envKey] of Object.entries(TTS_ENV_KEYS)) {
    if (!updatedKeys.has(envKey) && updates[field] !== undefined) {
      newLines.push(`${envKey}=${updates[field] ?? ''}`);
    }
  }

  return newLines.join('\n');
}

export function saveTtsSettings(envFile, config, settings) {
  let envContent = '';
  if (existsSync(envFile)) {
    envContent = readFileSync(envFile, 'utf-8');
  }

  const normalized = {
    provider: settings.provider || 'edge',
    voice: settings.voice || 'he-IL-HilaNeural',
    style: settings.style === 'neutral' ? '' : settings.style || '',
    rate: settings.rate || '',
    pitch: settings.pitch || '',
    volume: settings.volume || '',
    openaiModel: settings.openaiModel || 'tts-1',
    openaiVoice: settings.openaiVoice || 'nova',
    openaiSpeed: String(settings.openaiSpeed || '1.0'),
  };

  writeFileSync(envFile, upsertEnvLines(envContent, normalized), 'utf-8');
  applyTtsToConfig(config, normalized);

  return getTtsSettings(config);
}
