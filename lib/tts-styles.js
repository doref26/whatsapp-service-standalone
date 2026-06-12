/**
 * Voice character presets — map mood/personality to prosody (+ optional voice).
 * Edge TTS: rate, pitch, volume. OpenAI: speed + voice selection.
 */
export const TTS_STYLES = {
  neutral: {
    label: 'Neutral',
    description: 'Default balanced tone',
    edge: { rate: '+0%', pitch: '+0Hz', volume: '+0%' },
    openai: { speed: 1.0, openaiVoice: 'nova' },
  },
  joyful: {
    label: 'Joyful',
    description: 'Upbeat, warm, slightly faster',
    edge: { rate: '+14%', pitch: '+10Hz', volume: '+6%' },
    openai: { speed: 1.12, openaiVoice: 'shimmer' },
  },
  sad: {
    label: 'Sad',
    description: 'Slower, softer, lower energy',
    edge: { rate: '-18%', pitch: '-10Hz', volume: '-12%' },
    openai: { speed: 0.82, openaiVoice: 'alloy' },
  },
  serious: {
    label: 'Serious',
    description: 'Measured, firm, authoritative',
    edge: { rate: '-10%', pitch: '-6Hz', volume: '+2%' },
    openai: { speed: 0.92, openaiVoice: 'onyx' },
  },
  deep: {
    label: 'Deep',
    description: 'Lower pitch, slower, resonant',
    edge: { rate: '-14%', pitch: '-18Hz', volume: '+4%', voice: 'he-IL-AvriNeural' },
    openai: { speed: 0.88, openaiVoice: 'onyx' },
  },
  calm: {
    label: 'Calm',
    description: 'Relaxed and steady',
    edge: { rate: '-12%', pitch: '-4Hz', volume: '-6%' },
    openai: { speed: 0.9, openaiVoice: 'nova' },
  },
  energetic: {
    label: 'Energetic',
    description: 'Fast, bright, expressive',
    edge: { rate: '+20%', pitch: '+12Hz', volume: '+8%' },
    openai: { speed: 1.18, openaiVoice: 'nova' },
  },
  gentle: {
    label: 'Gentle',
    description: 'Soft and caring',
    edge: { rate: '-6%', pitch: '+4Hz', volume: '-10%' },
    openai: { speed: 0.94, openaiVoice: 'shimmer' },
  },
  dramatic: {
    label: 'Dramatic',
    description: 'Slow with strong emphasis',
    edge: { rate: '-8%', pitch: '-12Hz', volume: '+10%' },
    openai: { speed: 0.86, openaiVoice: 'fable' },
  },
};

export function getStylePreset(styleName) {
  if (!styleName) return null;
  const key = String(styleName).toLowerCase().trim();
  return TTS_STYLES[key] || null;
}

export function listStylePresets() {
  return Object.entries(TTS_STYLES).map(([id, preset]) => ({
    id,
    label: preset.label,
    description: preset.description,
  }));
}

export function applyStylePreset(baseOptions, styleName, provider = 'edge') {
  const preset = getStylePreset(styleName);
  if (!preset) return baseOptions;

  const profile = provider === 'openai' ? preset.openai : preset.edge;
  const merged = { ...baseOptions, style: styleName.toLowerCase().trim() };

  if (profile.rate) merged.rate = profile.rate;
  if (profile.pitch) merged.pitch = profile.pitch;
  if (profile.volume) merged.volume = profile.volume;
  if (profile.voice && !baseOptions._voiceExplicit) merged.voice = profile.voice;
  if (profile.speed !== undefined) merged.speed = profile.speed;
  if (profile.openaiVoice && !baseOptions._openaiVoiceExplicit) merged.openaiVoice = profile.openaiVoice;

  return merged;
}
