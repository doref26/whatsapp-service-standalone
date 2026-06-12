import { applyStylePreset, listStylePresets, TTS_STYLES } from './tts-styles.js';

/**
 * Merge default TTS settings from config with style presets and per-request overrides.
 */
export function resolveTtsOptions(overrides = {}, config) {
  const tts = config.tts || {};
  const provider = overrides.provider || tts.provider || 'edge';

  let options = {
    voice: tts.voice || 'he-IL-HilaNeural',
    rate: tts.rate || '+0%',
    pitch: tts.pitch || '+0Hz',
    volume: tts.volume || '+0%',
    speed: parseFloat(tts.openaiSpeed ?? 1.0),
    provider,
    openaiVoice: tts.openaiVoice || 'nova',
    openaiModel: tts.openaiModel || 'tts-1',
    style: null,
  };

  const styleName = overrides.style || tts.style || null;
  if (styleName) {
    options = applyStylePreset(options, styleName, provider);
  }

  if (overrides.voice) {
    options.voice = overrides.voice;
  }
  if (overrides.rate) options.rate = overrides.rate;
  if (overrides.pitch) options.pitch = overrides.pitch;
  if (overrides.volume) options.volume = overrides.volume;
  if (overrides.speed !== undefined && overrides.speed !== '') {
    options.speed = parseFloat(overrides.speed);
  }
  if (overrides.openaiVoice) options.openaiVoice = overrides.openaiVoice;
  if (overrides.openaiModel) options.openaiModel = overrides.openaiModel;
  if (overrides.provider) options.provider = overrides.provider;

  return options;
}

export function extractTtsOptionsFromBody(body = {}) {
  const options = {};
  for (const key of [
    'style',
    'voice',
    'rate',
    'pitch',
    'volume',
    'speed',
    'openaiVoice',
    'openaiModel',
    'provider',
  ]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      options[key] = body[key];
    }
  }
  return options;
}

export const HEBREW_VOICES = [
  { id: 'he-IL-HilaNeural', label: 'Hila (female)', locale: 'he-IL' },
  { id: 'he-IL-AvriNeural', label: 'Avri (male)', locale: 'he-IL' },
];

export const OPENAI_VOICES = [
  { id: 'alloy', label: 'Alloy' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx (deep)' },
  { id: 'nova', label: 'Nova' },
  { id: 'shimmer', label: 'Shimmer (warm)' },
];

export { listStylePresets, TTS_STYLES };
