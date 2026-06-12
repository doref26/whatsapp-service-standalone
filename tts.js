import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import config from './config.js';
import { resolveTtsOptions } from './lib/tts-options.js';
import { resolvePythonExecutable, resolveFfmpegExecutable, buildMediaExecEnv } from './lib/media-env.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

class TextToSpeechService {
  getProviderName() {
    return config.tts.provider;
  }

  async synthesizeToOgg(text, overrides = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('Text is required for voice synthesis');

    const options = resolveTtsOptions(overrides, config);
    const mp3Path = join(tmpdir(), `whatsapp-tts-${Date.now()}.mp3`);
    const oggPath = join(tmpdir(), `whatsapp-tts-${Date.now()}.ogg`);

    try {
      if (options.provider === 'openai' && config.tts.openaiApiKey) {
        await this.synthesizeWithOpenAI(trimmed, mp3Path, options);
      } else {
        await this.synthesizeWithEdgeTts(trimmed, mp3Path, options);
      }

      await this.convertMp3ToOggOpus(mp3Path, oggPath);
      return oggPath;
    } finally {
      try {
        unlinkSync(mp3Path);
      } catch {
        // ignore
      }
    }
  }

  async synthesizeWithEdgeTts(text, outputPath, options) {
    console.log(`🔊 Synthesizing voice [${options.style || 'neutral'}] (${options.voice}, rate ${options.rate}, pitch ${options.pitch})...`);
    const scriptPath = join(__dirname, 'tts-synthesize.py');
    const pythonExe = resolvePythonExecutable();
    const textPath = join(tmpdir(), `whatsapp-tts-text-${Date.now()}.txt`);
    const optionsPath = join(tmpdir(), `whatsapp-tts-options-${Date.now()}.json`);

    writeFileSync(textPath, text, 'utf-8');
    writeFileSync(
      optionsPath,
      JSON.stringify({
        voice: options.voice,
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume,
      }),
      'utf-8',
    );

    try {
      await execFileAsync(
        pythonExe,
        [scriptPath, textPath, outputPath, optionsPath],
        { maxBuffer: 1024 * 1024 * 10, env: buildMediaExecEnv(), windowsHide: true },
      );
    } finally {
      for (const p of [textPath, optionsPath]) {
        try {
          unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  }

  async synthesizeWithOpenAI(text, outputPath, options) {
    const { default: fetch } = await import('node-fetch');
    console.log(`🔊 Synthesizing voice (OpenAI ${options.openaiVoice}, speed ${options.speed})...`);

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.tts.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.openaiModel,
        input: text,
        voice: options.openaiVoice,
        speed: options.speed,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS error ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(outputPath, buffer);
  }

  async convertMp3ToOggOpus(inputPath, outputPath) {
    const ffmpegExe = resolveFfmpegExecutable();
    await execFileAsync(
      ffmpegExe,
      ['-y', '-i', inputPath, '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', outputPath],
      { env: buildMediaExecEnv(), windowsHide: true },
    );
  }
}

export default TextToSpeechService;
